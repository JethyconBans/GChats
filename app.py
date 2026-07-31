from __future__ import annotations

import hmac
import json
import mimetypes
import os
import re
import secrets
import sqlite3
import threading
import uuid
from io import BytesIO
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path
from typing import Any, Callable, TypeVar

import psycopg
from psycopg.rows import dict_row

import cloudinary
import cloudinary.uploader
from dotenv import load_dotenv
from flask import (
    Flask,
    flash,
    jsonify,
    redirect,
    render_template,
    request,
    send_file,
    send_from_directory,
    session,
    url_for,
)
from flask_socketio import SocketIO, emit, join_room, leave_room
from werkzeug.exceptions import RequestEntityTooLarge
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename

load_dotenv()


def get_int_env(name: str, default: int) -> int:
    value = os.getenv(name, "").strip()
    if not value:
        return default
    try:
        return int(value)
    except ValueError:
        return default


BASE_DIR = Path(__file__).resolve().parent
DEFAULT_DB = BASE_DIR / "instance" / "friends.db"
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
USE_POSTGRES = DATABASE_URL.startswith(("postgres://", "postgresql://"))
DATABASE_PATH = Path(os.getenv("DATABASE_PATH", str(DEFAULT_DB)))
if not USE_POSTGRES:
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", str(BASE_DIR / "instance" / "uploads")))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
PROFILE_UPLOAD_DIR = UPLOAD_DIR / "profiles"
PROFILE_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
GROUP_UPLOAD_DIR = UPLOAD_DIR / "groups"
GROUP_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
MAX_UPLOAD_MB = max(1, get_int_env("MAX_UPLOAD_MB", 25))
PROFILE_MAX_UPLOAD_MB = max(1, min(10, get_int_env("PROFILE_MAX_UPLOAD_MB", 5)))
HISTORY_PAGE_SIZE = max(20, min(100, get_int_env("HISTORY_PAGE_SIZE", 50)))
REMEMBER_DAYS = max(1, get_int_env("REMEMBER_DAYS", 90))
CLOUDINARY_URL = os.getenv("CLOUDINARY_URL", "").strip()
USE_CLOUDINARY = bool(CLOUDINARY_URL)
if USE_CLOUDINARY:
    cloudinary.config(secure=True)

GLOBAL_ROOM = "all-users"
DEFAULT_GROUP_NAME = os.getenv("DEFAULT_GROUP_NAME", "Kulot Friends").strip() or "Kulot Friends"
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
    PERMANENT_SESSION_LIFETIME=timedelta(days=REMEMBER_DAYS),
    SESSION_REFRESH_EACH_REQUEST=True,
    MAX_CONTENT_LENGTH=(MAX_UPLOAD_MB + 1) * 1024 * 1024,
)

# Threading mode is simple and compatible with Gunicorn's threaded worker.
socketio = SocketIO(app, async_mode="threading")

state_lock = threading.RLock()
sid_to_username: dict[str, str] = {}
sid_to_user_id: dict[str, int] = {}
username_to_sids: dict[str, set[str]] = {}
active_calls: dict[int, dict[str, str]] = {}
call_participants: dict[int, dict[str, str]] = {}
sid_call_conversation: dict[str, int] = {}

F = TypeVar("F", bound=Callable[..., Any])


DbRow = sqlite3.Row | dict[str, Any]


def db_connect() -> sqlite3.Connection | psycopg.Connection[Any]:
    """Use cloud Postgres when DATABASE_URL exists; otherwise use local SQLite."""
    if USE_POSTGRES:
        return psycopg.connect(DATABASE_URL, row_factory=dict_row)

    connection = sqlite3.connect(DATABASE_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA journal_mode = WAL")
    return connection


def db_execute(
    db: sqlite3.Connection | psycopg.Connection[Any],
    query: str,
    params: tuple[Any, ...] = (),
) -> Any:
    if USE_POSTGRES:
        query = query.replace("?", "%s")
    return db.execute(query, params)


def insert_and_get_id(
    db: sqlite3.Connection | psycopg.Connection[Any],
    query: str,
    params: tuple[Any, ...],
) -> int:
    if USE_POSTGRES:
        clean_query = query.strip().rstrip(";") + " RETURNING id"
        row = db_execute(db, clean_query, params).fetchone()
        if not row:
            raise RuntimeError("The database did not return the new row ID.")
        return int(row["id"])

    cursor = db_execute(db, query, params)
    return int(cursor.lastrowid)


def init_sqlite_db() -> None:
    with db_connect() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL,
                profile_picture_url TEXT,
                profile_picture_public_id TEXT,
                note_text TEXT,
                note_expires_at TEXT,
                bio_text TEXT,
                last_seen_at TEXT
            );

            CREATE TABLE IF NOT EXISTS conversations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                profile_picture_url TEXT,
                profile_picture_public_id TEXT,
                conversation_type TEXT NOT NULL,
                created_by INTEGER,
                created_at TEXT NOT NULL,
                direct_key TEXT,
                is_default INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS conversation_members (
                conversation_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                joined_at TEXT NOT NULL,
                PRIMARY KEY (conversation_id, user_id),
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id INTEGER,
                user_id INTEGER NOT NULL,
                body TEXT NOT NULL DEFAULT '',
                sent_at TEXT NOT NULL,
                message_type TEXT NOT NULL DEFAULT 'text',
                attachment_url TEXT,
                attachment_name TEXT,
                attachment_mime TEXT,
                reply_to_id INTEGER,
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
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

            CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_direct_key
                ON conversations(direct_key) WHERE direct_key IS NOT NULL;
            CREATE INDEX IF NOT EXISTS idx_conversation_members_user
                ON conversation_members(user_id);
            CREATE INDEX IF NOT EXISTS idx_messages_sent_at ON messages(sent_at);
            CREATE INDEX IF NOT EXISTS idx_reactions_message ON message_reactions(message_id);
            """
        )

        existing_user_columns = {
            str(row["name"]) for row in db.execute("PRAGMA table_info(users)").fetchall()
        }
        user_migrations = {
            "profile_picture_url": "ALTER TABLE users ADD COLUMN profile_picture_url TEXT",
            "profile_picture_public_id": "ALTER TABLE users ADD COLUMN profile_picture_public_id TEXT",
            "note_text": "ALTER TABLE users ADD COLUMN note_text TEXT",
            "note_expires_at": "ALTER TABLE users ADD COLUMN note_expires_at TEXT",
            "bio_text": "ALTER TABLE users ADD COLUMN bio_text TEXT",
            "last_seen_at": "ALTER TABLE users ADD COLUMN last_seen_at TEXT",
        }
        for column_name, statement in user_migrations.items():
            if column_name not in existing_user_columns:
                db.execute(statement)

        existing_conversation_columns = {
            str(row["name"]) for row in db.execute("PRAGMA table_info(conversations)").fetchall()
        }
        conversation_migrations = {
            "profile_picture_url": "ALTER TABLE conversations ADD COLUMN profile_picture_url TEXT",
            "profile_picture_public_id": "ALTER TABLE conversations ADD COLUMN profile_picture_public_id TEXT",
        }
        for column_name, statement in conversation_migrations.items():
            if column_name not in existing_conversation_columns:
                db.execute(statement)

        existing_columns = {
            str(row["name"]) for row in db.execute("PRAGMA table_info(messages)").fetchall()
        }
        migrations = {
            "conversation_id": "ALTER TABLE messages ADD COLUMN conversation_id INTEGER",
            "message_type": "ALTER TABLE messages ADD COLUMN message_type TEXT NOT NULL DEFAULT 'text'",
            "attachment_url": "ALTER TABLE messages ADD COLUMN attachment_url TEXT",
            "attachment_name": "ALTER TABLE messages ADD COLUMN attachment_name TEXT",
            "attachment_mime": "ALTER TABLE messages ADD COLUMN attachment_mime TEXT",
            "reply_to_id": "ALTER TABLE messages ADD COLUMN reply_to_id INTEGER",
        }
        for column_name, statement in migrations.items():
            if column_name not in existing_columns:
                db.execute(statement)

        db.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
            ON messages(conversation_id, id)
            """
        )


