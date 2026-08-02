import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/app_controller.dart';
import '../models/models.dart';
import '../widgets/avatar.dart';
import '../widgets/status_text.dart';
import 'chat_screen.dart';
import 'profile_screen.dart';
import 'user_picker_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _search = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _openConversation(Conversation conversation) async {
    if (!mounted) return;
    await Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => ChatScreen(conversationId: conversation.id),
      ),
    );
  }

  Future<void> _newChat({required bool group}) async {
    final conversation = await Navigator.push<Conversation>(
      context,
      MaterialPageRoute(builder: (_) => UserPickerScreen(groupMode: group)),
    );
    if (conversation != null && mounted) {
      await _openConversation(conversation);
    }
  }

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<AppController>();
    final me = controller.me;
    final query = _query.trim().toLowerCase();
    final conversations = controller.conversations.where((item) {
      if (query.isEmpty) return true;
      return item.name.toLowerCase().contains(query) ||
          item.members.any((member) => member.username.toLowerCase().contains(query));
    }).toList();

    return Scaffold(
      appBar: AppBar(
        leadingWidth: 58,
        leading: Padding(
          padding: const EdgeInsets.only(left: 12),
          child: InkWell(
            borderRadius: BorderRadius.circular(30),
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const ProfileScreen()),
            ),
            child: GAvatar(
              name: me?.username ?? 'G',
              url: controller.mediaUrl(me?.profilePictureUrl),
              radius: 20,
              online: true,
            ),
          ),
        ),
        title: const Text('GChats', style: TextStyle(fontWeight: FontWeight.w800)),
        actions: [
          IconButton(
            tooltip: 'New private chat',
            onPressed: () => _newChat(group: false),
            icon: const Icon(Icons.edit_square),
          ),
          PopupMenuButton<String>(
            onSelected: (value) async {
              switch (value) {
                case 'group':
                  await _newChat(group: true);
                  break;
                case 'profile':
                  if (mounted) {
                    await Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => const ProfileScreen()),
                    );
                  }
                  break;
                case 'theme':
                  await controller.setDarkMode(controller.themeMode != ThemeMode.dark);
                  break;
                case 'refresh':
                  await controller.syncBootstrap();
                  break;
                case 'logout':
                  await controller.logout();
                  break;
              }
            },
            itemBuilder: (_) => [
              const PopupMenuItem(value: 'group', child: Text('Create group chat')),
              const PopupMenuItem(value: 'profile', child: Text('Profile and note')),
              PopupMenuItem(
                value: 'theme',
                child: Text(controller.themeMode == ThemeMode.dark ? 'Light mode' : 'Dark mode'),
              ),
              const PopupMenuItem(value: 'refresh', child: Text('Refresh conversations')),
              const PopupMenuDivider(),
              const PopupMenuItem(value: 'logout', child: Text('Log out')),
            ],
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: controller.syncBootstrap,
        child: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 10),
                child: TextField(
                  controller: _search,
                  onChanged: (value) => setState(() => _query = value),
                  decoration: InputDecoration(
                    hintText: 'Search username or group name',
                    prefixIcon: const Icon(Icons.search),
                    suffixIcon: _query.isEmpty
                        ? null
                        : IconButton(
                            onPressed: () {
                              _search.clear();
                              setState(() => _query = '');
                            },
                            icon: const Icon(Icons.close),
                          ),
                  ),
                ),
              ),
            ),
            if (controller.transientMessage != null)
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                  child: Material(
                    color: Theme.of(context).colorScheme.surfaceContainerHighest,
                    borderRadius: BorderRadius.circular(12),
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Row(
                        children: [
                          const Icon(Icons.cloud_sync_outlined),
                          const SizedBox(width: 10),
                          Expanded(child: Text(controller.transientMessage!)),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            if (controller.syncing)
              const SliverToBoxAdapter(child: LinearProgressIndicator(minHeight: 2)),
            if (conversations.isEmpty)
              const SliverFillRemaining(
                hasScrollBody: false,
                child: Center(child: Text('No conversations yet. Start a new chat.')),
              )
            else
              SliverList(
                delegate: SliverChildBuilderDelegate(
                  (context, index) {
                  final item = conversations[index];
                  final other = item.type == 'direct'
                      ? item.members.where((member) => member.id != me?.id).firstOrNull
                      : null;
                  final subtitle = item.lastSender.isEmpty
                      ? item.lastMessage
                      : '${item.lastSender}: ${item.lastMessage}';
                  return ListTile(
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 5),
                    leading: GAvatar(
                      name: item.name,
                      url: controller.mediaUrl(item.avatarUrl),
                      radius: 28,
                      online: other?.isOnline == true,
                    ),
                    title: Text(
                      item.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                    subtitle: Text(
                      subtitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    trailing: Text(
                      compactTime(item.lastSentAt),
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    onTap: () => _openConversation(item),
                  );
                  },
                  childCount: conversations.length,
                ),
              ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _newChat(group: false),
        child: const Icon(Icons.chat_bubble_outline),
      ),
    );
  }
}

extension _FirstOrNull<T> on Iterable<T> {
  T? get firstOrNull => isEmpty ? null : first;
}
