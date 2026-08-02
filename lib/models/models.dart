import 'dart:convert';

class UserProfile {
  const UserProfile({
    required this.id,
    required this.username,
    this.profilePictureUrl,
    this.note = '',
    this.bio = '',
    this.lastSeenAt,
    this.isOnline = false,
  });

  final int id;
  final String username;
  final String? profilePictureUrl;
  final String note;
  final String bio;
  final DateTime? lastSeenAt;
  final bool isOnline;

  factory UserProfile.fromJson(Map<String, dynamic> json) {
    return UserProfile(
      id: (json['id'] as num?)?.toInt() ?? 0,
      username: json['username']?.toString() ?? '',
      profilePictureUrl: json['profile_picture_url']?.toString(),
      note: json['note']?.toString() ?? '',
      bio: json['bio']?.toString() ?? '',
      lastSeenAt: _date(json['last_seen_at']),
      isOnline: json['is_online'] == true,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'username': username,
        'profile_picture_url': profilePictureUrl,
        'note': note,
        'bio': bio,
        'last_seen_at': lastSeenAt?.toIso8601String(),
        'is_online': isOnline,
      };

  UserProfile copyWith({
    String? profilePictureUrl,
    bool clearProfilePicture = false,
    String? note,
    String? bio,
    DateTime? lastSeenAt,
    bool? isOnline,
  }) {
    return UserProfile(
      id: id,
      username: username,
      profilePictureUrl:
          clearProfilePicture ? null : profilePictureUrl ?? this.profilePictureUrl,
      note: note ?? this.note,
      bio: bio ?? this.bio,
      lastSeenAt: lastSeenAt ?? this.lastSeenAt,
      isOnline: isOnline ?? this.isOnline,
    );
  }
}

class Conversation {
  const Conversation({
    required this.id,
    required this.name,
    required this.type,
    this.avatarUrl,
    this.memberCount = 0,
    this.members = const [],
    this.isDefault = false,
    this.canEdit = false,
    this.lastMessageId = 0,
    this.lastMessage = '',
    this.lastSender = '',
    this.lastSentAt,
  });

  final int id;
  final String name;
  final String type;
  final String? avatarUrl;
  final int memberCount;
  final List<UserProfile> members;
  final bool isDefault;
  final bool canEdit;
  final int lastMessageId;
  final String lastMessage;
  final String lastSender;
  final DateTime? lastSentAt;

  bool get isGroup => type == 'group';

  factory Conversation.fromJson(Map<String, dynamic> json) {
    final rawMembers = json['members'];
    return Conversation(
      id: (json['id'] as num?)?.toInt() ?? 0,
      name: json['name']?.toString() ?? 'Conversation',
      type: json['type']?.toString() ?? 'direct',
      avatarUrl: json['avatar_url']?.toString(),
      memberCount: (json['member_count'] as num?)?.toInt() ?? 0,
      members: rawMembers is List
          ? rawMembers
              .whereType<Map>()
              .map((item) => UserProfile.fromJson(Map<String, dynamic>.from(item)))
              .toList()
          : const [],
      isDefault: json['is_default'] == true,
      canEdit: json['can_edit'] == true,
      lastMessageId: (json['last_message_id'] as num?)?.toInt() ?? 0,
      lastMessage: json['last_message']?.toString() ?? '',
      lastSender: json['last_sender']?.toString() ?? '',
      lastSentAt: _date(json['last_sent_at']),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'type': type,
        'avatar_url': avatarUrl,
        'member_count': memberCount,
        'members': members.map((member) => member.toJson()).toList(),
        'is_default': isDefault,
        'can_edit': canEdit,
        'last_message_id': lastMessageId,
        'last_message': lastMessage,
        'last_sender': lastSender,
        'last_sent_at': lastSentAt?.toIso8601String(),
      };

  Conversation copyWith({
    String? name,
    String? avatarUrl,
    bool clearAvatar = false,
    int? memberCount,
    List<UserProfile>? members,
    int? lastMessageId,
    String? lastMessage,
    String? lastSender,
    DateTime? lastSentAt,
  }) =>
      Conversation(
        id: id,
        name: name ?? this.name,
        type: type,
        avatarUrl: clearAvatar ? null : avatarUrl ?? this.avatarUrl,
        memberCount: memberCount ?? this.memberCount,
        members: members ?? this.members,
        isDefault: isDefault,
        canEdit: canEdit,
        lastMessageId: lastMessageId ?? this.lastMessageId,
        lastMessage: lastMessage ?? this.lastMessage,
        lastSender: lastSender ?? this.lastSender,
        lastSentAt: lastSentAt ?? this.lastSentAt,
      );
}

class ReplyPreview {
  const ReplyPreview({
    required this.id,
    required this.username,
    required this.body,
    required this.messageType,
    this.attachmentName,
  });

  final int id;
  final String username;
  final String body;
  final String messageType;
  final String? attachmentName;

