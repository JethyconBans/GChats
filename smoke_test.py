"""Small route test. Run after installing requirements: python smoke_test.py"""

from __future__ import annotations

import io
import os
import shutil
import tempfile
from pathlib import Path

TEST_DB = Path(tempfile.gettempdir()) / "kulot_friends_smoke_test.db"
TEST_DB.unlink(missing_ok=True)
TEST_UPLOAD_DIR = Path(tempfile.gettempdir()) / "kulot_friends_smoke_uploads"
shutil.rmtree(TEST_UPLOAD_DIR, ignore_errors=True)

os.environ["DATABASE_PATH"] = str(TEST_DB)
os.environ["INVITE_CODE"] = "TEST-CODE"
os.environ["SECRET_KEY"] = "test-secret-only"
os.environ["UPLOAD_DIR"] = str(TEST_UPLOAD_DIR)
os.environ.pop("DATABASE_URL", None)
os.environ.pop("CLOUDINARY_URL", None)

from app import app, socketio  # noqa: E402


def csrf_from(response) -> str:
    html = response.get_data(as_text=True)
    marker = 'name="csrf_token" value="'
    start = html.index(marker) + len(marker)
    return html[start : html.index('"', start)]


def main() -> None:
    client = app.test_client()

    response = client.get("/register")
    assert response.status_code == 200
    csrf = csrf_from(response)

    response = client.post(
        "/register",
        data={
            "csrf_token": csrf,
            "username": "TestFriend",
            "password": "password123",
            "invite_code": "TEST-CODE",
        },
        follow_redirects=True,
    )
    assert response.status_code == 200
    assert b"Welcome! You are now in the friends chat." in response.data
    assert b"Message Kulot Friends" in response.data

    response = client.post(
        "/logout",
        data={"csrf_token": csrf_from(response)},
        follow_redirects=True,
    )
    assert response.status_code == 200

    response = client.get("/login")
    csrf = csrf_from(response)
    response = client.post(
        "/login",
        data={
            "csrf_token": csrf,
            "username": "TestFriend",
            "password": "password123",
        },
        follow_redirects=True,
    )
    assert response.status_code == 200
    assert b"Message Kulot Friends" in response.data

    profile_csrf = csrf_from(response)
    response = client.post(
        "/api/profile/note",
        headers={"X-CSRF-Token": profile_csrf},
        json={"note": "Testing my note"},
    )
    assert response.status_code == 200, response.get_data(as_text=True)
    assert response.get_json()["profile"]["note"] == "Testing my note"

    response = client.post(
        "/api/profile/picture",
        headers={"X-CSRF-Token": profile_csrf},
        data={
            "file": (io.BytesIO(b"fake profile image"), "profile.png", "image/png"),
        },
        content_type="multipart/form-data",
    )
    assert response.status_code == 200, response.get_data(as_text=True)
    profile_picture_url = response.get_json()["profile"]["profile_picture_url"]
    assert profile_picture_url.startswith("/profile-uploads/")
    assert client.get(profile_picture_url).status_code == 200

    socket_client = socketio.test_client(app, flask_test_client=client)
    assert socket_client.is_connected()
    socket_client.get_received()

    socket_client.emit("send_message", {"body": "First message"})
    received = socket_client.get_received()
    first_event = next(item for item in received if item["name"] == "new_message")
    first_message = first_event["args"][0]
    assert first_message["body"] == "First message"
    assert first_message["reply_to"] is None
    assert first_message["profile_picture_url"] == profile_picture_url

    socket_client.emit(
        "send_message",
        {"body": "This is a reply", "reply_to_id": first_message["id"]},
    )
    received = socket_client.get_received()
    reply_event = next(item for item in received if item["name"] == "new_message")
    reply_message = reply_event["args"][0]
    assert reply_message["reply_to"]["id"] == first_message["id"]
    assert reply_message["reply_to"]["body"] == "First message"

    socket_client.emit(
        "toggle_reaction",
        {"message_id": first_message["id"], "emoji": "❤️"},
    )
    received = socket_client.get_received()
    reaction_event = next(item for item in received if item["name"] == "reaction_updated")
    reaction_payload = reaction_event["args"][0]
    assert reaction_payload["message_id"] == first_message["id"]
    assert reaction_payload["reactions"][0]["emoji"] == "❤️"
    assert reaction_payload["reactions"][0]["count"] == 1

    latest_message_id = int(reply_message["id"])
    for index in range(55):
        socket_client.emit("send_message", {"body": f"History message {index}"})
        received = socket_client.get_received()
        event = next(item for item in received if item["name"] == "new_message")
        latest_message_id = int(event["args"][0]["id"])

    response = client.get(f"/api/messages/history?before_id={latest_message_id}&limit=20")
    assert response.status_code == 200
    history = response.get_json()
    assert len(history["messages"]) == 20
    assert history["has_more"] is True
    assert all(int(message["id"]) < latest_message_id for message in history["messages"])

    upload_csrf = csrf_from(client.get("/chat"))
    response = client.post(
        "/api/messages/upload",
        headers={"X-CSRF-Token": upload_csrf},
        data={
            "caption": "Test picture caption",
            "reply_to_id": str(first_message["id"]),
            "file": (io.BytesIO(b"fake image contents"), "test.png", "image/png"),
        },
        content_type="multipart/form-data",
    )
    assert response.status_code == 201, response.get_data(as_text=True)
    uploaded_message = response.get_json()["message"]
    assert uploaded_message["message_type"] == "image"
    assert uploaded_message["body"] == "Test picture caption"
    assert uploaded_message["attachment_url"].startswith("/uploads/")
    assert uploaded_message["reply_to"]["id"] == first_message["id"]

    response = client.get(uploaded_message["attachment_url"])
    assert response.status_code == 200

    response = client.get("/health")
    assert response.json == {"status": "ok"}
    socket_client.disconnect()
    print("PASS: login, profile picture, 24-hour note, history, replies, reactions, uploads, and health work.")


if __name__ == "__main__":
    try:
        main()
    finally:
        TEST_DB.unlink(missing_ok=True)
        Path(f"{TEST_DB}-shm").unlink(missing_ok=True)
        Path(f"{TEST_DB}-wal").unlink(missing_ok=True)
        shutil.rmtree(TEST_UPLOAD_DIR, ignore_errors=True)