def init_postgres_db() -> None:
    statements = [
        """
        CREATE TABLE IF NOT EXISTS users (
            id BIGSERIAL PRIMARY KEY,
            username VARCHAR(24) NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL,
            profile_picture_url TEXT,
            profile_picture_public_id TEXT,
            note_text TEXT,
            note_expires_at TEXT,
            bio_text TEXT,
            last_seen_at TEXT
        )
        """,
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users (LOWER(username))",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_picture_url TEXT",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_picture_public_id TEXT",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS note_text TEXT",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS note_expires_at TEXT",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS bio_text TEXT",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TEXT",
        """
        CREATE TABLE IF NOT EXISTS conversations (
            id BIGSERIAL PRIMARY KEY,
            name TEXT,
            profile_picture_url TEXT,
            profile_picture_public_id TEXT,
            conversation_type TEXT NOT NULL,
            created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
            created_at TEXT NOT NULL,
            direct_key TEXT,
            is_default BOOLEAN NOT NULL DEFAULT FALSE
        )
        """,
        "ALTER TABLE conversations ADD COLUMN IF NOT EXISTS profile_picture_url TEXT",
        "ALTER TABLE conversations ADD COLUMN IF NOT EXISTS profile_picture_public_id TEXT",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_direct_key ON conversations(direct_key) WHERE direct_key IS NOT NULL",
        """
        CREATE TABLE IF NOT EXISTS conversation_members (
            conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
            user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            joined_at TEXT NOT NULL,
            PRIMARY KEY (conversation_id, user_id)
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS messages (
            id BIGSERIAL PRIMARY KEY,
            conversation_id BIGINT REFERENCES conversations(id) ON DELETE CASCADE,
            user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            body TEXT NOT NULL DEFAULT '',
            sent_at TEXT NOT NULL,
            message_type TEXT NOT NULL DEFAULT 'text',
            attachment_url TEXT,
            attachment_name TEXT,
            attachment_mime TEXT,
            reply_to_id BIGINT REFERENCES messages(id) ON DELETE SET NULL
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS message_reactions (
            message_id BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
            user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            emoji TEXT NOT NULL,
            created_at TEXT NOT NULL,
            PRIMARY KEY (message_id, user_id)
        )
        """,
        "ALTER TABLE messages ADD COLUMN IF NOT EXISTS conversation_id BIGINT",
        "ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_type TEXT NOT NULL DEFAULT 'text'",
        "ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_url TEXT",
        "ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_name TEXT",
        "ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_mime TEXT",
        "ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id BIGINT REFERENCES messages(id) ON DELETE SET NULL",
        "CREATE INDEX IF NOT EXISTS idx_conversation_members_user ON conversation_members(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id, id)",
        "CREATE INDEX IF NOT EXISTS idx_messages_sent_at ON messages(sent_at)",
        "CREATE INDEX IF NOT EXISTS idx_reactions_message ON message_reactions(message_id)",
    ]
    with db_connect() as db:
        for statement in statements:
            db.execute(statement)


def init_db() -> None:
    if USE_POSTGRES:
        init_postgres_db()
    else:
        init_sqlite_db()

def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def touch_last_seen(user_id: int, seen_at: str | None = None) -> None:
    """Persist the user's most recent activity time for offline status."""
    with db_connect() as db:
        db_execute(
            db,
            "UPDATE users SET last_seen_at = ? WHERE id = ?",
            (seen_at or utc_now(), user_id),
        )


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


def current_user() -> DbRow | None:
    user_id = session.get("user_id")
    if not user_id:
        return None
    with db_connect() as db:
        return db_execute(
            db,
            """
            SELECT id, username, created_at, profile_picture_url,
                   profile_picture_public_id, note_text, note_expires_at, bio_text, last_seen_at
            FROM users WHERE id = ?
            """,
            (user_id,),
        ).fetchone()


def note_is_active(expires_at: Any) -> bool:
    if not expires_at:
        return False
    try:
        parsed = datetime.fromisoformat(str(expires_at))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed > datetime.now(timezone.utc)
    except (TypeError, ValueError):
        return False


def profile_payload(row: DbRow) -> dict[str, Any]:
    active_note = str(row["note_text"] or "").strip() if note_is_active(row["note_expires_at"]) else ""
    payload = {
        "username": str(row["username"]),
        "profile_picture_url": row["profile_picture_url"],
        "note": active_note,
        "note_expires_at": row["note_expires_at"] if active_note else None,
        "bio": str(row["bio_text"] or "").strip() if "bio_text" in row.keys() else "",
        "last_seen_at": row["last_seen_at"] if "last_seen_at" in row.keys() else None,
    }
    if "id" in row.keys():
        payload["id"] = int(row["id"])
    return payload


def all_members() -> list[dict[str, Any]]:
    with db_connect() as db:
        rows = db_execute(
            db,
            """
            SELECT id, username, profile_picture_url, note_text, note_expires_at, bio_text, last_seen_at
            FROM users ORDER BY LOWER(username)
            """,
        ).fetchall()
    return [{**profile_payload(row), "id": int(row["id"])} for row in rows]


def conversation_room(conversation_id: int) -> str:
    return f"conversation:{conversation_id}"


def call_room(conversation_id: int) -> str:
    return f"call:{conversation_id}"


def ensure_default_conversation() -> int:
    """Create the original shared group and migrate old one-room messages into it."""
    with db_connect() as db:
        row = db_execute(
            db,
            "SELECT id FROM conversations WHERE is_default = ? ORDER BY id LIMIT 1",
            (True if USE_POSTGRES else 1,),
        ).fetchone()
        if row:
            conversation_id = int(row["id"])
        else:
            first_user = db_execute(db, "SELECT id FROM users ORDER BY id LIMIT 1").fetchone()
            creator_id = int(first_user["id"]) if first_user else None
            conversation_id = insert_and_get_id(
                db,
                """
                INSERT INTO conversations (name, conversation_type, created_by, created_at, is_default)
                VALUES (?, 'group', ?, ?, ?)
                """,
                (DEFAULT_GROUP_NAME, creator_id, utc_now(), True if USE_POSTGRES else 1),
            )

        users = db_execute(db, "SELECT id FROM users").fetchall()
        for user in users:
            if USE_POSTGRES:
                db_execute(
                    db,
                    """
                    INSERT INTO conversation_members (conversation_id, user_id, joined_at)
                    VALUES (?, ?, ?) ON CONFLICT (conversation_id, user_id) DO NOTHING
                    """,
                    (conversation_id, int(user["id"]), utc_now()),
                )
            else:
                db_execute(
                    db,
                    """
                    INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, joined_at)
                    VALUES (?, ?, ?)
                    """,
                    (conversation_id, int(user["id"]), utc_now()),
                )

        db_execute(
            db,
            "UPDATE messages SET conversation_id = ? WHERE conversation_id IS NULL",
            (conversation_id,),
        )
    return conversation_id


def add_user_to_default_conversation(user_id: int) -> int:
    conversation_id = ensure_default_conversation()
    with db_connect() as db:
        if USE_POSTGRES:
            db_execute(
                db,
                """
                INSERT INTO conversation_members (conversation_id, user_id, joined_at)
                VALUES (?, ?, ?) ON CONFLICT (conversation_id, user_id) DO NOTHING
                """,
                (conversation_id, user_id, utc_now()),
            )
        else:
            db_execute(
                db,
                """
                INSERT OR IGNORE INTO conversation_members (conversation_id, user_id, joined_at)
                VALUES (?, ?, ?)
                """,
                (conversation_id, user_id, utc_now()),
            )
    return conversation_id


def user_conversation_ids(user_id: int) -> list[int]:
    with db_connect() as db:
        rows = db_execute(
            db,
            "SELECT conversation_id FROM conversation_members WHERE user_id = ?",
            (user_id,),
        ).fetchall()
    return [int(row["conversation_id"]) for row in rows]


def is_conversation_member(conversation_id: int, user_id: int) -> bool:
    with db_connect() as db:
        row = db_execute(
            db,
            """
            SELECT 1 AS found FROM conversation_members
            WHERE conversation_id = ? AND user_id = ?
            """,
            (conversation_id, user_id),
        ).fetchone()
    return bool(row)


def conversation_member_profiles(conversation_id: int) -> list[dict[str, Any]]:
    with db_connect() as db:
        rows = db_execute(
            db,
            """
            SELECT users.id, users.username, users.profile_picture_url,
                   users.note_text, users.note_expires_at, users.bio_text, users.last_seen_at
            FROM conversation_members
            JOIN users ON users.id = conversation_members.user_id
            WHERE conversation_members.conversation_id = ?
            ORDER BY LOWER(users.username)
            """,
            (conversation_id,),
        ).fetchall()
    return [{**profile_payload(row), "id": int(row["id"])} for row in rows]


