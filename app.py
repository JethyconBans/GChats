from __future__ import annotations

import hmac
import json
import os
import re
import secrets
import sqlite3
import threading
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path
from typing import Any, Callable, TypeVar

from dotenv import load_dotenv
from flask import (
    Flask,
    flash,
    redirect,
    render_template,
    request,
    session,
    url_for,
)
from flask_socketio import SocketIO, emit, join_room, leave_room
from werkzeug.security import check_password_hash, generate_password_hash

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_DB = BASE_DIR / "instance" / "friends.db"
DATABASE_PATH = Path(os.getenv("DATABASE_PATH", str(DEFAULT_DB)))
DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)

GROUP_ROOM = "friends-group"
CALL_ROOM = "friends-call"
USERNAME_RE = re.compile(r"^[A-Za-z0-9_]{3,24}$")

app = Flask(__name__)
app.config.update(
    SECRET_KEY=os.getenv("SECRET_KEY", "change-this-before-public-deployment"),
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.getenv("COOKIE_SECURE", "false").lower() == "true",
    PERMANENT_SESSION_LIFETIME=timedelta(days=14),
)

# Threading mode is simple and compatible with Gunicorn's threaded worker.
socketio = SocketIO(app, async_mode="threading")

state_lock = threading.Lock()
sid_to_username: dict[str, str] = {}
username_to_sids: dict[str, set[str]] = {}
call_participants: dict[str, str] = {}
active_call: dict[str, str] | None = None

F = TypeVar("F", bound=Callable[..., Any])


