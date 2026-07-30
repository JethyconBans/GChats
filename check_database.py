"""Verify permanent database and media-storage configuration."""

from app import USE_CLOUDINARY, USE_POSTGRES, db_connect, db_execute


def main() -> None:
    with db_connect() as db:
        users = db_execute(db, "SELECT COUNT(*) AS count FROM users").fetchone()
        messages = db_execute(db, "SELECT COUNT(*) AS count FROM messages").fetchone()
        reactions = db_execute(db, "SELECT COUNT(*) AS count FROM message_reactions").fetchone()

    backend = "PostgreSQL (permanent cloud database)" if USE_POSTGRES else "SQLite (local file)"
    media = "Cloudinary (permanent cloud media)" if USE_CLOUDINARY else "Local uploads (temporary on Render)"
    print(f"Database: {backend}")
    print(f"Media storage: {media}")
    print(f"Registered users: {int(users['count'])}")
    print(f"Saved messages: {int(messages['count'])}")
    print(f"Saved reactions: {int(reactions['count'])}")
    if not USE_POSTGRES:
        print("WARNING: DATABASE_URL is not configured, so cloud conversations will not be permanent.")
    if not USE_CLOUDINARY:
        print("WARNING: CLOUDINARY_URL is not configured, so pictures/videos may disappear on Render.")


if __name__ == "__main__":
    main()