def conversation_payload(conversation_id: int, viewer_id: int) -> dict[str, Any] | None:
    if not is_conversation_member(conversation_id, viewer_id):
        return None
    with db_connect() as db:
        conversation = db_execute(
            db,
            """
            SELECT id, name, profile_picture_url, conversation_type, created_by, created_at, is_default
            FROM conversations WHERE id = ?
            """,
            (conversation_id,),
        ).fetchone()
    if not conversation:
        return None

    members = conversation_member_profiles(conversation_id)
    conversation_type = str(conversation["conversation_type"])
    if conversation_type == "direct":
        other = next((member for member in members if int(member["id"]) != viewer_id), None)
        title = str(other["username"]) if other else "Private chat"
        avatar_url = other.get("profile_picture_url") if other else None
    else:
        title = str(conversation["name"] or "Group chat")
        avatar_url = conversation["profile_picture_url"]

    return {
        "id": int(conversation["id"]),
        "name": title,
        "type": conversation_type,
        "avatar_url": avatar_url,
        "member_count": len(members),
        "members": members,
        "is_default": bool(conversation["is_default"]),
        "can_edit": conversation_type == "group",
    }


def conversation_summaries(user_id: int) -> list[dict[str, Any]]:
    """Load the inbox in two database queries instead of several queries per chat.

    This is especially important for a cloud PostgreSQL database, where repeatedly
    opening connections and running N+1 queries can make every conversation click
    feel slow.
    """
    with db_connect() as db:
        conversation_rows = db_execute(
            db,
            """
            WITH ranked_messages AS (
                SELECT messages.id, messages.conversation_id, messages.body,
                       messages.sent_at, messages.message_type,
                       messages.attachment_name, messages.user_id,
                       ROW_NUMBER() OVER (
                           PARTITION BY messages.conversation_id
                           ORDER BY messages.id DESC
                       ) AS row_number
                FROM messages
            )
            SELECT conversations.id, conversations.name,
                   conversations.profile_picture_url,
                   conversations.conversation_type,
                   conversations.created_by, conversations.created_at,
                   conversations.is_default,
                   ranked_messages.id AS last_message_id,
                   ranked_messages.body AS last_body,
                   ranked_messages.sent_at AS last_sent_at,
                   ranked_messages.message_type AS last_message_type,
                   ranked_messages.attachment_name AS last_attachment_name,
                   last_user.username AS last_username
            FROM conversation_members AS mine
            JOIN conversations
              ON conversations.id = mine.conversation_id
            LEFT JOIN ranked_messages
              ON ranked_messages.conversation_id = conversations.id
             AND ranked_messages.row_number = 1
            LEFT JOIN users AS last_user
              ON last_user.id = ranked_messages.user_id
            WHERE mine.user_id = ?
            ORDER BY COALESCE(ranked_messages.id, 0) DESC
            """,
            (user_id,),
        ).fetchall()

        if not conversation_rows:
            return []

        conversation_ids = [int(row["id"]) for row in conversation_rows]
        placeholders = ",".join("?" for _ in conversation_ids)
        member_rows = db_execute(
            db,
            f"""
            SELECT conversation_members.conversation_id,
                   users.id, users.username, users.profile_picture_url,
                   users.note_text, users.note_expires_at,
                   users.bio_text, users.last_seen_at
            FROM conversation_members
            JOIN users ON users.id = conversation_members.user_id
            WHERE conversation_members.conversation_id IN ({placeholders})
            ORDER BY conversation_members.conversation_id, LOWER(users.username)
            """,
            tuple(conversation_ids),
        ).fetchall()

    members_by_conversation: dict[int, list[dict[str, Any]]] = {
        conversation_id: [] for conversation_id in conversation_ids
    }
    for member_row in member_rows:
        conversation_id = int(member_row["conversation_id"])
        members_by_conversation.setdefault(conversation_id, []).append(
            {**profile_payload(member_row), "id": int(member_row["id"])}
        )

    summaries: list[dict[str, Any]] = []
    for row in conversation_rows:
        conversation_id = int(row["id"])
        members = members_by_conversation.get(conversation_id, [])
        conversation_type = str(row["conversation_type"])

        if conversation_type == "direct":
            other = next(
                (member for member in members if int(member["id"]) != user_id),
                None,
            )
            title = str(other["username"]) if other else "Private chat"
            avatar_url = other.get("profile_picture_url") if other else None
        else:
            title = str(row["name"] or "Group chat")
            avatar_url = row["profile_picture_url"]

        last_message_id = int(row["last_message_id"] or 0)
        if last_message_id:
            last_message = str(row["last_body"] or "").strip()
            if not last_message:
                message_type = str(row["last_message_type"] or "")
                if message_type == "image":
                    last_message = "sent a photo"
                elif message_type == "video":
                    last_message = "sent a video"
                else:
                    last_message = "sent an attachment"
            last_sender = str(row["last_username"] or "")
            last_sent_at = str(row["last_sent_at"] or "")
        else:
            last_message = "Start a conversation"
            last_sender = ""
            last_sent_at = ""

        summaries.append(
            {
                "id": conversation_id,
                "name": title,
                "type": conversation_type,
                "avatar_url": avatar_url,
                "member_count": len(members),
                "members": members,
                "is_default": bool(row["is_default"]),
                "can_edit": conversation_type == "group",
                "last_message_id": last_message_id,
                "last_message": last_message[:90],
                "last_sender": last_sender,
                "last_sent_at": last_sent_at,
            }
        )

    return summaries


def get_or_create_direct_conversation(user_id: int, other_user_id: int) -> int:
    if user_id == other_user_id:
        raise ValueError("You cannot create a private chat with yourself.")
    low, high = sorted((user_id, other_user_id))
    direct_key = f"{low}:{high}"
    with db_connect() as db:
        other = db_execute(db, "SELECT id FROM users WHERE id = ?", (other_user_id,)).fetchone()
        if not other:
            raise LookupError("User not found.")
        existing = db_execute(
            db, "SELECT id FROM conversations WHERE direct_key = ?", (direct_key,)
        ).fetchone()
        if existing:
            return int(existing["id"])
        try:
            conversation_id = insert_and_get_id(
                db,
                """
                INSERT INTO conversations
                    (name, conversation_type, created_by, created_at, direct_key, is_default)
                VALUES (NULL, 'direct', ?, ?, ?, ?)
                """,
                (user_id, utc_now(), direct_key, False if USE_POSTGRES else 0),
            )
        except (sqlite3.IntegrityError, psycopg.IntegrityError):
            existing = db_execute(
                db, "SELECT id FROM conversations WHERE direct_key = ?", (direct_key,)
            ).fetchone()
            if not existing:
                raise
            return int(existing["id"])

        for member_id in (user_id, other_user_id):
            db_execute(
                db,
                """
                INSERT INTO conversation_members (conversation_id, user_id, joined_at)
                VALUES (?, ?, ?)
                """,
                (conversation_id, member_id, utc_now()),
            )
    return conversation_id


def create_group_conversation(owner_id: int, name: str, member_ids: list[int]) -> int:
    clean_name = name.strip()
    if not 1 <= len(clean_name) <= 60:
        raise ValueError("Group name must be 1–60 characters.")
    unique_members = sorted(set(member_ids + [owner_id]))
    if len(unique_members) < 2:
        raise ValueError("Choose at least one friend for the group chat.")
    if len(unique_members) > 50:
        raise ValueError("A group chat can have up to 50 members.")

    with db_connect() as db:
        placeholders = ",".join("?" for _ in unique_members)
        rows = db_execute(
            db, f"SELECT id FROM users WHERE id IN ({placeholders})", tuple(unique_members)
        ).fetchall()
        valid_ids = {int(row["id"]) for row in rows}
        if valid_ids != set(unique_members):
            raise LookupError("One or more selected users no longer exist.")
        conversation_id = insert_and_get_id(
            db,
            """
            INSERT INTO conversations
                (name, conversation_type, created_by, created_at, direct_key, is_default)
            VALUES (?, 'group', ?, ?, NULL, ?)
            """,
            (clean_name, owner_id, utc_now(), False if USE_POSTGRES else 0),
        )
        for member_id in unique_members:
            db_execute(
                db,
                """
                INSERT INTO conversation_members (conversation_id, user_id, joined_at)
                VALUES (?, ?, ?)
                """,
                (conversation_id, member_id, utc_now()),
            )
    return conversation_id


