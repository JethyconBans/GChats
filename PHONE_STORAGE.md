# Phone storage behavior

## Stored locally

- Conversation list
- Up to the latest 300 cached messages per conversation
- Reactions and reply previews
- Pending text messages created while the network is unavailable
- Login token in Android encrypted storage
- Theme preference
- Viewed images through the image disk cache

## Synchronization

1. GChats opens cached conversations immediately.
2. The selected chat reads its cached messages from SQLite before making a network request.
3. Socket.IO receives only new updates.
4. The background refresh writes new server messages back to SQLite.
5. Failed text messages stay in `pending_messages` and retry after the socket reconnects.

## Not fully offline

- First-time login or registration
- Opening a conversation never cached on the phone
- Sending pictures or videos
- Live presence, calls, and receiving new messages

These still need the cloud backend.