def db_connect() -> sqlite3.Connection:
    connection = sqlite3.connect(DATABASE_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA journal_mode = WAL")
    return connection


def init_db() -> None:
    with db_connect() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                body TEXT NOT NULL,
                sent_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_messages_sent_at
            ON messages(sent_at);
            """
        )


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def csrf_token() -> str:
    token = session.get("_csrf_token")
    if not token:
        token = secrets.token_urlsafe(32)
        session["_csrf_token"] = token
    return token


app.jinja_env.globals["csrf_token"] = csrf_token


def valid_csrf() -> bool:
    expected = session.get("_csrf_token", "")
    received = request.form.get("csrf_token", "")
    return bool(expected and received and hmac.compare_digest(expected, received))


def login_required(view: F) -> F:
    @wraps(view)
    def wrapped(*args: Any, **kwargs: Any) -> Any:
        if "user_id" not in session:
            return redirect(url_for("login"))
        return view(*args, **kwargs)

    return wrapped  # type: ignore[return-value]


def current_user() -> sqlite3.Row | None:
    user_id = session.get("user_id")
    if not user_id:
        return None
    with db_connect() as db:
        return db.execute(
            "SELECT id, username, created_at FROM users WHERE id = ?", (user_id,)
        ).fetchone()


def all_members() -> list[str]:
    with db_connect() as db:
        rows = db.execute(
            "SELECT username FROM users ORDER BY username COLLATE NOCASE"
        ).fetchall()
    return [str(row["username"]) for row in rows]


def recent_messages(limit: int = 100) -> list[dict[str, Any]]:
    with db_connect() as db:
        rows = db.execute(
            """
            SELECT messages.id, users.username, messages.body, messages.sent_at
            FROM messages
            JOIN users ON users.id = messages.user_id
            ORDER BY messages.id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return [dict(row) for row in reversed(rows)]


def public_ice_servers() -> list[dict[str, Any]]:
    """Return WebRTC ICE servers sent to browsers.

    ICE_SERVERS_JSON can contain a JSON list, for example:
    [{"urls":"stun:stun.example.com:3478"},
     {"urls":"turn:turn.example.com:3478","username":"u","credential":"p"}]
    """
    raw = os.getenv("ICE_SERVERS_JSON", "").strip()
    if raw:
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return parsed
        except json.JSONDecodeError:
            app.logger.warning("ICE_SERVERS_JSON is invalid JSON; using default STUN.")
    return [{"urls": "stun:stun.l.google.com:19302"}]


@app.route("/")
def index() -> Any:
    if session.get("user_id"):
        return redirect(url_for("chat"))
    return redirect(url_for("login"))


@app.route("/register", methods=["GET", "POST"])
def register() -> Any:
    if session.get("user_id"):
        return redirect(url_for("chat"))

    if request.method == "POST":
        if not valid_csrf():
            flash("The form expired. Please try again.", "error")
            return redirect(url_for("register"))

        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        invite_code = request.form.get("invite_code", "")
        expected_invite = os.getenv("INVITE_CODE", "KULOT-FRIENDS-2026")

        if not USERNAME_RE.fullmatch(username):
            flash("Username must be 3–24 characters using letters, numbers, or _.", "error")
        elif len(password) < 8:
            flash("Password must contain at least 8 characters.", "error")
        elif not hmac.compare_digest(invite_code, expected_invite):
            flash("The invite code is incorrect.", "error")
        else:
            try:
                with db_connect() as db:
                    cursor = db.execute(
                        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
                        (username, generate_password_hash(password), utc_now()),
                    )
                    user_id = cursor.lastrowid

                session.clear()
                session["user_id"] = user_id
                session["username"] = username
                session.permanent = True
                csrf_token()
                flash("Welcome! You are now in the friends chat.", "success")
                return redirect(url_for("chat"))
            except sqlite3.IntegrityError:
                flash("That username is already taken.", "error")

    return render_template("register.html")


@app.route("/login", methods=["GET", "POST"])
def login() -> Any:
    if session.get("user_id"):
        return redirect(url_for("chat"))

    if request.method == "POST":
        if not valid_csrf():
            flash("The form expired. Please try again.", "error")
            return redirect(url_for("login"))

        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")

        with db_connect() as db:
            user = db.execute(
                "SELECT id, username, password_hash FROM users WHERE username = ? COLLATE NOCASE",
                (username,),
            ).fetchone()

        if not user or not check_password_hash(user["password_hash"], password):
            flash("Invalid username or password.", "error")
        else:
            session.clear()
            session["user_id"] = user["id"]
            session["username"] = user["username"]
            session.permanent = True
            csrf_token()
            return redirect(url_for("chat"))

    return render_template("login.html")


@app.post("/logout")
@login_required
def logout() -> Any:
    if not valid_csrf():
        flash("The form expired. Please try again.", "error")
        return redirect(url_for("chat"))
    session.clear()
    return redirect(url_for("login"))


@app.route("/chat")
@login_required
def chat() -> Any:
    user = current_user()
    if not user:
        session.clear()
        return redirect(url_for("login"))

    app_data = {
        "username": user["username"],
        "members": all_members(),
        "messages": recent_messages(),
        "iceServers": public_ice_servers(),
    }
    return render_template("group.html", app_data=app_data)


@app.route("/group")
@login_required
def group() -> Any:
    # Keep old links working, but the application now opens the chat directly.
    return redirect(url_for("chat"))


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


def socket_username() -> str | None:
    user_id = session.get("user_id")
    username = session.get("username")
    if not user_id or not username:
        return None
    return str(username)


def online_usernames() -> list[str]:
    with state_lock:
        return sorted(username_to_sids.keys(), key=str.lower)


def call_snapshot_unlocked() -> dict[str, Any] | None:
    if not active_call:
        return None
    return {
        **active_call,
        "participant_count": len(call_participants),
    }


def call_snapshot() -> dict[str, Any] | None:
    with state_lock:
        return call_snapshot_unlocked()


def broadcast_online_users() -> None:
    socketio.emit(
        "online_users",
        {"users": online_usernames(), "members": all_members()},
        to=GROUP_ROOM,
    )


def broadcast_call_state() -> None:
    socketio.emit("call_state", {"call": call_snapshot()}, to=GROUP_ROOM)


@socketio.on("connect")
def handle_connect(auth: Any = None) -> bool | None:
    del auth
    username = socket_username()
    if not username:
        return False

    sid = request.sid
    with state_lock:
        sid_to_username[sid] = username
        username_to_sids.setdefault(username, set()).add(sid)
    join_room(GROUP_ROOM)
    emit("call_state", {"call": call_snapshot()})
    broadcast_online_users()
    return None


@socketio.on("disconnect")
def handle_disconnect() -> None:
    global active_call

    sid = request.sid
    departed_call_username: str | None = None
    call_ended = False

    with state_lock:
        username = sid_to_username.pop(sid, None)
        if username:
            user_sids = username_to_sids.get(username)
            if user_sids:
                user_sids.discard(sid)
                if not user_sids:
                    username_to_sids.pop(username, None)

        departed_call_username = call_participants.pop(sid, None)
        if departed_call_username and not call_participants:
            active_call = None
            call_ended = True

    if departed_call_username:
        socketio.emit(
            "peer_left",
            {"sid": sid, "username": departed_call_username},
            to=CALL_ROOM,
            skip_sid=sid,
        )

    if call_ended:
        socketio.emit("call_ended", {}, to=GROUP_ROOM)
    elif departed_call_username:
        broadcast_call_state()

    broadcast_online_users()


@socketio.on("send_message")
def handle_send_message(payload: Any) -> None:
    username = socket_username()
    user_id = session.get("user_id")
    if not username or not user_id:
        return

    body = ""
    if isinstance(payload, dict):
        body = str(payload.get("body", "")).strip()

    if not body:
        return
    if len(body) > 1000:
        emit("chat_error", {"message": "Messages are limited to 1,000 characters."})
        return

    sent_at = utc_now()
    with db_connect() as db:
        cursor = db.execute(
            "INSERT INTO messages (user_id, body, sent_at) VALUES (?, ?, ?)",
            (user_id, body, sent_at),
        )
        message_id = cursor.lastrowid

    socketio.emit(
        "new_message",
        {
            "id": message_id,
            "username": username,
            "body": body,
            "sent_at": sent_at,
        },
        to=GROUP_ROOM,
    )


@socketio.on("start_group_call")
def handle_start_group_call(payload: Any) -> None:
    global active_call

    username = socket_username()
    if not username:
        return

    mode = "audio"
    if isinstance(payload, dict) and payload.get("mode") == "video":
        mode = "video"

    sid = request.sid
    with state_lock:
        if active_call:
            existing_call = call_snapshot_unlocked()
        else:
            active_call = {
                "mode": mode,
                "started_by": username,
                "started_at": utc_now(),
            }
            peers: list[dict[str, str]] = []
            call_participants[sid] = username
            existing_call = None
            started_call = call_snapshot_unlocked()

    if existing_call:
        emit("call_already_active", {"call": existing_call})
        return

    join_room(CALL_ROOM)
    emit("call_peers", {"peers": peers, "mode": mode})
    socketio.emit("call_started", {"call": started_call}, to=GROUP_ROOM)


@socketio.on("join_call")
def handle_join_call() -> None:
    username = socket_username()
    if not username:
        return

    sid = request.sid
    with state_lock:
        if not active_call:
            emit("call_start_error", {"message": "This call has already ended."})
            return
        if sid in call_participants:
            return
        peers = [
            {"sid": peer_sid, "username": peer_username}
            for peer_sid, peer_username in call_participants.items()
        ]
        call_participants[sid] = username
        mode = str(active_call["mode"])

    join_room(CALL_ROOM)
    emit("call_peers", {"peers": peers, "mode": mode})
    socketio.emit(
        "peer_joined",
        {"sid": sid, "username": username},
        to=CALL_ROOM,
        skip_sid=sid,
    )
    broadcast_call_state()


@socketio.on("leave_call")
def handle_leave_call() -> None:
    global active_call

    sid = request.sid
    call_ended = False
    with state_lock:
        username = call_participants.pop(sid, None)
        if username and not call_participants:
            active_call = None
            call_ended = True

    leave_room(CALL_ROOM)
    if username:
        socketio.emit(
            "peer_left",
            {"sid": sid, "username": username},
            to=CALL_ROOM,
            skip_sid=sid,
        )

    if call_ended:
        socketio.emit("call_ended", {}, to=GROUP_ROOM)
    elif username:
        broadcast_call_state()


def relay_to_peer(event_name: str, payload: Any) -> None:
    if not isinstance(payload, dict):
        return
    target = str(payload.get("target", ""))
    data = payload.get("data")
    if not target:
        return

    with state_lock:
        sender_username = call_participants.get(request.sid)
        target_exists = target in call_participants
    if not sender_username or not target_exists:
        return

    socketio.emit(
        event_name,
        {
            "from": request.sid,
            "username": sender_username,
            "data": data,
        },
        to=target,
    )


@socketio.on("webrtc_offer")
def handle_webrtc_offer(payload: Any) -> None:
    relay_to_peer("webrtc_offer", payload)


@socketio.on("webrtc_answer")
def handle_webrtc_answer(payload: Any) -> None:
    relay_to_peer("webrtc_answer", payload)


@socketio.on("webrtc_ice")
def handle_webrtc_ice(payload: Any) -> None:
    relay_to_peer("webrtc_ice", payload)


init_db()

if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=True)