def reaction_summaries(message_ids: list[int]) -> dict[int, list[dict[str, Any]]]:
    if not message_ids:
        return {}

    placeholders = ",".join("?" for _ in message_ids)
    with db_connect() as db:
        rows = db_execute(db, 
            f"""
            SELECT message_reactions.message_id, message_reactions.emoji, users.username
            FROM message_reactions
            JOIN users ON users.id = message_reactions.user_id
            WHERE message_reactions.message_id IN ({placeholders})
            ORDER BY message_reactions.created_at, LOWER(users.username)
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


def reply_preview_from_row(row: DbRow) -> dict[str, Any] | None:
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


def messages_before(
    conversation_id: int,
    before_id: int | None = None,
    limit: int = HISTORY_PAGE_SIZE,
) -> list[dict[str, Any]]:
    safe_limit = max(1, min(100, int(limit)))
    extra = " AND messages.id < ?" if before_id else ""
    params: tuple[Any, ...] = (conversation_id, before_id, safe_limit) if before_id else (conversation_id, safe_limit)

    with db_connect() as db:
        rows = db_execute(
            db,
            f"""
            SELECT messages.id, messages.conversation_id, users.username,
                   users.profile_picture_url, messages.body, messages.sent_at,
                   messages.message_type, messages.attachment_url,
                   messages.attachment_name, messages.attachment_mime,
                   messages.reply_to_id, reply_users.username AS reply_username,
                   replied.body AS reply_body, replied.message_type AS reply_message_type,
                   replied.attachment_name AS reply_attachment_name
            FROM messages
            JOIN users ON users.id = messages.user_id
            LEFT JOIN messages AS replied ON replied.id = messages.reply_to_id
            LEFT JOIN users AS reply_users ON reply_users.id = replied.user_id
            WHERE messages.conversation_id = ?{extra}
            ORDER BY messages.id DESC
            LIMIT ?
            """,
            params,
        ).fetchall()

    ordered = list(reversed(rows))
    summaries = reaction_summaries([int(row["id"]) for row in ordered])
    return [
        message_payload(
            int(row["id"]),
            int(row["conversation_id"]),
            str(row["username"]),
            str(row["body"]),
            str(row["sent_at"]),
            str(row["message_type"]),
            row["attachment_url"],
            row["attachment_name"],
            row["attachment_mime"],
            reply_to=reply_preview_from_row(row),
            reactions=summaries.get(int(row["id"]), []),
            profile_picture_url=row["profile_picture_url"],
        )
        for row in ordered
    ]


def has_messages_before(conversation_id: int, message_id: int | None) -> bool:
    if not message_id:
        return False
    with db_connect() as db:
        row = db_execute(
            db,
            """
            SELECT 1 AS found FROM messages
            WHERE conversation_id = ? AND id < ? LIMIT 1
            """,
            (conversation_id, message_id),
        ).fetchone()
    return bool(row)


def public_ice_servers() -> list[dict[str, Any]]:
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
    conversation_id: int,
    username: str,
    body: str,
    sent_at: str,
    message_type: str = "text",
    attachment_url: str | None = None,
    attachment_name: str | None = None,
    attachment_mime: str | None = None,
    reply_to: dict[str, Any] | None = None,
    reactions: list[dict[str, Any]] | None = None,
    profile_picture_url: str | None = None,
) -> dict[str, Any]:
    return {
        "id": message_id,
        "conversation_id": conversation_id,
        "username": username,
        "body": body,
        "sent_at": sent_at,
        "message_type": message_type,
        "attachment_url": attachment_url,
        "attachment_name": attachment_name,
        "attachment_mime": attachment_mime,
        "reply_to": reply_to,
        "reactions": reactions or [],
        "profile_picture_url": profile_picture_url,
    }


def get_reply_preview(conversation_id: int, reply_to_id: int | None) -> dict[str, Any] | None:
    if not reply_to_id:
        return None
    with db_connect() as db:
        row = db_execute(
            db,
            """
            SELECT messages.id AS reply_to_id, users.username AS reply_username,
                   messages.body AS reply_body, messages.message_type AS reply_message_type,
                   messages.attachment_name AS reply_attachment_name
            FROM messages
            JOIN users ON users.id = messages.user_id
            WHERE messages.id = ? AND messages.conversation_id = ?
            """,
            (reply_to_id, conversation_id),
        ).fetchone()
    return reply_preview_from_row(row) if row else None


def parse_message_id(value: Any) -> int | None:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def save_message(
    conversation_id: int,
    user_id: int,
    username: str,
    body: str,
    message_type: str = "text",
    attachment_url: str | None = None,
    attachment_name: str | None = None,
    attachment_mime: str | None = None,
    reply_to_id: int | None = None,
    profile_picture_url: str | None = None,
) -> dict[str, Any]:
    reply_to = get_reply_preview(conversation_id, reply_to_id)
    valid_reply_id = int(reply_to["id"]) if reply_to else None
    sent_at = utc_now()
    with db_connect() as db:
        message_id = insert_and_get_id(
            db,
            """
            INSERT INTO messages (
                conversation_id, user_id, body, sent_at, message_type, attachment_url,
                attachment_name, attachment_mime, reply_to_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                conversation_id,
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

    return message_payload(
        message_id,
        conversation_id,
        username,
        body,
        sent_at,
        message_type,
        attachment_url,
        attachment_name,
        attachment_mime,
        reply_to=reply_to,
        reactions=[],
        profile_picture_url=profile_picture_url,
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
                    user_id = insert_and_get_id(
                        db,
                        "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
                        (username, generate_password_hash(password), utc_now()),
                    )

                add_user_to_default_conversation(user_id)
                session.clear()
                session["user_id"] = user_id
                session["username"] = username
                session.permanent = True
                csrf_token()
                flash("Welcome! You are now in the friends chat.", "success")
                return redirect(url_for("chat"))
            except (sqlite3.IntegrityError, psycopg.IntegrityError):
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
            user = db_execute(db, 
                "SELECT id, username, password_hash FROM users WHERE LOWER(username) = LOWER(?)",
                (username,),
            ).fetchone()

        if not user or not check_password_hash(user["password_hash"], password):
            flash("Invalid username or password.", "error")
        else:
            touch_last_seen(int(user["id"]))
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
    user_id = session.get("user_id")
    if user_id:
        touch_last_seen(int(user_id))
    session.clear()
    return redirect(url_for("login"))


def render_chat_page(selected_conversation_id: int | None = None) -> Any:
    user = current_user()
    if not user:
        session.clear()
        return redirect(url_for("login"))

    user_id = int(user["id"])
    conversations = conversation_summaries(user_id)
    selected = None
    messages: list[dict[str, Any]] = []
    if selected_conversation_id is not None:
        selected = next(
            (
                conversation
                for conversation in conversations
                if int(conversation["id"]) == selected_conversation_id
            ),
            None,
        )
        if not selected:
            flash("You are not a member of that conversation.", "error")
            return redirect(url_for("chat"))
        messages = messages_before(selected_conversation_id, limit=HISTORY_PAGE_SIZE)

    app_data = {
        "username": str(user["username"]),
        "userId": user_id,
        "members": all_members(),
        "currentProfile": profile_payload(user),
        "conversations": conversations,
        "selectedConversation": selected,
        "messages": messages,
        "historyPageSize": HISTORY_PAGE_SIZE,
        "iceServers": public_ice_servers(),
        "csrfToken": csrf_token(),
        "maxUploadMb": MAX_UPLOAD_MB,
        "profileMaxUploadMb": PROFILE_MAX_UPLOAD_MB,
    }
    return render_template("group.html", app_data=app_data)


@app.route("/chat")
@login_required
def chat() -> Any:
    return render_chat_page()


@app.route("/chat/<int:conversation_id>")
@login_required
def chat_conversation(conversation_id: int) -> Any:
    return render_chat_page(conversation_id)


@app.route("/group")
@login_required
def group() -> Any:
    return redirect(url_for("chat_conversation", conversation_id=ensure_default_conversation()))


@app.post("/api/conversations/private")
@login_required
def create_private_chat() -> Any:
    expected = session.get("_csrf_token", "")
    received = request.headers.get("X-CSRF-Token", "")
    if not expected or not received or not hmac.compare_digest(expected, received):
        return jsonify({"error": "The session expired. Refresh and try again."}), 403
    data = request.get_json(silent=True) or {}
    try:
        other_user_id = int(data.get("user_id"))
        conversation_id = get_or_create_direct_conversation(int(session["user_id"]), other_user_id)
    except (TypeError, ValueError) as exc:
        return jsonify({"error": str(exc) or "Choose a valid friend."}), 400
    except LookupError as exc:
        return jsonify({"error": str(exc)}), 404
    emit_to_conversation_members(
        "conversation_created",
        {"conversation_id": conversation_id, "url": url_for("chat_conversation", conversation_id=conversation_id)},
        conversation_id,
    )
    return jsonify({
        "conversation_id": conversation_id,
        "url": url_for("chat_conversation", conversation_id=conversation_id),
    }), 201


@app.post("/api/conversations/group")
@login_required
def create_group_chat() -> Any:
    expected = session.get("_csrf_token", "")
    received = request.headers.get("X-CSRF-Token", "")
    if not expected or not received or not hmac.compare_digest(expected, received):
        return jsonify({"error": "The session expired. Refresh and try again."}), 403
    data = request.get_json(silent=True) or {}
    name = str(data.get("name", "")).strip()
    raw_ids = data.get("member_ids", [])
    try:
        member_ids = [int(value) for value in raw_ids] if isinstance(raw_ids, list) else []
        conversation_id = create_group_conversation(int(session["user_id"]), name, member_ids)
    except (TypeError, ValueError) as exc:
        return jsonify({"error": str(exc) or "Check the group name and members."}), 400
    except LookupError as exc:
        return jsonify({"error": str(exc)}), 404
    emit_to_conversation_members(
        "conversation_created",
        {"conversation_id": conversation_id, "url": url_for("chat_conversation", conversation_id=conversation_id)},
        conversation_id,
    )
    return jsonify({
        "conversation_id": conversation_id,
        "url": url_for("chat_conversation", conversation_id=conversation_id),
    }), 201


@app.get("/api/messages/history")
@login_required
def message_history() -> Any:
    conversation_id = parse_message_id(request.args.get("conversation_id"))
    before_id = parse_message_id(request.args.get("before_id"))
    user_id = int(session["user_id"])
    if not conversation_id or not is_conversation_member(conversation_id, user_id):
        return jsonify({"error": "Conversation not found."}), 404
    if not before_id:
        return jsonify({"error": "A valid before_id is required."}), 400

    try:
        requested_limit = int(request.args.get("limit", HISTORY_PAGE_SIZE))
    except (TypeError, ValueError):
        requested_limit = HISTORY_PAGE_SIZE
    limit = max(1, min(100, requested_limit))

    messages = messages_before(conversation_id, before_id=before_id, limit=limit)
    oldest_id = int(messages[0]["id"]) if messages else before_id
    return jsonify(
        {
            "messages": messages,
            "has_more": has_messages_before(conversation_id, oldest_id),
        }
    )


@app.get("/api/messages/<int:message_id>/download")
@login_required
def download_message_attachment(message_id: int) -> Any:
    user_id = int(session["user_id"])
    with db_connect() as db:
        row = db_execute(
            db,
            """
            SELECT messages.conversation_id, messages.message_type, messages.attachment_url,
                   messages.attachment_name, messages.attachment_mime
            FROM messages
            JOIN conversation_members ON conversation_members.conversation_id = messages.conversation_id
            WHERE messages.id = ? AND conversation_members.user_id = ?
            """,
            (message_id, user_id),
        ).fetchone()

    if not row or str(row["message_type"] or "") not in {"image", "video"}:
        return jsonify({"error": "Attachment not found."}), 404

    attachment_url = str(row["attachment_url"] or "").strip()
    if not attachment_url:
        return jsonify({"error": "Attachment not found."}), 404

    original_name = secure_filename(str(row["attachment_name"] or ""))
    guessed_extension = Path(urlparse(attachment_url).path).suffix
    fallback_name = f"gchats-{str(row['message_type'])}-{message_id}{guessed_extension}"
    download_name = original_name or fallback_name
    mimetype = str(row["attachment_mime"] or "").strip() or mimetypes.guess_type(download_name)[0]

    if attachment_url.startswith("/uploads/"):
        filename = attachment_url.rsplit("/", 1)[-1]
        return send_from_directory(
            str(UPLOAD_DIR),
            filename,
            as_attachment=True,
            download_name=download_name,
            mimetype=mimetype,
        )

    parsed = urlparse(attachment_url)
    if parsed.scheme != "https" or not (parsed.hostname or "").lower().endswith("res.cloudinary.com"):
        return jsonify({"error": "This attachment cannot be downloaded safely."}), 400

    try:
        remote_request = Request(attachment_url, headers={"User-Agent": "GChats/1.0"})
        with urlopen(remote_request, timeout=20) as remote_response:
            content_length = int(remote_response.headers.get("Content-Length", "0") or 0)
            max_bytes = (MAX_UPLOAD_MB + 2) * 1024 * 1024
            if content_length and content_length > max_bytes:
                return jsonify({"error": "This attachment is too large to download."}), 413
            data = remote_response.read(max_bytes + 1)
            if len(data) > max_bytes:
                return jsonify({"error": "This attachment is too large to download."}), 413
            remote_type = remote_response.headers.get_content_type()
    except Exception:
        app.logger.exception("Could not download remote attachment")
        return jsonify({"error": "The attachment could not be downloaded right now."}), 502

    return send_file(
        BytesIO(data),
        as_attachment=True,
        download_name=download_name,
        mimetype=mimetype or remote_type,
        max_age=0,
    )


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
    conversation_id = parse_message_id(request.form.get("conversation_id"))
    if not conversation_id or not is_conversation_member(conversation_id, int(user["id"])):
        return jsonify({"error": "Conversation not found."}), 404

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
    body = request.form.get("caption", "").strip()
    reply_to_id = parse_message_id(request.form.get("reply_to_id"))
    if len(body) > 1000:
        return jsonify({"error": "Captions are limited to 1,000 characters."}), 400

    attachment_url: str
    if USE_CLOUDINARY:
        try:
            result = cloudinary.uploader.upload(
                uploaded.stream,
                resource_type="video" if message_type == "video" else "image",
                folder="kulot-friends-chat",
                public_id=uuid.uuid4().hex,
                overwrite=False,
            )
            attachment_url = str(result.get("secure_url") or "")
            if not attachment_url:
                raise RuntimeError("Cloud media storage did not return a secure URL.")
        except Exception as exc:
            app.logger.exception("Cloudinary upload failed")
            return jsonify({"error": f"Cloud upload failed: {exc}"}), 502
    else:
        stored_name = f"{uuid.uuid4().hex}{extension}"
        destination = UPLOAD_DIR / stored_name
        uploaded.save(destination)
        attachment_url = url_for("uploaded_file", filename=stored_name)

    payload = save_message(
        conversation_id,
        int(user["id"]),
        str(user["username"]),
        body,
        message_type=message_type,
        attachment_url=attachment_url,
        attachment_name=original_name,
        attachment_mime=uploaded.mimetype or None,
        reply_to_id=reply_to_id,
        profile_picture_url=user["profile_picture_url"],
    )
    emit_to_conversation_members("new_message", payload, conversation_id)
    emit_to_conversation_members("conversation_updated", {"conversation_id": conversation_id}, conversation_id)
    return jsonify({"message": payload}), 201


def valid_header_csrf() -> bool:
    expected = session.get("_csrf_token", "")
    received = request.headers.get("X-CSRF-Token", "")
    return bool(expected and received and hmac.compare_digest(expected, received))


def emit_profile_update(profile: dict[str, Any]) -> None:
    socketio.emit("profile_updated", {"profile": profile}, to=GLOBAL_ROOM)


def remove_group_picture_file(picture_url: str, public_id: str) -> None:
    if USE_CLOUDINARY and public_id:
        try:
            cloudinary.uploader.destroy(public_id, resource_type="image", invalidate=True)
        except Exception:
            app.logger.warning("Could not remove the old group picture from Cloudinary.")
    elif picture_url.startswith("/group-uploads/"):
        (GROUP_UPLOAD_DIR / picture_url.rsplit("/", 1)[-1]).unlink(missing_ok=True)


@app.post("/api/conversations/<int:conversation_id>/profile")
@login_required
def update_group_conversation_profile(conversation_id: int) -> Any:
    if not valid_header_csrf():
        return jsonify({"error": "The group settings session expired. Refresh and try again."}), 403

    user_id = int(session["user_id"])
    if not is_conversation_member(conversation_id, user_id):
        return jsonify({"error": "Group chat not found."}), 404

    with db_connect() as db:
        conversation = db_execute(
            db,
            """
            SELECT id, name, conversation_type, profile_picture_url, profile_picture_public_id
            FROM conversations WHERE id = ?
            """,
            (conversation_id,),
        ).fetchone()

    if not conversation or str(conversation["conversation_type"]) != "group":
        return jsonify({"error": "Only group chats can have a group name and picture."}), 400

    name = request.form.get("name", "").strip()
    if not 1 <= len(name) <= 60:
        return jsonify({"error": "Group name must be 1–60 characters."}), 400

    uploaded = request.files.get("file")
    remove_picture = request.form.get("remove_picture", "").lower() == "true"
    old_url = str(conversation["profile_picture_url"] or "")
    old_public_id = str(conversation["profile_picture_public_id"] or "")
    picture_url: str | None = old_url or None
    picture_public_id: str | None = old_public_id or None
    replace_old_picture = False

    if uploaded and uploaded.filename:
        original_name = secure_filename(uploaded.filename)
        classification = classify_upload(original_name, uploaded.mimetype or "")
        if not classification or classification[0] != "image":
            return jsonify({"error": "Group pictures must be JPG, PNG, GIF, or WEBP."}), 400

        content_length = request.content_length or 0
        if content_length > PROFILE_MAX_UPLOAD_MB * 1024 * 1024:
            return jsonify({"error": f"Group pictures are limited to {PROFILE_MAX_UPLOAD_MB} MB."}), 413

        extension = classification[1]
        if USE_CLOUDINARY:
            try:
                result = cloudinary.uploader.upload(
                    uploaded.stream,
                    resource_type="image",
                    folder="kulot-friends-chat/groups",
                    public_id=f"group-{conversation_id}-{uuid.uuid4().hex}",
                    overwrite=False,
                    transformation=[
                        {"width": 1024, "height": 1024, "crop": "limit", "quality": "auto"}
                    ],
                )
                picture_url = str(result.get("secure_url") or "")
                picture_public_id = str(result.get("public_id") or "") or None
                if not picture_url:
                    raise RuntimeError("Cloud media storage did not return a secure URL.")
            except Exception as exc:
                app.logger.exception("Group picture upload failed")
                return jsonify({"error": f"Group picture upload failed: {exc}"}), 502
        else:
            stored_name = f"group-{conversation_id}-{uuid.uuid4().hex}{extension}"
            uploaded.save(GROUP_UPLOAD_DIR / stored_name)
            picture_url = url_for("group_uploaded_file", filename=stored_name)
            picture_public_id = None
        replace_old_picture = True
    elif remove_picture:
        picture_url = None
        picture_public_id = None
        replace_old_picture = bool(old_url or old_public_id)

    with db_connect() as db:
        db_execute(
            db,
            """
            UPDATE conversations
            SET name = ?, profile_picture_url = ?, profile_picture_public_id = ?
            WHERE id = ?
            """,
            (name, picture_url, picture_public_id, conversation_id),
        )

    if replace_old_picture and (old_url != (picture_url or "") or old_public_id != (picture_public_id or "")):
        remove_group_picture_file(old_url, old_public_id)

    payload = conversation_payload(conversation_id, user_id)
    if not payload:
        return jsonify({"error": "Could not reload the group chat."}), 500
    emit_to_conversation_members(
        "conversation_profile_updated",
        {"conversation": payload},
        conversation_id,
    )
    return jsonify({"conversation": payload}), 200


@app.post("/api/conversations/<int:conversation_id>/leave")
@login_required
def leave_group_conversation(conversation_id: int) -> Any:
    if not valid_header_csrf():
        return jsonify({"error": "The group settings session expired. Refresh and try again."}), 403

    user_id = int(session["user_id"])
    username = str(session.get("username") or "A member")
    if not is_conversation_member(conversation_id, user_id):
        return jsonify({"error": "Group chat not found."}), 404

    with db_connect() as db:
        conversation = db_execute(
            db,
            """
            SELECT id, name, conversation_type, created_by, is_default,
                   profile_picture_url, profile_picture_public_id
            FROM conversations WHERE id = ?
            """,
            (conversation_id,),
        ).fetchone()

        if not conversation or str(conversation["conversation_type"]) != "group":
            return jsonify({"error": "Only group chats can be left."}), 400
        if bool(conversation["is_default"]):
            return jsonify({"error": "You cannot leave the main Kulot Friends group."}), 400

        db_execute(
            db,
            "DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?",
            (conversation_id, user_id),
        )
        remaining = db_execute(
            db,
            """
            SELECT users.id, users.username
            FROM conversation_members
            JOIN users ON users.id = conversation_members.user_id
            WHERE conversation_members.conversation_id = ?
            ORDER BY conversation_members.joined_at, users.id
            """,
            (conversation_id,),
        ).fetchall()

        deleted = not remaining
        if deleted:
            db_execute(db, "DELETE FROM conversations WHERE id = ?", (conversation_id,))
        elif int(conversation["created_by"] or 0) == user_id:
            db_execute(
                db,
                "UPDATE conversations SET created_by = ? WHERE id = ?",
                (int(remaining[0]["id"]), conversation_id),
            )

    if deleted:
        remove_group_picture_file(
            str(conversation["profile_picture_url"] or ""),
            str(conversation["profile_picture_public_id"] or ""),
        )
    else:
        remaining_payload = conversation_payload(conversation_id, int(remaining[0]["id"]))
        emit_to_conversation_members(
            "conversation_members_updated",
            {
                "conversation_id": conversation_id,
                "conversation": remaining_payload,
                "left_username": username,
            },
            conversation_id,
        )

    return jsonify({"left": True, "conversation_id": conversation_id, "deleted": deleted}), 200


@app.post("/api/profile/picture")
@login_required
def update_profile_picture() -> Any:
    if not valid_header_csrf():
        return jsonify({"error": "The profile session expired. Refresh the page and try again."}), 403

    user = current_user()
    if not user:
        return jsonify({"error": "Please log in again."}), 401

    uploaded = request.files.get("file")
    if not uploaded or not uploaded.filename:
        return jsonify({"error": "Choose a profile picture first."}), 400

    original_name = secure_filename(uploaded.filename)
    classification = classify_upload(original_name, uploaded.mimetype or "")
    if not classification or classification[0] != "image":
        return jsonify({"error": "Profile pictures must be JPG, PNG, GIF, or WEBP."}), 400

    content_length = request.content_length or 0
    if content_length > PROFILE_MAX_UPLOAD_MB * 1024 * 1024:
        return jsonify({"error": f"Profile pictures are limited to {PROFILE_MAX_UPLOAD_MB} MB."}), 413

    extension = classification[1]
    old_url = str(user["profile_picture_url"] or "")
    old_public_id = str(user["profile_picture_public_id"] or "")
    new_public_id: str | None = None

    if USE_CLOUDINARY:
        try:
            result = cloudinary.uploader.upload(
                uploaded.stream,
                resource_type="image",
                folder="kulot-friends-chat/profiles",
                public_id=f"user-{int(user['id'])}-{uuid.uuid4().hex}",
                overwrite=False,
                transformation=[
                    {"width": 720, "height": 720, "crop": "limit", "quality": "auto"}
                ],
            )
            picture_url = str(result.get("secure_url") or "")
            new_public_id = str(result.get("public_id") or "") or None
            if not picture_url:
                raise RuntimeError("Cloud media storage did not return a secure URL.")
        except Exception as exc:
            app.logger.exception("Profile picture upload failed")
            return jsonify({"error": f"Profile picture upload failed: {exc}"}), 502
    else:
        stored_name = f"profile-{int(user['id'])}-{uuid.uuid4().hex}{extension}"
        destination = PROFILE_UPLOAD_DIR / stored_name
        uploaded.save(destination)
        picture_url = url_for("profile_uploaded_file", filename=stored_name)

    with db_connect() as db:
        db_execute(
            db,
            """
            UPDATE users SET profile_picture_url = ?, profile_picture_public_id = ?
            WHERE id = ?
            """,
            (picture_url, new_public_id, int(user["id"])),
        )

    if USE_CLOUDINARY and old_public_id and old_public_id != new_public_id:
        try:
            cloudinary.uploader.destroy(old_public_id, resource_type="image", invalidate=True)
        except Exception:
            app.logger.warning("Could not remove the old profile picture from Cloudinary.")
    elif not USE_CLOUDINARY and old_url.startswith("/profile-uploads/"):
        old_filename = old_url.rsplit("/", 1)[-1]
        (PROFILE_UPLOAD_DIR / old_filename).unlink(missing_ok=True)

    refreshed = current_user()
    if not refreshed:
        return jsonify({"error": "Could not reload the profile."}), 500
    profile = profile_payload(refreshed)
    emit_profile_update(profile)
    return jsonify({"profile": profile}), 200


@app.post("/api/profile/picture/remove")
@login_required
def remove_profile_picture() -> Any:
    if not valid_header_csrf():
        return jsonify({"error": "The profile session expired. Refresh the page and try again."}), 403

    user = current_user()
    if not user:
        return jsonify({"error": "Please log in again."}), 401

    old_url = str(user["profile_picture_url"] or "")
    old_public_id = str(user["profile_picture_public_id"] or "")
    with db_connect() as db:
        db_execute(
            db,
            "UPDATE users SET profile_picture_url = NULL, profile_picture_public_id = NULL WHERE id = ?",
            (int(user["id"]),),
        )

    if USE_CLOUDINARY and old_public_id:
        try:
            cloudinary.uploader.destroy(old_public_id, resource_type="image", invalidate=True)
        except Exception:
            app.logger.warning("Could not remove the profile picture from Cloudinary.")
    elif old_url.startswith("/profile-uploads/"):
        (PROFILE_UPLOAD_DIR / old_url.rsplit("/", 1)[-1]).unlink(missing_ok=True)

    refreshed = current_user()
    profile = profile_payload(refreshed) if refreshed else {"username": session.get("username", ""), "profile_picture_url": None, "note": "", "note_expires_at": None, "bio": "", "last_seen_at": None}
    emit_profile_update(profile)
    return jsonify({"profile": profile}), 200


@app.post("/api/profile/note")
@login_required
def update_profile_note() -> Any:
    if not valid_header_csrf():
        return jsonify({"error": "The profile session expired. Refresh the page and try again."}), 403

    user = current_user()
    if not user:
        return jsonify({"error": "Please log in again."}), 401

    data = request.get_json(silent=True) or {}
    note = str(data.get("note", "")).strip()
    if len(note) > 60:
        return jsonify({"error": "Notes are limited to 60 characters."}), 400

    expires_at = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat() if note else None
    with db_connect() as db:
        db_execute(
            db,
            "UPDATE users SET note_text = ?, note_expires_at = ? WHERE id = ?",
            (note or None, expires_at, int(user["id"])),
        )

    refreshed = current_user()
    if not refreshed:
        return jsonify({"error": "Could not reload the profile."}), 500
    profile = profile_payload(refreshed)
    emit_profile_update(profile)
    return jsonify({"profile": profile}), 200


@app.post("/api/profile/bio")
@login_required
def update_profile_bio() -> Any:
    if not valid_header_csrf():
        return jsonify({"error": "The profile session expired. Refresh the page and try again."}), 403

    user = current_user()
    if not user:
        return jsonify({"error": "Please log in again."}), 401

    data = request.get_json(silent=True) or {}
    bio = str(data.get("bio", "")).strip()
    if len(bio) > 160:
        return jsonify({"error": "Bios are limited to 160 characters."}), 400

    with db_connect() as db:
        db_execute(
            db,
            "UPDATE users SET bio_text = ? WHERE id = ?",
            (bio or None, int(user["id"])),
        )

    refreshed = current_user()
    if not refreshed:
        return jsonify({"error": "Could not reload the profile."}), 500
    profile = profile_payload(refreshed)
    emit_profile_update(profile)
    return jsonify({"profile": profile}), 200


@app.get("/group-uploads/<path:filename>")
@login_required
def group_uploaded_file(filename: str) -> Any:
    response = send_from_directory(str(GROUP_UPLOAD_DIR), filename)
    response.headers["Cache-Control"] = "private, max-age=86400"
    return response


@app.get("/profile-uploads/<path:filename>")
@login_required
def profile_uploaded_file(filename: str) -> Any:
    response = send_from_directory(str(PROFILE_UPLOAD_DIR), filename)
    response.headers["Cache-Control"] = "private, max-age=86400"
    return response


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
    if request.path.startswith("/api/conversations/") and request.path.endswith("/profile"):
        return jsonify({"error": f"The group picture is too large. Maximum size is {PROFILE_MAX_UPLOAD_MB} MB."}), 413
    if request.path.startswith("/api/profile/picture"):
        return jsonify({"error": f"The profile picture is too large. Maximum size is {PROFILE_MAX_UPLOAD_MB} MB."}), 413
    if request.path.startswith("/api/messages/upload"):
        return jsonify({"error": f"The file is too large. Maximum size is {MAX_UPLOAD_MB} MB."}), 413
    return "File too large", 413


@app.get("/.well-known/assetlinks.json")
def android_asset_links() -> Any:
    """Expose Digital Asset Links for the signed Android app."""
    package_name = os.getenv("ANDROID_PACKAGE_NAME", "com.kulot.friends").strip()
    fingerprint = os.getenv("ANDROID_SHA256_FINGERPRINT", "").strip().upper()

    payload: list[dict[str, Any]] = []
    if package_name and fingerprint:
        payload.append(
            {
                "relation": ["delegate_permission/common.handle_all_urls"],
                "target": {
                    "namespace": "android_app",
                    "package_name": package_name,
                    "sha256_cert_fingerprints": [fingerprint],
                },
            }
        )

    response = jsonify(payload)
    response.headers["Cache-Control"] = "public, max-age=300"
    return response


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


def socket_identity() -> tuple[int, str] | None:
    user_id = session.get("user_id")
    username = session.get("username")
    if not user_id or not username:
        return None
    return int(user_id), str(username)


def online_usernames() -> list[str]:
    with state_lock:
        return sorted(username_to_sids.keys(), key=str.lower)


def emit_to_conversation_members(event_name: str, payload: Any, conversation_id: int) -> None:
    with db_connect() as db:
        rows = db_execute(
            db,
            "SELECT user_id FROM conversation_members WHERE conversation_id = ?",
            (conversation_id,),
        ).fetchall()
    for row in rows:
        socketio.emit(event_name, payload, to=f"user:{int(row['user_id'])}")


def call_snapshot(conversation_id: int) -> dict[str, Any] | None:
    with state_lock:
        call = active_calls.get(conversation_id)
        if not call:
            return None
        return {**call, "conversation_id": conversation_id, "participant_count": len(call_participants.get(conversation_id, {}))}


def broadcast_online_users() -> None:
    socketio.emit(
        "online_users",
        {"users": online_usernames(), "members": all_members()},
        to=GLOBAL_ROOM,
    )


def broadcast_call_state(conversation_id: int) -> None:
    emit_to_conversation_members(
        "call_state",
        {"conversation_id": conversation_id, "call": call_snapshot(conversation_id)},
        conversation_id,
    )


@socketio.on("connect")
def handle_connect(auth: Any = None) -> bool | None:
    del auth
    identity = socket_identity()
    if not identity:
        return False
    user_id, username = identity
    sid = request.sid
    touch_last_seen(user_id)
    with state_lock:
        sid_to_username[sid] = username
        sid_to_user_id[sid] = user_id
        username_to_sids.setdefault(username, set()).add(sid)
    join_room(GLOBAL_ROOM)
    join_room(f"user:{user_id}")
    for conversation_id in user_conversation_ids(user_id):
        join_room(conversation_room(conversation_id))
    broadcast_online_users()
    return None


@socketio.on("presence_heartbeat")
def handle_presence_heartbeat() -> None:
    identity = socket_identity()
    if not identity:
        return
    user_id, _ = identity
    touch_last_seen(user_id)


@socketio.on("get_call_state")
def handle_get_call_state(payload: Any) -> None:
    identity = socket_identity()
    if not identity or not isinstance(payload, dict):
        return
    user_id, _ = identity
    conversation_id = parse_message_id(payload.get("conversation_id"))
    if not conversation_id or not is_conversation_member(conversation_id, user_id):
        return
    emit("call_state", {"conversation_id": conversation_id, "call": call_snapshot(conversation_id)})


@socketio.on("disconnect")
def handle_disconnect() -> None:
    sid = request.sid
    conversation_id: int | None = None
    departed_username: str | None = None
    call_ended = False
    user_id: int | None = None
    became_offline = False

    with state_lock:
        username = sid_to_username.pop(sid, None)
        user_id = sid_to_user_id.pop(sid, None)
        if username:
            user_sids = username_to_sids.get(username)
            if user_sids:
                user_sids.discard(sid)
                if not user_sids:
                    username_to_sids.pop(username, None)
                    became_offline = True

        conversation_id = sid_call_conversation.pop(sid, None)
        if conversation_id is not None:
            participants = call_participants.get(conversation_id, {})
            departed_username = participants.pop(sid, None)
            if not participants:
                call_participants.pop(conversation_id, None)
                active_calls.pop(conversation_id, None)
                call_ended = True

    if became_offline and user_id is not None:
        touch_last_seen(user_id)

    if conversation_id is not None and departed_username:
        socketio.emit(
            "peer_left",
            {"sid": sid, "username": departed_username, "conversation_id": conversation_id},
            to=call_room(conversation_id),
            skip_sid=sid,
        )
        if call_ended:
            emit_to_conversation_members("call_ended", {"conversation_id": conversation_id}, conversation_id)
        else:
            broadcast_call_state(conversation_id)

    broadcast_online_users()


@socketio.on("send_message")
def handle_send_message(payload: Any) -> None:
    identity = socket_identity()
    user = current_user()
    if not identity or not user or not isinstance(payload, dict):
        return
    user_id, username = identity
    conversation_id = parse_message_id(payload.get("conversation_id"))
    if not conversation_id or not is_conversation_member(conversation_id, user_id):
        emit("chat_error", {"message": "Conversation not found."})
        return

    body = str(payload.get("body", "")).strip()
    reply_to_id = parse_message_id(payload.get("reply_to_id"))
    if not body:
        return
    if len(body) > 1000:
        emit("chat_error", {"message": "Messages are limited to 1,000 characters."})
        return

    message = save_message(
        conversation_id, user_id, username, body,
        reply_to_id=reply_to_id,
        profile_picture_url=user["profile_picture_url"],
    )
    emit_to_conversation_members("new_message", message, conversation_id)
    emit_to_conversation_members("conversation_updated", {"conversation_id": conversation_id}, conversation_id)


@socketio.on("toggle_reaction")
def handle_toggle_reaction(payload: Any) -> None:
    identity = socket_identity()
    if not identity or not isinstance(payload, dict):
        return
    user_id, _ = identity
    message_id = parse_message_id(payload.get("message_id"))
    emoji = str(payload.get("emoji", ""))
    if not message_id or emoji not in ALLOWED_REACTIONS:
        emit("chat_error", {"message": "That reaction is not supported."})
        return

    with db_connect() as db:
        message = db_execute(
            db, "SELECT conversation_id FROM messages WHERE id = ?", (message_id,)
        ).fetchone()
        if not message:
            emit("chat_error", {"message": "That message is no longer available."})
            return
        conversation_id = int(message["conversation_id"])
        if not is_conversation_member(conversation_id, user_id):
            return

        existing = db_execute(
            db,
            "SELECT emoji FROM message_reactions WHERE message_id = ? AND user_id = ?",
            (message_id, user_id),
        ).fetchone()
        if existing and str(existing["emoji"]) == emoji:
            db_execute(db, "DELETE FROM message_reactions WHERE message_id = ? AND user_id = ?", (message_id, user_id))
        elif existing:
            db_execute(
                db,
                "UPDATE message_reactions SET emoji = ?, created_at = ? WHERE message_id = ? AND user_id = ?",
                (emoji, utc_now(), message_id, user_id),
            )
        else:
            db_execute(
                db,
                "INSERT INTO message_reactions (message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)",
                (message_id, user_id, emoji, utc_now()),
            )

    reactions = reaction_summaries([message_id]).get(message_id, [])
    emit_to_conversation_members(
        "reaction_updated",
        {"message_id": message_id, "conversation_id": conversation_id, "reactions": reactions},
        conversation_id,
    )


@socketio.on("start_group_call")
def handle_start_group_call(payload: Any) -> None:
    identity = socket_identity()
    if not identity or not isinstance(payload, dict):
        return
    user_id, username = identity
    conversation_id = parse_message_id(payload.get("conversation_id"))
    if not conversation_id or not is_conversation_member(conversation_id, user_id):
        emit("call_start_error", {"message": "Conversation not found."})
        return
    mode = "video" if payload.get("mode") == "video" else "audio"
    sid = request.sid

    with state_lock:
        existing = active_calls.get(conversation_id)
        if existing:
            existing_call = {**existing, "conversation_id": conversation_id, "participant_count": len(call_participants.get(conversation_id, {}))}
        else:
            active_calls[conversation_id] = {
                "mode": mode, "started_by": username, "started_at": utc_now()
            }
            call_participants[conversation_id] = {sid: username}
            sid_call_conversation[sid] = conversation_id
            existing_call = None
            started_call = call_snapshot(conversation_id)

    if existing_call:
        emit("call_already_active", {"call": existing_call})
        return

    join_room(call_room(conversation_id))
    emit("call_peers", {"peers": [], "mode": mode, "conversation_id": conversation_id})
    emit_to_conversation_members("call_started", {"call": started_call}, conversation_id)


@socketio.on("join_call")
def handle_join_call(payload: Any) -> None:
    identity = socket_identity()
    if not identity or not isinstance(payload, dict):
        return
    user_id, username = identity
    conversation_id = parse_message_id(payload.get("conversation_id"))
    if not conversation_id or not is_conversation_member(conversation_id, user_id):
        return
    sid = request.sid
    with state_lock:
        call = active_calls.get(conversation_id)
        if not call:
            emit("call_start_error", {"message": "This call has already ended."})
            return
        participants = call_participants.setdefault(conversation_id, {})
        if sid in participants:
            return
        peers = [{"sid": peer_sid, "username": peer_username} for peer_sid, peer_username in participants.items()]
        participants[sid] = username
        sid_call_conversation[sid] = conversation_id
        mode = str(call["mode"])

    join_room(call_room(conversation_id))
    emit("call_peers", {"peers": peers, "mode": mode, "conversation_id": conversation_id})
    socketio.emit(
        "peer_joined",
        {"sid": sid, "username": username, "conversation_id": conversation_id},
        to=call_room(conversation_id),
        skip_sid=sid,
    )
    broadcast_call_state(conversation_id)


@socketio.on("leave_call")
def handle_leave_call(payload: Any = None) -> None:
    sid = request.sid
    conversation_id = sid_call_conversation.get(sid)
    if isinstance(payload, dict):
        requested = parse_message_id(payload.get("conversation_id"))
        if requested:
            conversation_id = requested
    if conversation_id is None:
        return

    call_ended = False
    with state_lock:
        participants = call_participants.get(conversation_id, {})
        username = participants.pop(sid, None)
        sid_call_conversation.pop(sid, None)
        if username and not participants:
            call_participants.pop(conversation_id, None)
            active_calls.pop(conversation_id, None)
            call_ended = True

    leave_room(call_room(conversation_id))
    if username:
        socketio.emit(
            "peer_left",
            {"sid": sid, "username": username, "conversation_id": conversation_id},
            to=call_room(conversation_id),
            skip_sid=sid,
        )
    if call_ended:
        emit_to_conversation_members("call_ended", {"conversation_id": conversation_id}, conversation_id)
    elif username:
        broadcast_call_state(conversation_id)


def relay_to_peer(event_name: str, payload: Any) -> None:
    if not isinstance(payload, dict):
        return
    target = str(payload.get("target", ""))
    data = payload.get("data")
    conversation_id = sid_call_conversation.get(request.sid)
    if not target or conversation_id is None:
        return
    with state_lock:
        participants = call_participants.get(conversation_id, {})
        sender_username = participants.get(request.sid)
        target_exists = target in participants
    if not sender_username or not target_exists:
        return
    socketio.emit(
        event_name,
        {
            "from": request.sid,
            "username": sender_username,
            "data": data,
            "conversation_id": conversation_id,
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
ensure_default_conversation()

if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=True)
