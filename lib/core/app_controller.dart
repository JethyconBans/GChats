import 'dart:async';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

import '../data/local_database.dart';
import '../models/models.dart';
import 'api_client.dart';
import 'session_store.dart';
import 'socket_service.dart';

enum AuthStatus { loading, authenticated, unauthenticated }

class AppController extends ChangeNotifier {
  AppController({
    required this.api,
    required this.session,
    required this.database,
    required this.socket,
  });

  final ApiClient api;
  final SessionStore session;
  final LocalDatabase database;
  final SocketService socket;

  AuthStatus authStatus = AuthStatus.loading;
  UserProfile? me;
  List<UserProfile> members = const [];
  List<Conversation> conversations = const [];
  ThemeMode themeMode = ThemeMode.dark;
  bool busy = false;
  bool syncing = false;
  String? transientMessage;

  final Map<int, List<ChatMessage>> _messages = {};
  final Map<int, bool> _hasMore = {};
  Timer? _syncDebounce;
  Timer? _pendingRetryTimer;
  bool _flushingPending = false;

  List<ChatMessage> messagesFor(int conversationId) =>
      List.unmodifiable(_messages[conversationId] ?? const []);

  bool hasMoreFor(int conversationId) => _hasMore[conversationId] ?? true;

  Conversation? conversationById(int id) {
    for (final item in conversations) {
      if (item.id == id) return item;
    }
    return null;
  }

  UserProfile? memberByUsername(String username) {
    for (final item in members) {
      if (item.username.toLowerCase() == username.toLowerCase()) return item;
    }
    return null;
  }

  String mediaUrl(String? raw) => api.absoluteUrl(raw);

  Future<void> initialize() async {
    final prefs = await SharedPreferences.getInstance();
    themeMode = prefs.getBool('dark_mode') == false ? ThemeMode.light : ThemeMode.dark;

    final token = await session.readToken();
    final savedUser = await session.readUser();
    if (token == null || token.isEmpty || savedUser == null) {
      authStatus = AuthStatus.unauthenticated;
      notifyListeners();
      return;
    }

    me = savedUser;
    conversations = await database.getConversations();
    authStatus = AuthStatus.authenticated;
    notifyListeners();
    _connectSocket(token);
    _startPendingRetry();
    unawaited(syncBootstrap());
  }

  Future<void> login(String username, String password) async {
    await _authenticate(() => api.login(username.trim(), password));
  }

  Future<void> register(
    String username,
    String password,
    String inviteCode,
  ) async {
    await _authenticate(
      () => api.register(username.trim(), password, inviteCode.trim()),
    );
  }

  Future<void> _authenticate(
    Future<Map<String, dynamic>> Function() request,
  ) async {
    busy = true;
    transientMessage = null;
    notifyListeners();
    try {
      final data = await request();
      final token = data['token']?.toString() ?? '';
      if (token.isEmpty) throw const ApiException('The server did not return a login token.');
      final user = UserProfile.fromJson(Map<String, dynamic>.from(data['user'] as Map));
      await database.clearAll();
      await session.save(token, user);
      me = user;
      conversations = _conversationList(data['conversations']);
      await database.replaceConversations(conversations);
      authStatus = AuthStatus.authenticated;
      _connectSocket(token);
      _startPendingRetry();
      unawaited(syncBootstrap());
    } finally {
      busy = false;
      notifyListeners();
    }
  }

  Future<void> logout() async {
    busy = true;
    notifyListeners();
    await api.logout();
    socket.disconnect();
    _pendingRetryTimer?.cancel();
    _pendingRetryTimer = null;
    await session.clear();
    await database.clearAll();
    me = null;
    members = const [];
    conversations = const [];
    _messages.clear();
    authStatus = AuthStatus.unauthenticated;
    busy = false;
    notifyListeners();
  }

