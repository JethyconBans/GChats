import 'dart:convert';

import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';

import '../models/models.dart';

class LocalDatabase {
  Database? _database;

  Future<Database> get database async {
    if (_database != null) return _database!;
    final root = await getDatabasesPath();
    _database = await openDatabase(
      p.join(root, 'gchats_native.db'),
      version: 1,
      onCreate: (db, version) async {
        await db.execute('''
          CREATE TABLE conversations (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            avatar_url TEXT,
            member_count INTEGER NOT NULL,
            members_json TEXT NOT NULL,
            is_default INTEGER NOT NULL,
            can_edit INTEGER NOT NULL,
            last_message_id INTEGER NOT NULL,
            last_message TEXT NOT NULL,
            last_sender TEXT NOT NULL,
            last_sent_at TEXT
          )
        ''');
        await db.execute('''
          CREATE TABLE messages (
            id INTEGER PRIMARY KEY,
            conversation_id INTEGER NOT NULL,
            username TEXT NOT NULL,
            body TEXT NOT NULL,
            sent_at TEXT NOT NULL,
            message_type TEXT NOT NULL,
            attachment_url TEXT,
            attachment_name TEXT,
            attachment_mime TEXT,
            reply_json TEXT,
            reactions_json TEXT NOT NULL,
            profile_picture_url TEXT
          )
        ''');
        await db.execute(
          'CREATE INDEX idx_messages_conversation ON messages(conversation_id, id)',
        );
        await db.execute('''
          CREATE TABLE pending_messages (
            local_id TEXT PRIMARY KEY,
            conversation_id INTEGER NOT NULL,
            username TEXT NOT NULL,
            body TEXT NOT NULL,
            created_at TEXT NOT NULL,
            reply_json TEXT,
            failed INTEGER NOT NULL DEFAULT 0
          )
        ''');
      },
    );
    return _database!;
  }

  Future<void> clearAll() async {
    final db = await database;
    await db.transaction((txn) async {
      await txn.delete('pending_messages');
      await txn.delete('messages');
      await txn.delete('conversations');
    });
  }

  Future<void> replaceConversations(List<Conversation> conversations) async {
    final db = await database;
    await db.transaction((txn) async {
      await txn.delete('conversations');
      final batch = txn.batch();
      for (final conversation in conversations) {
        batch.insert(
          'conversations',
          _conversationMap(conversation),
          conflictAlgorithm: ConflictAlgorithm.replace,
        );
      }
      await batch.commit(noResult: true);
    });
  }

