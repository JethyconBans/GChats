from __future__ import annotations

import hmac
import json
import os
import re
import secrets
import sqlite3
import threading
import uuid
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path
from typing import Any, Callable, TypeVar

from dotenv import load_dotenv
from flask import (
    Flask,
    flash,
    jsonify,
    redirect,
    render_template,
    request,
    send_from_directory,
    session,
    url_for,
)
from flask_socketio import SocketIO, emit, join_room, leave_room
from werkzeug.exceptions import RequestEntityTooLarge
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_DB = BASE_DIR / "instance" / "friends.db"
DATABASE_PATH = Path(os.getenv("DATABASE_PATH", str(DEFAULT_DB)))
DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", str(BASE_DIR / "instance" / "uploads")))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
MAX_UPLOAD_MB = max(1, int(os.getenv("MAX_UPLOAD_MB", "25")))

GROUP_ROOM = "friends-group"
CALL_ROOM = "friends-call"
USERNAME_RE = re.compile(r"^[A-Za-z0-9_]{3,24}$")
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".webm", ".ogg", ".mov", ".m4v"}
ALLOWED_REACTIONS = ("👍", "❤️", "😂", "😮", "😢", "😡", "🎉")

app = Flask(__name__)
app.config.update(
    SECRET_KEY=os.getenv("SECRET_KEY", "change-this-before-public-deployment"),
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.getenv("COOKIE_SECURE", "false").lower() == "true",
    PERMANENT_SESSION_LIFETIME=timedelta(days=int(os.getenv("REMEMBER_DAYS", "90"))),
    SESSION_REFRESH_EACH_REQUEST=True,
    MAX_CONTENT_LENGTH=(MAX_UPLOAD_MB + 1) * 1024 * 1024,
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
                body TEXT NOT NULL DEFAULT '',
                sent_at TEXT NOT NULL,
                message_type TEXT NOT NULL DEFAULT 'text',
                attachment_url TEXT,
                attachment_name TEXT,
                attachment_mime TEXT,
                reply_to_id INTEGER,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (reply_to_id) REFERENCES messages(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS message_reactions (
                message_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                emoji TEXT NOT NULL,
                created_at TEXT NOT NULL,
                PRIMARY KEY (message_id, user_id),
                FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_messages_sent_at
            ON messages(sent_at);

            CREATE INDEX IF NOT EXISTS idx_reactions_message
            ON message_reactions(message_id);
            """
        )

        # Upgrade databases created by earlier versions without deleting messages.
        existing_columns = {
            str(row["name"])
            for row in db.execute("PRAGMA table_info(messages)").fetchall()
        }
        migrations = {
            "message_type": "ALTER TABLE messages ADD COLUMN message_type TEXT NOT NULL DEFAULT 'text'",
            "attachment_url": "ALTER TABLE messages ADD COLUMN attachment_url TEXT",
            "attachment_name": "ALTER TABLE messages ADD COLUMN attachment_name TEXT",
            "attachment_mime": "ALTER TABLE messages ADD COLUMN attachment_mime TEXT",
            "reply_to_id": "ALTER TABLE messages ADD COLUMN reply_to_id INTEGER",
        }
        for column_name, statement in migrations.items():
            if column_name not in existing_columns:
                db.execute(statement)


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


def reaction_summaries(message_ids: list[int]) -> dict[int, list[dict[str, Any]]]:
    if not message_ids:
        return {}

    placeholders = ",".join("?" for _ in message_ids)
    with db_connect() as db:
        rows = db.execute(
            f"""
            SELECT message_reactions.message_id, message_reactions.emoji, users.username
            FROM message_reactions
            JOIN users ON users.id = message_reactions.user_id
            WHERE message_reactions.message_id IN ({placeholders})
            ORDER BY message_reactions.created_at, users.username COLLATE NOCASE
            """,
            tuple(message_ids),
        ).fetchall()

    grouped: dict[int, dict[str, list[str]]] = {}
    for row in rows:
        message_id = int(row["message_id"])
        emoji = str(row["emoji"])
        grouped.setdefault(message_id, {}).setdefault(emoji, []).append(str(row["username"]))

    result: dict[int, list[dict[str, Any]]] = {}
    for message_id, emoji_users in grouped.items():
        result[message_id] = [
            {"emoji": emoji, "count": len(users), "users": users}
            for emoji, users in emoji_users.items()
        ]
    return result


def reply_preview_from_row(row: sqlite3.Row | dict[str, Any]) -> dict[str, Any] | None:
    reply_id = row["reply_to_id"] if "reply_to_id" in row.keys() else None
    if not reply_id:
        return None
    return {
        "id": int(reply_id),
        "username": str(row["reply_username"] or "Friend"),
        "body": str(row["reply_body"] or ""),
        "message_type": str(row["reply_message_type"] or "text"),
        "attachment_name": row["reply_attachment_name"],
    }


def recent_messages(limit: int = 100) -> list[dict[str, Any]]:
    with db_connect() as db:
        rows = db.execute(
            """
            SELECT messages.id, users.username, messages.body, messages.sent_at,
                   messages.message_type, messages.attachment_url,
                   messages.attachment_name, messages.attachment_mime,
                   messages.reply_to_id, reply_users.username AS reply_username,
                   replied.body AS reply_body, replied.message_type AS reply_message_type,
                   replied.attachment_name AS reply_attachment_name
            FROM messages
            JOIN users ON users.id = messages.user_id
            LEFT JOIN messages AS replied ON replied.id = messages.reply_to_id
            LEFT JOIN users AS reply_users ON reply_users.id = replied.user_id
            ORDER BY messages.id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()

    ordered = list(reversed(rows))
    summaries = reaction_summaries([int(row["id"]) for row in ordered])
    return [
        message_payload(
            int(row["id"]),
            str(row["username"]),
            str(row["body"]),
            str(row["sent_at"]),
            str(row["message_type"]),
            row["attachment_url"],
            row["attachment_name"],
            row["attachment_mime"],
            reply_to=reply_preview_from_row(row),
            reactions=summaries.get(int(row["id"]), []),
        )
        for row in ordered
    ]


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


def message_payload(
    message_id: int,
    username: str,
    body: str,
    sent_at: str,
    message_type: str = "text",
    attachment_url: str | None = None,
    attachment_name: str | None = None,
    attachment_mime: str | None = None,
    reply_to: dict[str, Any] | None = None,
    reactions: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    return {
        "id": message_id,
        "username": username,
        "body": body,
        "sent_at": sent_at,
        "message_type": message_type,
        "attachment_url": attachment_url,
        "attachment_name": attachment_name,
        "attachment_mime": attachment_mime,
        "reply_to": reply_to,
        "reactions": reactions or [],
    }


def get_reply_preview(reply_to_id: int | None) -> dict[str, Any] | None:
    if not reply_to_id:
        return None
    with db_connect() as db:
        row = db.execute(
            """
            SELECT messages.id AS reply_to_id, users.username AS reply_username,
                   messages.body AS reply_body, messages.message_type AS reply_message_type,
                   messages.attachment_name AS reply_attachment_name
            FROM messages
            JOIN users ON users.id = messages.user_id
            WHERE messages.id = ?
            """,
            (reply_to_id,),
        ).fetchone()
    return reply_preview_from_row(row) if row else None


def parse_message_id(value: Any) -> int | None:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def save_message(
    user_id: int,
    username: str,
    body: str,
    message_type: str = "text",
    attachment_url: str | None = None,
    attachment_name: str | None = None,
    attachment_mime: str | None = None,
    reply_to_id: int | None = None,
) -> dict[str, Any]:
    reply_to = get_reply_preview(reply_to_id)
    valid_reply_id = int(reply_to["id"]) if reply_to else None
    sent_at = utc_now()
    with db_connect() as db:
        cursor = db.execute(
            """
            INSERT INTO messages (
                user_id, body, sent_at, message_type, attachment_url,
                attachment_name, attachment_mime, reply_to_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                body,
                sent_at,
                message_type,
                attachment_url,
                attachment_name,
                attachment_mime,
                valid_reply_id,
            ),
        )
        message_id = int(cursor.lastrowid)

    return message_payload(
        message_id,
        username,
        body,
        sent_at,
        message_type,
        attachment_url,
        attachment_name,
        attachment_mime,
        reply_to=reply_to,
        reactions=[],
    )


def classify_upload(filename: str, mimetype: str) -> tuple[str, str] | None:
    extension = Path(filename).suffix.lower()
    normalized_mime = mimetype.lower().split(";", 1)[0].strip()

    if extension in ALLOWED_IMAGE_EXTENSIONS and normalized_mime.startswith("image/"):
        return "image", extension
    if extension in ALLOWED_VIDEO_EXTENSIONS and normalized_mime.startswith("video/"):
        return "video", extension
    return None


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
        remember_me = request.form.get("remember_me") == "on"

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
            session.permanent = remember_me
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
        "csrfToken": csrf_token(),
        "maxUploadMb": MAX_UPLOAD_MB,
    }
    return render_template("group.html", app_data=app_data)


@app.route("/group")
@login_required
def group() -> Any:
    # Keep old links working, but the application now opens the chat directly.
    return redirect(url_for("chat"))


@app.post("/api/messages/upload")
@login_required
def upload_message() -> Any:
    expected_csrf = session.get("_csrf_token", "")
    received_csrf = request.headers.get("X-CSRF-Token", "")
    if not expected_csrf or not received_csrf or not hmac.compare_digest(expected_csrf, received_csrf):
        return jsonify({"error": "The upload session expired. Refresh the page and try again."}), 403

    user = current_user()
    if not user:
        return jsonify({"error": "Please log in again."}), 401

    uploaded = request.files.get("file")
    if not uploaded or not uploaded.filename:
        return jsonify({"error": "Choose a picture or video first."}), 400

    original_name = secure_filename(uploaded.filename)
    if not original_name:
        return jsonify({"error": "That filename is not supported."}), 400

    classification = classify_upload(original_name, uploaded.mimetype or "")
    if not classification:
        return jsonify({"error": "Only JPG, PNG, GIF, WEBP, MP4, WEBM, OGG, MOV, and M4V files are allowed."}), 400

    message_type, extension = classification
    stored_name = f"{uuid.uuid4().hex}{extension}"
    destination = UPLOAD_DIR / stored_name
    uploaded.save(destination)

    body = request.form.get("caption", "").strip()
    reply_to_id = parse_message_id(request.form.get("reply_to_id"))
    if len(body) > 1000:
        destination.unlink(missing_ok=True)
        return jsonify({"error": "Captions are limited to 1,000 characters."}), 400

    attachment_url = url_for("uploaded_file", filename=stored_name)
    payload = save_message(
        int(user["id"]),
        str(user["username"]),
        body,
        message_type=message_type,
        attachment_url=attachment_url,
        attachment_name=original_name,
        attachment_mime=uploaded.mimetype or None,
        reply_to_id=reply_to_id,
    )
    socketio.emit("new_message", payload, to=GROUP_ROOM)
    return jsonify({"message": payload}), 201


@app.get("/uploads/<path:filename>")
@login_required
def uploaded_file(filename: str) -> Any:
    response = send_from_directory(str(UPLOAD_DIR), filename)
    response.headers["Cache-Control"] = "private, max-age=86400"
    return response


@app.get("/sw.js")
def service_worker() -> Any:
    response = send_from_directory(str(BASE_DIR / "static"), "sw.js")
    response.headers["Cache-Control"] = "no-cache"
    response.headers["Service-Worker-Allowed"] = "/"
    return response


@app.errorhandler(RequestEntityTooLarge)
def upload_too_large(error: RequestEntityTooLarge) -> Any:
    del error
    if request.path.startswith("/api/messages/upload"):
        return jsonify({"error": f"The file is too large. Maximum size is {MAX_UPLOAD_MB} MB."}), 413
    return "File too large", 413


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
    reply_to_id: int | None = None
    if isinstance(payload, dict):
        body = str(payload.get("body", "")).strip()
        reply_to_id = parse_message_id(payload.get("reply_to_id"))

    if not body:
        return
    if len(body) > 1000:
        emit("chat_error", {"message": "Messages are limited to 1,000 characters."})
        return

    payload = save_message(int(user_id), username, body, reply_to_id=reply_to_id)
    socketio.emit("new_message", payload, to=GROUP_ROOM)


@socketio.on("toggle_reaction")
def handle_toggle_reaction(payload: Any) -> None:
    username = socket_username()
    user_id = session.get("user_id")
    if not username or not user_id or not isinstance(payload, dict):
        return

    message_id = parse_message_id(payload.get("message_id"))
    emoji = str(payload.get("emoji", ""))
    if not message_id or emoji not in ALLOWED_REACTIONS:
        emit("chat_error", {"message": "That reaction is not supported."})
        return

    with db_connect() as db:
        message_exists = db.execute(
            "SELECT 1 FROM messages WHERE id = ?", (message_id,)
        ).fetchone()
        if not message_exists:
            emit("chat_error", {"message": "That message is no longer available."})
            return

        existing = db.execute(
            "SELECT emoji FROM message_reactions WHERE message_id = ? AND user_id = ?",
            (message_id, int(user_id)),
        ).fetchone()

        if existing and str(existing["emoji"]) == emoji:
            db.execute(
                "DELETE FROM message_reactions WHERE message_id = ? AND user_id = ?",
                (message_id, int(user_id)),
            )
        elif existing:
            db.execute(
                """
                UPDATE message_reactions
                SET emoji = ?, created_at = ?
                WHERE message_id = ? AND user_id = ?
                """,
                (emoji, utc_now(), message_id, int(user_id)),
            )
        else:
            db.execute(
                """
                INSERT INTO message_reactions (message_id, user_id, emoji, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (message_id, int(user_id), emoji, utc_now()),
            )

    reactions = reaction_summaries([message_id]).get(message_id, [])
    socketio.emit(
        "reaction_updated",
        {"message_id": message_id, "reactions": reactions},
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