  Future<void> syncBootstrap() async {
    if (syncing || authStatus != AuthStatus.authenticated) return;
    syncing = true;
    notifyListeners();
    try {
      final data = await api.bootstrap();
      final user = UserProfile.fromJson(Map<String, dynamic>.from(data['user'] as Map));
      me = user;
      await session.saveUser(user);
      members = _memberList(data['members']);
      conversations = _conversationList(data['conversations']);
      await database.replaceConversations(conversations);
      final token = await session.readToken();
      if (token != null && !socket.connected) _connectSocket(token);
      transientMessage = null;
    } on ApiException catch (error) {
      transientMessage = error.message;
      if (error.statusCode == 401) {
        await session.clear();
        authStatus = AuthStatus.unauthenticated;
      }
    } finally {
      syncing = false;
      notifyListeners();
    }
  }

  Future<void> openConversation(int conversationId) async {
    final cached = await database.getMessages(conversationId);
    final pending = await database.getPending(conversationId);
    _messages[conversationId] = [...cached, ...pending]..sort(_messageSort);
    notifyListeners();

    try {
      final data = await api.messages(conversationId);
      final remote = _messageList(data['messages']);
      await database.upsertMessages(remote);
      final freshPending = await database.getPending(conversationId);
      final merged = await database.getMessages(conversationId);
      _messages[conversationId] = [...merged, ...freshPending]..sort(_messageSort);
      _hasMore[conversationId] = data['has_more'] == true;
      notifyListeners();
    } on ApiException catch (error) {
      transientMessage = error.message;
      notifyListeners();
    }
  }

  Future<void> loadOlder(int conversationId) async {
    if (!hasMoreFor(conversationId)) return;
    final current = _messages[conversationId] ?? const [];
    final positiveIds = current.where((item) => item.id > 0).map((item) => item.id).toList();
    if (positiveIds.isEmpty) return;
    final oldestId = positiveIds.reduce((a, b) => a < b ? a : b);
    try {
      final data = await api.messages(conversationId, beforeId: oldestId);
      final remote = _messageList(data['messages']);
      await database.upsertMessages(remote);
      final cached = await database.getMessages(conversationId);
      final pending = await database.getPending(conversationId);
      _messages[conversationId] = [...cached, ...pending]..sort(_messageSort);
      _hasMore[conversationId] = data['has_more'] == true;
      notifyListeners();
    } on ApiException catch (error) {
      transientMessage = error.message;
      notifyListeners();
    }
  }

  Future<void> sendText(
    int conversationId,
    String body, {
    ReplyPreview? replyTo,
  }) async {
    final clean = body.trim();
    if (clean.isEmpty || me == null) return;
    final localId = Uuid().v4();
    final pending = ChatMessage.pending(
      localId: localId,
      conversationId: conversationId,
      username: me!.username,
      body: clean,
      sentAt: DateTime.now(),
      replyTo: replyTo,
    );
    await database.addPending(pending);
    _messages.putIfAbsent(conversationId, () => []).add(pending);
    _messages[conversationId]!.sort(_messageSort);
    notifyListeners();

    try {
      final sent = await api.sendMessage(
        conversationId,
        clean,
        replyToId: replyTo?.id,
      );
      await database.removePending(localId);
      await database.upsertMessage(sent);
      await _reloadMessagesFromCache(conversationId);
      _scheduleConversationSync();
    } on ApiException {
      await database.markPendingFailed(localId, true);
      await _reloadMessagesFromCache(conversationId);
      rethrow;
    }
  }

  Future<void> retryPending(ChatMessage pending) async {
    if (pending.localId == null) return;
    await database.removePending(pending.localId!);
    _messages[pending.conversationId]?.removeWhere(
      (item) => item.localId == pending.localId,
    );
    await sendText(
      pending.conversationId,
      pending.body,
      replyTo: pending.replyTo,
    );
  }

  Future<void> uploadMedia(
    int conversationId,
    XFile file, {
    String caption = '',
    ReplyPreview? replyTo,
  }) async {
    final message = await api.uploadMessage(
      conversationId,
      file.path,
      caption: caption,
      replyToId: replyTo?.id,
    );
    await database.upsertMessage(message);
    await _reloadMessagesFromCache(conversationId);
    _scheduleConversationSync();
  }

