import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/app_controller.dart';
import '../models/models.dart';
import '../widgets/avatar.dart';
import '../widgets/message_bubble.dart';
import '../widgets/status_text.dart';
import 'group_settings_screen.dart';

class ChatScreen extends StatefulWidget {
  const ChatScreen({
    super.key,
    required this.conversationId,
  });

  final int conversationId;

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _composer = TextEditingController();
  final _scroll = ScrollController();
  final _focus = FocusNode();
  ReplyPreview? _replyTo;
  bool _sendingMedia = false;

  static const _emojis = [
    '😀', '😂', '🥰', '😍', '😊', '😎', '😭', '😡',
    '👍', '❤️', '🔥', '🎉', '🙏', '💯', '🤔', '😮',
    '😢', '😴', '🤝', '✨', '🤣', '😅', '😉', '🥳',
  ];

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<AppController>().openConversation(widget.conversationId);
    });
  }

  @override
  void dispose() {
    _composer.dispose();
    _scroll
      ..removeListener(_onScroll)
      ..dispose();
    _focus.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!_scroll.hasClients) return;
    if (_scroll.position.pixels > _scroll.position.maxScrollExtent - 180) {
      context.read<AppController>().loadOlder(widget.conversationId);
    }
  }

  Future<void> _send() async {
    final text = _composer.text;
    if (text.trim().isEmpty) return;
    _composer.clear();
    final reply = _replyTo;
    setState(() => _replyTo = null);
    try {
      await context.read<AppController>().sendText(
            widget.conversationId,
            text,
            replyTo: reply,
          );
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message)));
      }
    }
  }

  Future<void> _pickMedia(ImageSource source, {required bool video}) async {
    Navigator.pop(context);
    final picker = ImagePicker();
    final file = video
        ? await picker.pickVideo(source: source, maxDuration: const Duration(minutes: 5))
        : await picker.pickImage(source: source, imageQuality: 90, maxWidth: 1920);
    if (file == null || !mounted) return;
    setState(() => _sendingMedia = true);
    try {
      await context.read<AppController>().uploadMedia(
            widget.conversationId,
            file,
            replyTo: _replyTo,
          );
      if (mounted) setState(() => _replyTo = null);
    } on ApiException catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.message)));
      }
    } finally {
      if (mounted) setState(() => _sendingMedia = false);
    }
  }

  void _showAttachmentSheet() {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Wrap(
          children: [
            ListTile(
              leading: const Icon(Icons.photo_outlined),
              title: const Text('Send picture'),
              onTap: () => _pickMedia(ImageSource.gallery, video: false),
            ),
            ListTile(
              leading: const Icon(Icons.videocam_outlined),
              title: const Text('Send video'),
              onTap: () => _pickMedia(ImageSource.gallery, video: true),
            ),
            ListTile(
              leading: const Icon(Icons.camera_alt_outlined),
              title: const Text('Take a picture'),
              onTap: () => _pickMedia(ImageSource.camera, video: false),
            ),
          ],
        ),
      ),
    );
  }

  void _showEmojiPicker() {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: GridView.count(
          padding: const EdgeInsets.all(18),
          shrinkWrap: true,
          crossAxisCount: 8,
          children: _emojis
              .map(
                (emoji) => InkWell(
                  borderRadius: BorderRadius.circular(30),
                  onTap: () {
                    final selection = _composer.selection;
                    final text = _composer.text;
                    final start = selection.start < 0 ? text.length : selection.start;
                    final end = selection.end < 0 ? text.length : selection.end;
                    _composer.text = text.replaceRange(start, end, emoji);
                    _composer.selection = TextSelection.collapsed(offset: start + emoji.length);
                    Navigator.pop(context);
                    _focus.requestFocus();
                  },
                  child: Center(child: Text(emoji, style: const TextStyle(fontSize: 26))),
                ),
              )
              .toList(),
        ),
      ),
    );
  }

  void _showProfile(UserProfile user) {
    final controller = context.read<AppController>();
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              GAvatar(
                name: user.username,
                url: controller.mediaUrl(user.profilePictureUrl),
                radius: 48,
                online: user.isOnline,
              ),
              const SizedBox(height: 10),
              Text(
                user.username,
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800),
              ),
              Text(presenceText(user)),
              if (user.note.isNotEmpty) ...[
                const SizedBox(height: 10),
                Chip(label: Text(user.note)),
              ],
              if (user.bio.isNotEmpty) ...[
                const SizedBox(height: 10),
                Text(user.bio, textAlign: TextAlign.center),
              ],
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<AppController>();
    final conversation = controller.conversationById(widget.conversationId);
    final messages = controller.messagesFor(widget.conversationId);
    final me = controller.me;
    if (conversation == null || me == null) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    final other = conversation.type == 'direct'
        ? conversation.members.where((member) => member.id != me.id).firstOrNull
        : null;
    final activeCount = conversation.members.where((member) => member.isOnline).length;
    final subtitle = other != null
        ? presenceText(other)
        : '$activeCount active · ${conversation.memberCount} members';

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        title: InkWell(
          onTap: other == null ? null : () => _showProfile(other),
          child: Row(
            children: [
              GAvatar(
                name: conversation.name,
                url: controller.mediaUrl(conversation.avatarUrl),
                radius: 19,
                online: other?.isOnline == true,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      conversation.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
                    ),
                    Text(
                      subtitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.labelSmall,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        actions: [
          if (conversation.isGroup)
            PopupMenuButton<String>(
              onSelected: (value) async {
                if (value == 'settings') {
                  final left = await Navigator.push<bool>(
                    context,
                    MaterialPageRoute(
                      builder: (_) => GroupSettingsScreen(conversationId: conversation.id),
                    ),
                  );
                  if (left == true && mounted) Navigator.pop(context);
                } else if (value == 'members') {
                  await Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => GroupSettingsScreen(conversationId: conversation.id),
                    ),
                  );
                }
              },
              itemBuilder: (_) => const [
                PopupMenuItem(value: 'members', child: Text('View members')),
                PopupMenuItem(value: 'settings', child: Text('Group settings')),
              ],
            ),
        ],
      ),
      body: Column(
        children: [
          if (_sendingMedia) const LinearProgressIndicator(minHeight: 2),
          Expanded(
            child: messages.isEmpty
                ? const Center(child: Text('Start the conversation.'))
                : ListView.builder(
                    controller: _scroll,
                    reverse: true,
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    itemCount: messages.length + (controller.hasMoreFor(conversation.id) ? 1 : 0),
                    itemBuilder: (context, index) {
                      if (index == messages.length) {
                        return Center(
                          child: TextButton(
                            onPressed: () => controller.loadOlder(conversation.id),
                            child: const Text('Load older messages'),
                          ),
                        );
                      }
                      final message = messages.reversed.elementAt(index);
                      return MessageBubble(
                        message: message,
                        own: message.username.toLowerCase() == me.username.toLowerCase(),
                        absoluteUrl: controller.mediaUrl,
                        onReply: () => setState(
                          () => _replyTo = ReplyPreview(
                            id: message.id,
                            username: message.username,
                            body: message.body,
                            messageType: message.messageType,
                            attachmentName: message.attachmentName,
                          ),
                        ),
                        onReact: (emoji) async {
                          try {
                            await controller.toggleReaction(message.id, emoji);
                          } on ApiException catch (error) {
                            if (mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(content: Text(error.message)),
                              );
                            }
                          }
                        },
                        onRetry: () => controller.retryPending(message),
                      );
                    },
                  ),
          ),
          if (_replyTo != null)
            Container(
              padding: const EdgeInsets.fromLTRB(16, 8, 8, 8),
              color: Theme.of(context).colorScheme.surfaceContainerHighest,
              child: Row(
                children: [
                  const Icon(Icons.reply, size: 18),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Replying to ${_replyTo!.username}: ${_replyTo!.body}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  IconButton(
                    onPressed: () => setState(() => _replyTo = null),
                    icon: const Icon(Icons.close),
                  ),
                ],
              ),
            ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(8, 6, 8, 8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  IconButton.filledTonal(
                    onPressed: _sendingMedia ? null : _showAttachmentSheet,
                    icon: const Icon(Icons.add),
                  ),
                  IconButton(
                    onPressed: _showEmojiPicker,
                    icon: const Icon(Icons.emoji_emotions_outlined),
                  ),
                  Expanded(
                    child: TextField(
                      controller: _composer,
                      focusNode: _focus,
                      minLines: 1,
                      maxLines: 5,
                      textCapitalization: TextCapitalization.sentences,
                      decoration: const InputDecoration(
                        hintText: 'Message',
                        contentPadding: EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      ),
                    ),
                  ),
                  const SizedBox(width: 6),
                  IconButton.filled(
                    onPressed: _send,
                    icon: const Icon(Icons.send),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