  factory ReplyPreview.fromJson(Map<String, dynamic> json) => ReplyPreview(
        id: (json['id'] as num?)?.toInt() ?? 0,
        username: json['username']?.toString() ?? 'Friend',
        body: json['body']?.toString() ?? '',
        messageType: json['message_type']?.toString() ?? 'text',
        attachmentName: json['attachment_name']?.toString(),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'username': username,
        'body': body,
        'message_type': messageType,
        'attachment_name': attachmentName,
      };
}

class ReactionSummary {
  const ReactionSummary({
    required this.emoji,
    required this.count,
    required this.users,
  });

  final String emoji;
  final int count;
  final List<String> users;

  factory ReactionSummary.fromJson(Map<String, dynamic> json) => ReactionSummary(
        emoji: json['emoji']?.toString() ?? '',
        count: (json['count'] as num?)?.toInt() ?? 0,
        users: (json['users'] as List?)?.map((value) => value.toString()).toList() ?? const [],
      );

  Map<String, dynamic> toJson() => {
        'emoji': emoji,
        'count': count,
        'users': users,
      };
}

class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.conversationId,
    required this.username,
    required this.body,
    required this.sentAt,
    this.messageType = 'text',
    this.attachmentUrl,
    this.attachmentName,
    this.attachmentMime,
    this.replyTo,
    this.reactions = const [],
    this.profilePictureUrl,
    this.localId,
    this.pending = false,
    this.failed = false,
  });

  final int id;
  final int conversationId;
  final String username;
  final String body;
  final DateTime sentAt;
  final String messageType;
  final String? attachmentUrl;
  final String? attachmentName;
  final String? attachmentMime;
  final ReplyPreview? replyTo;
  final List<ReactionSummary> reactions;
  final String? profilePictureUrl;
  final String? localId;
  final bool pending;
  final bool failed;

  bool get isMedia => messageType == 'image' || messageType == 'video';

  factory ChatMessage.fromJson(Map<String, dynamic> json) {
    final rawReply = json['reply_to'];
    final rawReactions = json['reactions'];
    return ChatMessage(
      id: (json['id'] as num?)?.toInt() ?? 0,
      conversationId: (json['conversation_id'] as num?)?.toInt() ?? 0,
      username: json['username']?.toString() ?? '',
      body: json['body']?.toString() ?? '',
      sentAt: _date(json['sent_at']) ?? DateTime.now().toUtc(),
      messageType: json['message_type']?.toString() ?? 'text',
      attachmentUrl: json['attachment_url']?.toString(),
      attachmentName: json['attachment_name']?.toString(),
      attachmentMime: json['attachment_mime']?.toString(),
      replyTo: rawReply is Map
          ? ReplyPreview.fromJson(Map<String, dynamic>.from(rawReply))
          : null,
      reactions: rawReactions is List
          ? rawReactions
              .whereType<Map>()
              .map((item) => ReactionSummary.fromJson(Map<String, dynamic>.from(item)))
              .toList()
          : const [],
      profilePictureUrl: json['profile_picture_url']?.toString(),
    );
  }

  factory ChatMessage.pending({
    required String localId,
    required int conversationId,
    required String username,
    required String body,
    required DateTime sentAt,
    ReplyPreview? replyTo,
    bool failed = false,
  }) {
    return ChatMessage(
      id: -sentAt.microsecondsSinceEpoch,
      localId: localId,
      conversationId: conversationId,
      username: username,
      body: body,
      sentAt: sentAt,
      replyTo: replyTo,
      pending: !failed,
      failed: failed,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'conversation_id': conversationId,
        'username': username,
        'body': body,
        'sent_at': sentAt.toUtc().toIso8601String(),
        'message_type': messageType,
        'attachment_url': attachmentUrl,
        'attachment_name': attachmentName,
        'attachment_mime': attachmentMime,
        'reply_to': replyTo?.toJson(),
        'reactions': reactions.map((reaction) => reaction.toJson()).toList(),
        'profile_picture_url': profilePictureUrl,
      };

  ChatMessage copyWith({
    List<ReactionSummary>? reactions,
    bool? pending,
    bool? failed,
  }) =>
      ChatMessage(
        id: id,
        conversationId: conversationId,
        username: username,
        body: body,
        sentAt: sentAt,
        messageType: messageType,
        attachmentUrl: attachmentUrl,
        attachmentName: attachmentName,
        attachmentMime: attachmentMime,
        replyTo: replyTo,
        reactions: reactions ?? this.reactions,
        profilePictureUrl: profilePictureUrl,
        localId: localId,
        pending: pending ?? this.pending,
        failed: failed ?? this.failed,
      );
}

DateTime? _date(dynamic value) {
  if (value == null || value.toString().isEmpty) return null;
  return DateTime.tryParse(value.toString())?.toLocal();
}

String encodeJson(Object? value) => jsonEncode(value);
Map<String, dynamic> decodeMap(String value) =>
    Map<String, dynamic>.from(jsonDecode(value) as Map);
