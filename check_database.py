"""Verify which database the app is using and whether account storage works."""

from app import USE_POSTGRES, db_connect, db_execute


def main() -> None:
    with db_connect() as db:
        row = db_execute(db, "SELECT COUNT(*) AS count FROM users").fetchone()

    backend = "PostgreSQL (permanent cloud database)" if USE_POSTGRES else "SQLite (local file)"
    print(f"Database: {backend}")
    print(f"Registered users: {int(row['count'])}")
    if not USE_POSTGRES:
        print("DATABASE_URL is not configured, so cloud accounts will not be permanent.")


if __name__ == "__main__":
    main()
