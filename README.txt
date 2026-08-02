GChats mobile API database-close fix

Replace these files in your backend project:
- app.py
- mobile_api_smoke_test.py

The fix changes db_connect() into a real context manager that commits/rolls back
and always closes SQLite or PostgreSQL connections. This prevents Windows from
locking the temporary friends.db file after the smoke test.