  Future<void> toggleReaction(int messageId, String emoji) async {
    await api.toggleReaction(messageId, emoji);
  }

  Future<List<UserProfile>> searchUsers(String query) async {
    final clean = query.trim().toLowerCase();
    if (clean.isEmpty && members.isNotEmpty) {
      return members.where((item) => item.id != me?.id).toList();
    }
    return api.searchUsers(clean);
  }

  Future<Conversation> createPrivate(int userId) async {
    final conversation = await api.createPrivate(userId);
    await database.upsertConversation(conversation);
    await syncBootstrap();
    return conversationById(conversation.id) ?? conversation;
  }

  Future<Conversation> createGroup(String name, List<int> memberIds) async {
    final conversation = await api.createGroup(name, memberIds);
    await database.upsertConversation(conversation);
    await syncBootstrap();
    return conversationById(conversation.id) ?? conversation;
  }

  Future<void> updateProfile({String? bio, String? note}) async {
    final updated = await api.updateProfile(bio: bio, note: note);
    me = updated;
    await session.saveUser(updated);
    notifyListeners();
  }

  Future<void> updateProfilePicture(XFile file) async {
    final updated = await api.updateProfilePicture(file.path);
    me = updated;
    await session.saveUser(updated);
    await syncBootstrap();
  }

  Future<void> removeProfilePicture() async {
    final updated = await api.removeProfilePicture();
    me = updated;
    await session.saveUser(updated);
    await syncBootstrap();
  }

  Future<void> updateGroup(
    int conversationId,
    String name, {
    XFile? picture,
    bool removePicture = false,
  }) async {
    final updated = await api.updateGroup(
      conversationId,
      name,
      filePath: picture?.path,
      removePicture: removePicture,
    );
    await database.upsertConversation(updated);
    await syncBootstrap();
  }

  Future<void> leaveGroup(int conversationId) async {
    await api.leaveGroup(conversationId);
    await syncBootstrap();
  }

  Future<void> deleteAccount(String password) async {
    await api.deleteAccount(password);
    await session.clear();
    await database.clearAll();
    socket.disconnect();
    _pendingRetryTimer?.cancel();
    _pendingRetryTimer = null;
    me = null;
    members = const [];
    conversations = const [];
    _messages.clear();
    authStatus = AuthStatus.unauthenticated;
    notifyListeners();
  }

  Future<void> setDarkMode(bool dark) async {
    themeMode = dark ? ThemeMode.dark : ThemeMode.light;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('dark_mode', dark);
    notifyListeners();
  }

  void clearTransientMessage() {
    transientMessage = null;
  }

