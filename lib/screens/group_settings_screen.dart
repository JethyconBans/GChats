import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/app_controller.dart';
import '../models/models.dart';
import '../widgets/avatar.dart';
import '../widgets/status_text.dart';

class GroupSettingsScreen extends StatefulWidget {
  const GroupSettingsScreen({
    super.key,
    required this.conversationId,
  });

  final int conversationId;

  @override
  State<GroupSettingsScreen> createState() => _GroupSettingsScreenState();
}

class _GroupSettingsScreenState extends State<GroupSettingsScreen> {
  final _name = TextEditingController();
  XFile? _picture;
  bool _removePicture = false;
  bool _saving = false;
  String? _error;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final conversation = context.read<AppController>().conversationById(widget.conversationId);
    if (_name.text.isEmpty) _name.text = conversation?.name ?? '';
  }

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await context.read<AppController>().updateGroup(
            widget.conversationId,
            _name.text.trim(),
            picture: _picture,
            removePicture: _removePicture,
          );
      if (mounted) Navigator.pop(context);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _leave(Conversation conversation) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Leave group?'),
        content: Text('You will leave ${conversation.name}. Other members stay in the group.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton.tonal(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Leave'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    try {
      await context.read<AppController>().leaveGroup(conversation.id);
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<AppController>();
    final conversation = controller.conversationById(widget.conversationId);
    if (conversation == null) {
      return const Scaffold(body: Center(child: Text('Group not found.')));
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Group settings'),
        actions: [
          TextButton(onPressed: _saving ? null : _save, child: const Text('Save')),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(18),
        children: [
          Center(
            child: Stack(
              children: [
                GAvatar(
                  name: conversation.name,
                  url: _removePicture ? '' : controller.mediaUrl(conversation.avatarUrl),
                  radius: 52,
                ),
                Positioned(
                  right: 0,
                  bottom: 0,
                  child: IconButton.filled(
                    onPressed: () async {
                      final image = await ImagePicker().pickImage(
                        source: ImageSource.gallery,
                        imageQuality: 88,
                      );
                      if (image != null) {
                        setState(() {
                          _picture = image;
                          _removePicture = false;
                        });
                      }
                    },
                    icon: const Icon(Icons.camera_alt),
                  ),
                ),
              ],
            ),
          ),
          TextButton(
            onPressed: () => setState(() {
              _picture = null;
              _removePicture = true;
            }),
            child: const Text('Remove group picture'),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _name,
            maxLength: 60,
            decoration: const InputDecoration(
              labelText: 'Group name',
              prefixIcon: Icon(Icons.groups_2_outlined),
            ),
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ),
          Text(
            'Members (${conversation.memberCount})',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
          ...conversation.members.map(
            (member) => ListTile(
              contentPadding: EdgeInsets.zero,
              leading: GAvatar(
                name: member.username,
                url: controller.mediaUrl(member.profilePictureUrl),
                online: member.isOnline,
              ),
              title: Text(member.username),
              subtitle: Text(presenceText(member)),
            ),
          ),
          const SizedBox(height: 20),
          if (!conversation.isDefault)
            ListTile(
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              tileColor: Theme.of(context).colorScheme.errorContainer,
              textColor: Theme.of(context).colorScheme.onErrorContainer,
              iconColor: Theme.of(context).colorScheme.onErrorContainer,
              leading: const Icon(Icons.logout),
              title: const Text('Leave group'),
              onTap: () => _leave(conversation),
            ),
        ],
      ),
    );
  }
}
