GCHATS SPEED FIX

This patch reduces the number of database queries used when opening a private or group chat.
It replaces the old per-conversation query loop with two batch queries and reuses the selected
conversation already loaded in the inbox.

Install:
1. Stop the server.
2. Back up your project.
3. Replace app.py in C:\PY_project\kulot-friends-chat with this app.py.
4. Run: python app.py
5. Test several group chats.
6. Push to GitHub and wait for Render to redeploy.

No database tables or messages are deleted.
