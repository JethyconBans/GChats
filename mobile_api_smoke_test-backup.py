"""Run after installing requirements: python mobile_api_smoke_test.py"""
from __future__ import annotations

import importlib.util
import os
import tempfile
from pathlib import Path


def load_app():
    temp = tempfile.TemporaryDirectory()
    root = Path(temp.name)
    os.environ.pop("DATABASE_URL", None)
    os.environ["DATABASE_PATH"] = str(root / "friends.db")
    os.environ["UPLOAD_DIR"] = str(root / "uploads")
    os.environ["INVITE_CODE"] = "TEST-INVITE"
    os.environ["SECRET_KEY"] = "test-secret"

    module_path = Path(__file__).with_name("app.py")
    spec = importlib.util.spec_from_file_location("gchats_test_app", module_path)
    if not spec or not spec.loader:
        raise RuntimeError("Could not load app.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return temp, module


def main() -> None:
    temp, module = load_app()
    try:
        with module.app.test_client() as client:
            register = client.post(
                "/api/mobile/auth/register",
                json={
                    "username": "mobiletester",
                    "password": "StrongPass123",
                    "invite_code": "TEST-INVITE",
                    "device_name": "Smoke test",
                },
            )
            assert register.status_code == 201, register.get_data(as_text=True)
            token = register.get_json()["token"]
            headers = {"Authorization": f"Bearer {token}"}

            bootstrap = client.get("/api/mobile/bootstrap", headers=headers)
            assert bootstrap.status_code == 200, bootstrap.get_data(as_text=True)
            conversations = bootstrap.get_json()["conversations"]
            assert conversations, "Default conversation was not created."
            conversation_id = conversations[0]["id"]

            sent = client.post(
                f"/api/mobile/conversations/{conversation_id}/messages",
                headers=headers,
                json={"body": "Hello from the native API"},
            )
            assert sent.status_code == 201, sent.get_data(as_text=True)

            history = client.get(
                f"/api/mobile/conversations/{conversation_id}/messages",
                headers=headers,
            )
            assert history.status_code == 200, history.get_data(as_text=True)
            assert history.get_json()["messages"][-1]["body"] == "Hello from the native API"

        print("PASS: mobile register, token login, bootstrap, send, and history work.")
    finally:
        temp.cleanup()


if __name__ == "__main__":
    main()
