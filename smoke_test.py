"""Small route test. Run after installing requirements: python smoke_test.py"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

TEST_DB = Path(tempfile.gettempdir()) / "kulot_friends_smoke_test.db"
TEST_DB.unlink(missing_ok=True)

os.environ["DATABASE_PATH"] = str(TEST_DB)
os.environ["INVITE_CODE"] = "TEST-CODE"
os.environ["SECRET_KEY"] = "test-secret-only"

from app import app  # noqa: E402


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

    response = client.get("/health")
    assert response.json == {"status": "ok"}
    print("PASS: auto-login registration, returning login, shared chat, and health route work.")


if __name__ == "__main__":
    try:
        main()
    finally:
        TEST_DB.unlink(missing_ok=True)
        Path(f"{TEST_DB}-shm").unlink(missing_ok=True)
        Path(f"{TEST_DB}-wal").unlink(missing_ok=True)
