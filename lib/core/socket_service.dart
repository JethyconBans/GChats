import 'dart:async';

import 'package:socket_io_client/socket_io_client.dart' as io;

class SocketService {
  io.Socket? _socket;
  Timer? _heartbeat;

  bool get connected => _socket?.connected == true;

  void connect({
    required String baseUrl,
    required String token,
    required void Function(Map<String, dynamic>) onNewMessage,
    required void Function(Map<String, dynamic>) onReactionUpdated,
    required void Function(Map<String, dynamic>) onOnlineUsers,
    required void Function(Map<String, dynamic>) onConversationChanged,
    required void Function(Map<String, dynamic>) onProfileUpdated,
    required void Function() onConnected,
    required void Function(String) onError,
  }) {
    disconnect();
    _socket = io.io(
      baseUrl,
      io.OptionBuilder()
          .setTransports(['websocket', 'polling'])
          .setAuth({'token': token})
          .disableAutoConnect()
          .enableReconnection()
          .setReconnectionAttempts(20)
          .setReconnectionDelay(1200)
          .build(),
    );

    _socket!
      ..onConnect((_) {
        _startHeartbeat();
        onConnected();
      })
      ..onDisconnect((_) {
        _heartbeat?.cancel();
      })
      ..on('new_message', (payload) => _map(payload, onNewMessage))
      ..on('reaction_updated', (payload) => _map(payload, onReactionUpdated))
      ..on('online_users', (payload) => _map(payload, onOnlineUsers))
      ..on('conversation_created', (payload) => _map(payload, onConversationChanged))
      ..on('conversation_updated', (payload) => _map(payload, onConversationChanged))
      ..on('conversation_profile_updated', (payload) => _map(payload, onConversationChanged))
      ..on('conversation_members_updated', (payload) => _map(payload, onConversationChanged))
      ..on('profile_updated', (payload) => _map(payload, onProfileUpdated))
      ..on('chat_error', (payload) {
        if (payload is Map && payload['message'] != null) {
          onError(payload['message'].toString());
        }
      })
      ..onConnectError((error) => onError('Connecting to live chat…'))
      ..connect();
  }

  void sendMessage({
    required int conversationId,
    required String body,
    int? replyToId,
  }) {
    _socket?.emit('send_message', {
      'conversation_id': conversationId,
      'body': body,
      if (replyToId != null) 'reply_to_id': replyToId,
    });
  }

  void disconnect() {
    _heartbeat?.cancel();
    _heartbeat = null;
    _socket?.dispose();
    _socket = null;
  }

  void _startHeartbeat() {
    _heartbeat?.cancel();
    _socket?.emit('presence_heartbeat');
    _heartbeat = Timer.periodic(
      const Duration(seconds: 50),
      (_) => _socket?.emit('presence_heartbeat'),
    );
  }

  void _map(dynamic payload, void Function(Map<String, dynamic>) callback) {
    if (payload is Map) {
      callback(Map<String, dynamic>.from(payload));
    }
  }
}
