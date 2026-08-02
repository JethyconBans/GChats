import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/models.dart';
import '../screens/media_viewer_screen.dart';
import 'avatar.dart';

class MessageBubble extends StatelessWidget {
  const MessageBubble({
    super.key,
    required this.message,
    required this.own,
    required this.absoluteUrl,
    required this.onReply,
    required this.onReact,
    required this.onRetry,
  });

  final ChatMessage message;
  final bool own;
  final String Function(String?) absoluteUrl;
  final VoidCallback onReply;
  final void Function(String emoji) onReact;
  final VoidCallback onRetry;

  static const reactions = ['👍', '❤️', '😂', '😮', '😢', '😡', '🎉'];

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final bubbleColor = own ? scheme.primary : scheme.surfaceContainerHighest;
    final textColor = own ? scheme.onPrimary : scheme.onSurface;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        mainAxisAlignment: own ? MainAxisAlignment.end : MainAxisAlignment.start,
        children: [
          if (!own) ...[
            GAvatar(
              name: message.username,
              url: absoluteUrl(message.profilePictureUrl),
              radius: 15,
            ),
            const SizedBox(width: 7),
          ],
          Flexible(
            child: GestureDetector(
              onLongPress: () => _showActions(context),
              child: Column(
                crossAxisAlignment: own ? CrossAxisAlignment.end : CrossAxisAlignment.start,
                children: [
                  if (!own)
                    Padding(
                      padding: const EdgeInsets.only(left: 10, bottom: 3),
                      child: Text(
                        message.username,
                        style: Theme.of(context).textTheme.labelSmall,
                      ),
                    ),
                  Container(
                    constraints: const BoxConstraints(maxWidth: 340),
                    padding: message.isMedia
                        ? const EdgeInsets.all(4)
                        : const EdgeInsets.symmetric(horizontal: 13, vertical: 9),
                    decoration: BoxDecoration(
                      color: bubbleColor,
                      borderRadius: BorderRadius.only(
                        topLeft: const Radius.circular(18),
                        topRight: const Radius.circular(18),
                        bottomLeft: Radius.circular(own ? 18 : 4),
                        bottomRight: Radius.circular(own ? 4 : 18),
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (message.replyTo != null)
                          Container(
                            width: double.infinity,
                            margin: const EdgeInsets.only(bottom: 7),
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(
                              color: textColor.withOpacity(.12),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Text(
                              '${message.replyTo!.username}: ${_replyText(message.replyTo!)}',
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(color: textColor.withOpacity(.85), fontSize: 12),
                            ),
                          ),
                        if (message.messageType == 'image') _image(context),
                        if (message.messageType == 'video') _video(context),
                        if (message.body.isNotEmpty)
                          Padding(
                            padding: message.isMedia
                                ? const EdgeInsets.fromLTRB(9, 7, 9, 8)
                                : EdgeInsets.zero,
                            child: InkWell(
                              onTap: _looksLikeUrl(message.body)
                                  ? () => launchUrl(
                                        Uri.parse(message.body),
                                        mode: LaunchMode.externalApplication,
                                      )
                                  : null,
                              child: Text(
                                message.body,
                                style: TextStyle(
                                  color: textColor,
                                  decoration: _looksLikeUrl(message.body)
                                      ? TextDecoration.underline
                                      : null,
                                ),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                  if (message.reactions.isNotEmpty)
                    Wrap(
                      spacing: 4,
                      children: message.reactions
                          .map(
                            (reaction) => Container(
                              margin: const EdgeInsets.only(top: 3),
                              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                              decoration: BoxDecoration(
                                color: scheme.surfaceContainerHighest,
                                borderRadius: BorderRadius.circular(14),
                              ),
                              child: Text('${reaction.emoji} ${reaction.count}'),
                            ),
                          )
                          .toList(),
                    ),
                  Padding(
                    padding: const EdgeInsets.only(top: 2, left: 4, right: 4),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          DateFormat.jm().format(message.sentAt),
                          style: Theme.of(context).textTheme.labelSmall,
                        ),
                        if (message.pending) ...[
                          const SizedBox(width: 4),
                          const SizedBox.square(
                            dimension: 10,
                            child: CircularProgressIndicator(strokeWidth: 1.5),
                          ),
                        ],
                        if (message.failed) ...[
                          const SizedBox(width: 4),
                          InkWell(
                            onTap: onRetry,
                            child: Text(
                              'Failed · Retry',
                              style: TextStyle(color: scheme.error, fontWeight: FontWeight.w600),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _image(BuildContext context) {
    final url = absoluteUrl(message.attachmentUrl);
    return InkWell(
      onTap: () => _openViewer(context, url, false),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(14),
        child: CachedNetworkImage(
          imageUrl: url,
          width: 260,
          fit: BoxFit.cover,
          placeholder: (_, __) => const SizedBox(
            width: 260,
            height: 170,
            child: Center(child: CircularProgressIndicator()),
          ),
          errorWidget: (_, __, ___) => const SizedBox(
            width: 260,
            height: 170,
            child: Icon(Icons.broken_image),
          ),
        ),
      ),
    );
  }

  Widget _video(BuildContext context) {
    final url = absoluteUrl(message.attachmentUrl);
    return InkWell(
      onTap: () => _openViewer(context, url, true),
      child: Container(
        width: 260,
        height: 160,
        decoration: BoxDecoration(
          color: Colors.black87,
          borderRadius: BorderRadius.circular(14),
        ),
        child: const Center(
          child: Icon(Icons.play_circle_fill, color: Colors.white, size: 60),
        ),
      ),
    );
  }

  void _openViewer(BuildContext context, String url, bool video) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => MediaViewerScreen(
          url: url,
          filename: message.attachmentName ?? (video ? 'gchats-video.mp4' : 'gchats-image.jpg'),
          isVideo: video,
        ),
      ),
    );
  }

  void _showActions(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 18),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Wrap(
                spacing: 8,
                children: reactions
                    .map(
                      (emoji) => ActionChip(
                        label: Text(emoji, style: const TextStyle(fontSize: 22)),
                        onPressed: () {
                          Navigator.pop(context);
                          onReact(emoji);
                        },
                      ),
                    )
                    .toList(),
              ),
              ListTile(
                leading: const Icon(Icons.reply),
                title: const Text('Reply'),
                onTap: () {
                  Navigator.pop(context);
                  onReply();
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _replyText(ReplyPreview reply) {
    if (reply.body.isNotEmpty) return reply.body;
    if (reply.messageType == 'image') return 'Photo';
    if (reply.messageType == 'video') return 'Video';
    return reply.attachmentName ?? 'Message';
  }

  bool _looksLikeUrl(String value) {
    final uri = Uri.tryParse(value.trim());
    return uri != null && (uri.scheme == 'https' || uri.scheme == 'http') && uri.host.isNotEmpty;
  }
}
