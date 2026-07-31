"""Functional smoke test. Run after installing requirements: python smoke_test.py"""

from __future__ import annotations

import io
import os
import shutil
import tempfile
from pathlib import Path

TEST_DB = Path(tempfile.gettempdir()) / "gchats_smoke_test.db"
TEST_DB.unlink(missing_ok=True)
TEST_UPLOAD_DIR = Path(tempfile.gettempdir()) / "gchats_smoke_uploads"
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


def register(client, username: str) -> None:
    page = client.get("/register")
    response = client.post(
        "/register",
        data={
            "csrf_token": csrf_from(page),
            "username": username,
            "password": "password123",
            "invite_code": "TEST-CODE",
        },
        follow_redirects=True,
    )
    assert response.status_code == 200
    assert b"messenger" in response.data.lower()


def main() -> None:
    alice = app.test_client()
    bob = app.test_client()
    register(alice, "Alice")
    register(bob, "Bob")

    alice_inbox = alice.get("/chat")
    alice_csrf = csrf_from(alice_inbox)

    response = alice.post(
        "/api/profile/bio",
        headers={"X-CSRF-Token": alice_csrf},
        json={"bio": "Builder, gamer, and friend."},
    )
    assert response.status_code == 200, response.get_data(as_text=True)
    assert response.get_json()["profile"]["bio"] == "Builder, gamer, and friend."

    response = alice.post(
        "/api/conversations/private",
        headers={"X-CSRF-Token": alice_csrf},
        json={"user_id": 2},
    )
    assert response.status_code == 201, response.get_data(as_text=True)
    private_id = int(response.get_json()["conversation_id"])

    assert alice.get(f"/chat/{private_id}").status_code == 200
    assert bob.get(f"/chat/{private_id}").status_code == 200

    alice_socket = socketio.test_client(app, flask_test_client=alice)
    bob_socket = socketio.test_client(app, flask_test_client=bob)
    assert alice_socket.is_connected() and bob_socket.is_connected()
    alice_socket.get_received()
    bob_socket.get_received()

    alice_socket.emit(
        "send_message",
        {"conversation_id": private_id, "body": "Private hello"},
    )
    alice_events = alice_socket.get_received()
    bob_events = bob_socket.get_received()
    first = next(event for event in alice_events if event["name"] == "new_message")["args"][0]
    assert first["conversation_id"] == private_id
    assert first["body"] == "Private hello"
    assert any(event["name"] == "new_message" for event in bob_events)

    bob_socket.emit(
        "send_message",
        {
            "conversation_id": private_id,
            "body": "Private reply",
            "reply_to_id": first["id"],
        },
    )
    reply_events = bob_socket.get_received()
    reply = next(event for event in reply_events if event["name"] == "new_message")["args"][0]
    assert reply["reply_to"]["id"] == first["id"]

    alice_socket.get_received()
    alice_socket.emit("toggle_reaction", {"message_id": reply["id"], "emoji": "❤️"})
    reaction_events = alice_socket.get_received()
    reaction = next(event for event in reaction_events if event["name"] == "reaction_updated")["args"][0]
    assert reaction["conversation_id"] == private_id
    assert reaction["reactions"][0]["emoji"] == "❤️"

    response = alice.post(
        "/api/conversations/group",
        headers={"X-CSRF-Token": alice_csrf},
        json={"name": "Test Squad", "member_ids": [2]},
    )
    assert response.status_code == 201, response.get_data(as_text=True)
    group_id = int(response.get_json()["conversation_id"])
    assert group_id != private_id
    group_page = bob.get(f"/chat/{group_id}")
    assert group_page.status_code == 200
    assert b"Test Squad" in group_page.data
    assert b'group-member-search' in alice_inbox.data

    group_csrf = csrf_from(alice.get(f"/chat/{group_id}"))
    response = alice.post(
        f"/api/conversations/{group_id}/profile",
        headers={"X-CSRF-Token": group_csrf},
        data={
            "name": "Renamed Squad",
            "file": (io.BytesIO(b"fake group image"), "group.png", "image/png"),
        },
        content_type="multipart/form-data",
    )
    assert response.status_code == 200, response.get_data(as_text=True)
    updated_group = response.get_json()["conversation"]
    assert updated_group["name"] == "Renamed Squad"
    assert updated_group["avatar_url"]
    assert alice.get(updated_group["avatar_url"]).status_code == 200
    assert b"Renamed Squad" in bob.get(f"/chat/{group_id}").data
    assert b'group-options-button' in alice.get(f"/chat/{group_id}").data
    assert b'group-members-modal' in alice.get(f"/chat/{group_id}").data

    bob_group_csrf = csrf_from(bob.get(f"/chat/{group_id}"))
    response = bob.post(
        f"/api/conversations/{group_id}/leave",
        headers={"X-CSRF-Token": bob_group_csrf},
    )
    assert response.status_code == 200, response.get_data(as_text=True)
    assert bob.get(f"/chat/{group_id}").status_code == 302
    assert alice.get(f"/chat/{group_id}").status_code == 200

    response = alice.post(
        "/api/messages/upload",
        headers={"X-CSRF-Token": group_csrf},
        data={
            "conversation_id": str(group_id),
            "caption": "Group picture",
            "file": (io.BytesIO(b"fake image"), "test.png", "image/png"),
        },
        content_type="multipart/form-data",
    )
    assert response.status_code == 201, response.get_data(as_text=True)
    uploaded = response.get_json()["message"]
    assert uploaded["conversation_id"] == group_id
    assert uploaded["message_type"] == "image"
    assert alice.get(uploaded["attachment_url"]).status_code == 200
    download = alice.get(f"/api/messages/{uploaded['id']}/download")
    assert download.status_code == 200
    assert "attachment" in download.headers.get("Content-Disposition", "").lower()

    latest_id = int(reply["id"])
    for index in range(25):
        alice_socket.emit(
            "send_message",
            {"conversation_id": private_id, "body": f"History {index}"},
        )
        events = alice_socket.get_received()
        latest_id = int(next(event for event in events if event["name"] == "new_message")["args"][0]["id"])
        bob_socket.get_received()

    response = alice.get(
        f"/api/messages/history?conversation_id={private_id}&before_id={latest_id}&limit=20"
    )
    assert response.status_code == 200
    history = response.get_json()
    assert len(history["messages"]) == 20
    assert all(item["conversation_id"] == private_id for item in history["messages"])

    assert alice.get("/health").json == {"status": "ok"}

    alice_socket.get_received()
    bob_socket.disconnect()
    presence_events = [
        event for event in alice_socket.get_received() if event["name"] == "online_users"
    ]
    assert presence_events, "Disconnect should broadcast updated active status."
    presence = presence_events[-1]["args"][0]
    assert "Bob" not in presence["users"]
    bob_member = next(member for member in presence["members"] if member["username"] == "Bob")
    assert bob_member["last_seen_at"], "Offline users should have a last-seen time."

    alice_socket.disconnect()
    print("PASS: accounts, profiles, active status, private/group chats, GC member settings and leave, media downloads, replies, reactions, uploads, and history work.")


if __name__ == "__main__":
    try:
        main()
    finally:
        TEST_DB.unlink(missing_ok=True)
        Path(f"{TEST_DB}-shm").unlink(missing_ok=True)
        Path(f"{TEST_DB}-wal").unlink(missing_ok=True)
        shutil.rmtree(TEST_UPLOAD_DIR, ignore_errors=True)