  Future<void> upsertConversation(Conversation conversation) async {
    final db = await database;
    await db.insert(
      'conversations',
      _conversationMap(conversation),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<List<Conversation>> getConversations() async {
    final db = await database;
    final rows = await db.query(
      'conversations',
      orderBy: 'COALESCE(last_message_id, 0) DESC',
    );
    return rows.map(_conversationFromMap).toList();
  }

  Future<void> upsertMessages(List<ChatMessage> messages) async {
    if (messages.isEmpty) return;
    final db = await database;
    final batch = db.batch();
    for (final message in messages) {
      if (message.id <= 0) continue;
      batch.insert(
        'messages',
        _messageMap(message),
        conflictAlgorithm: ConflictAlgorithm.replace,
      );
    }
    await batch.commit(noResult: true);
  }

  Future<void> upsertMessage(ChatMessage message) => upsertMessages([message]);

  Future<List<ChatMessage>> getMessages(int conversationId) async {
    final db = await database;
    final rows = await db.query(
      'messages',
      where: 'conversation_id = ?',
      whereArgs: [conversationId],
      orderBy: 'id ASC',
      limit: 300,
    );
    return rows.map(_messageFromMap).toList();
  }

  Future<void> updateReactions(
    int messageId,
    List<ReactionSummary> reactions,
  ) async {
    final db = await database;
    await db.update(
      'messages',
      {'reactions_json': jsonEncode(reactions.map((item) => item.toJson()).toList())},
      where: 'id = ?',
      whereArgs: [messageId],
    );
  }

  Future<void> addPending(ChatMessage message) async {
    if (message.localId == null) return;
    final db = await database;
    await db.insert(
      'pending_messages',
      {
        'local_id': message.localId,
        'conversation_id': message.conversationId,
        'username': message.username,
        'body': message.body,
        'created_at': message.sentAt.toUtc().toIso8601String(),
        'reply_json': message.replyTo == null ? null : jsonEncode(message.replyTo!.toJson()),
        'failed': message.failed ? 1 : 0,
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<void> markPendingFailed(String localId, bool failed) async {
    final db = await database;
    await db.update(
      'pending_messages',
      {'failed': failed ? 1 : 0},
      where: 'local_id = ?',
      whereArgs: [localId],
    );
  }

  Future<void> removePending(String localId) async {
    final db = await database;
    await db.delete('pending_messages', where: 'local_id = ?', whereArgs: [localId]);
  }

  Future<List<ChatMessage>> getPending(int conversationId) async {
    final db = await database;
    final rows = await db.query(
      'pending_messages',
      where: 'conversation_id = ?',
      whereArgs: [conversationId],
      orderBy: 'created_at ASC',
    );
    return rows.map(_pendingFromMap).toList();
  }

  Future<List<ChatMessage>> getAllPending() async {
    final db = await database;
    final rows = await db.query(
      'pending_messages',
      orderBy: 'created_at ASC',
    );
    return rows.map(_pendingFromMap).toList();
  }

  ChatMessage _pendingFromMap(Map<String, Object?> row) {
    final rawReply = row['reply_json']?.toString();
    return ChatMessage.pending(
      localId: row['local_id']!.toString(),
      conversationId: row['conversation_id'] as int,
      username: row['username']!.toString(),
      body: row['body']!.toString(),
      sentAt: DateTime.parse(row['created_at']!.toString()).toLocal(),
      replyTo: rawReply == null
          ? null
          : ReplyPreview.fromJson(
              Map<String, dynamic>.from(jsonDecode(rawReply) as Map),
            ),
      failed: row['failed'] == 1,
    );
  }

  Map<String, Object?> _conversationMap(Conversation value) => {
        'id': value.id,
        'name': value.name,
        'type': value.type,
        'avatar_url': value.avatarUrl,
        'member_count': value.memberCount,
        'members_json': jsonEncode(value.members.map((item) => item.toJson()).toList()),
        'is_default': value.isDefault ? 1 : 0,
        'can_edit': value.canEdit ? 1 : 0,
        'last_message_id': value.lastMessageId,
        'last_message': value.lastMessage,
        'last_sender': value.lastSender,
        'last_sent_at': value.lastSentAt?.toUtc().toIso8601String(),
      };

  Conversation _conversationFromMap(Map<String, Object?> row) {
    final members = (jsonDecode(row['members_json']!.toString()) as List)
        .whereType<Map>()
        .map((item) => UserProfile.fromJson(Map<String, dynamic>.from(item)))
        .toList();
    return Conversation(
      id: row['id'] as int,
      name: row['name']!.toString(),
      type: row['type']!.toString(),
      avatarUrl: row['avatar_url']?.toString(),
      memberCount: row['member_count'] as int,
      members: members,
      isDefault: row['is_default'] == 1,
      canEdit: row['can_edit'] == 1,
      lastMessageId: row['last_message_id'] as int,
      lastMessage: row['last_message']!.toString(),
      lastSender: row['last_sender']!.toString(),
      lastSentAt: row['last_sent_at'] == null
          ? null
          : DateTime.parse(row['last_sent_at']!.toString()).toLocal(),
    );
  }

  Map<String, Object?> _messageMap(ChatMessage value) => {
        'id': value.id,
        'conversation_id': value.conversationId,
        'username': value.username,
        'body': value.body,
        'sent_at': value.sentAt.toUtc().toIso8601String(),
        'message_type': value.messageType,
        'attachment_url': value.attachmentUrl,
        'attachment_name': value.attachmentName,
        'attachment_mime': value.attachmentMime,
        'reply_json': value.replyTo == null ? null : jsonEncode(value.replyTo!.toJson()),
        'reactions_json': jsonEncode(value.reactions.map((item) => item.toJson()).toList()),
        'profile_picture_url': value.profilePictureUrl,
      };

  ChatMessage _messageFromMap(Map<String, Object?> row) {
    final replyJson = row['reply_json']?.toString();
    final reactions = (jsonDecode(row['reactions_json']!.toString()) as List)
        .whereType<Map>()
        .map((item) => ReactionSummary.fromJson(Map<String, dynamic>.from(item)))
        .toList();
    return ChatMessage(
      id: row['id'] as int,
      conversationId: row['conversation_id'] as int,
      username: row['username']!.toString(),
      body: row['body']!.toString(),
      sentAt: DateTime.parse(row['sent_at']!.toString()).toLocal(),
      messageType: row['message_type']!.toString(),
      attachmentUrl: row['attachment_url']?.toString(),
      attachmentName: row['attachment_name']?.toString(),
      attachmentMime: row['attachment_mime']?.toString(),
      replyTo: replyJson == null
          ? null
          : ReplyPreview.fromJson(Map<String, dynamic>.from(jsonDecode(replyJson) as Map)),
      reactions: reactions,
      profilePictureUrl: row['profile_picture_url']?.toString(),
    );
  }
}