  void _connectSocket(String token) {
    socket.connect(
      baseUrl: api.baseUrl,
      token: token,
      onNewMessage: (payload) async {
        final message = ChatMessage.fromJson(payload);
        await database.upsertMessage(message);
        await _reloadMessagesFromCache(message.conversationId);
        _scheduleConversationSync();
      },
      onReactionUpdated: (payload) async {
        final id = (payload['message_id'] as num?)?.toInt();
        final conversationId = (payload['conversation_id'] as num?)?.toInt();
        final raw = payload['reactions'];
        if (id == null || conversationId == null || raw is! List) return;
        final reactions = raw
            .whereType<Map>()
            .map((item) => ReactionSummary.fromJson(Map<String, dynamic>.from(item)))
            .toList();
        await database.updateReactions(id, reactions);
        await _reloadMessagesFromCache(conversationId);
      },
      onOnlineUsers: (payload) {
        final rawMembers = payload['members'];
        if (rawMembers is List) {
          members = rawMembers
              .whereType<Map>()
              .map((item) => UserProfile.fromJson(Map<String, dynamic>.from(item)))
              .toList();
          final online = (payload['users'] as List?)?.map((item) => item.toString()).toSet() ?? <String>{};
          members = members
              .map((item) => item.copyWith(isOnline: online.contains(item.username)))
              .toList();
          conversations = conversations.map((conversation) {
            final updatedMembers = conversation.members.map((member) {
              return member.copyWith(isOnline: online.contains(member.username));
            }).toList();
            return conversation.copyWith(members: updatedMembers);
          }).toList();
          notifyListeners();
        }
      },
      onConversationChanged: (_) => _scheduleConversationSync(),
      onProfileUpdated: (payload) {
        final raw = payload['profile'];
        if (raw is Map) {
          final updated = UserProfile.fromJson(Map<String, dynamic>.from(raw));
          members = [
            for (final member in members)
              if (member.id == updated.id ||
                  member.username.toLowerCase() == updated.username.toLowerCase())
                updated.copyWith(isOnline: member.isOnline)
              else
                member,
          ];
          if (me?.id == updated.id ||
              me?.username.toLowerCase() == updated.username.toLowerCase()) {
            me = updated;
            unawaited(session.saveUser(updated));
          }
          notifyListeners();
        }
      },
      onConnected: () {
        transientMessage = null;
        notifyListeners();
        unawaited(_flushPendingMessages());
        unawaited(syncBootstrap());
      },
      onError: (message) {
        transientMessage = message;
        notifyListeners();
      },
    );
  }

  void _startPendingRetry() {
    _pendingRetryTimer?.cancel();
    _pendingRetryTimer = Timer.periodic(const Duration(seconds: 25), (_) {
      if (socket.connected) {
        unawaited(_flushPendingMessages());
      }
    });
  }

  Future<void> _flushPendingMessages() async {
    if (_flushingPending || authStatus != AuthStatus.authenticated) return;
    _flushingPending = true;
    try {
      final pendingMessages = await database.getAllPending();
      for (final pending in pendingMessages) {
        final localId = pending.localId;
        if (localId == null) continue;
        try {
          final sent = await api.sendMessage(
            pending.conversationId,
            pending.body,
            replyToId: pending.replyTo?.id,
          );
          await database.removePending(localId);
          await database.upsertMessage(sent);
          await _reloadMessagesFromCache(pending.conversationId);
        } on ApiException {
          await database.markPendingFailed(localId, true);
          await _reloadMessagesFromCache(pending.conversationId);
          break;
        }
      }
      if (pendingMessages.isNotEmpty) {
        _scheduleConversationSync();
      }
    } finally {
      _flushingPending = false;
    }
  }

  void _scheduleConversationSync() {
    _syncDebounce?.cancel();
    _syncDebounce = Timer(const Duration(milliseconds: 700), () {
      unawaited(syncBootstrap());
    });
  }

  Future<void> _reloadMessagesFromCache(int conversationId) async {
    final cached = await database.getMessages(conversationId);
    final pending = await database.getPending(conversationId);
    _messages[conversationId] = [...cached, ...pending]..sort(_messageSort);
    notifyListeners();
  }

  List<Conversation> _conversationList(dynamic raw) {
    if (raw is! List) return const [];
    return raw
        .whereType<Map>()
        .map((item) => Conversation.fromJson(Map<String, dynamic>.from(item)))
        .toList();
  }

  List<UserProfile> _memberList(dynamic raw) {
    if (raw is! List) return const [];
    return raw
        .whereType<Map>()
        .map((item) => UserProfile.fromJson(Map<String, dynamic>.from(item)))
        .toList();
  }

  List<ChatMessage> _messageList(dynamic raw) {
    if (raw is! List) return const [];
    return raw
        .whereType<Map>()
        .map((item) => ChatMessage.fromJson(Map<String, dynamic>.from(item)))
        .toList();
  }

  static int _messageSort(ChatMessage a, ChatMessage b) => a.sentAt.compareTo(b.sentAt);

  @override
  void dispose() {
    _syncDebounce?.cancel();
    _pendingRetryTimer?.cancel();
    socket.disconnect();
    super.dispose();
  }
}
