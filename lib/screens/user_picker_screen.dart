import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api_client.dart';
import '../core/app_controller.dart';
import '../models/models.dart';
import '../widgets/avatar.dart';
import '../widgets/status_text.dart';

class UserPickerScreen extends StatefulWidget {
  const UserPickerScreen({
    super.key,
    required this.groupMode,
  });

  final bool groupMode;

  @override
  State<UserPickerScreen> createState() => _UserPickerScreenState();
}

class _UserPickerScreenState extends State<UserPickerScreen> {
  final _search = TextEditingController();
  final _groupName = TextEditingController();
  List<UserProfile> _users = const [];
  final Set<int> _selected = {};
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _runSearch());
  }

  @override
  void dispose() {
    _search.dispose();
    _groupName.dispose();
    super.dispose();
  }

  Future<void> _runSearch() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final users = await context.read<AppController>().searchUsers(_search.text);
      if (mounted) setState(() => _users = users);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _createPrivate(UserProfile user) async {
    setState(() => _loading = true);
    try {
      final conversation = await context.read<AppController>().createPrivate(user.id);
      if (mounted) Navigator.pop(context, conversation);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _createGroup() async {
    if (_groupName.text.trim().isEmpty) {
      setState(() => _error = 'Enter a group name.');
      return;
    }
    if (_selected.isEmpty) {
      setState(() => _error = 'Choose at least one friend.');
      return;
    }
    setState(() => _loading = true);
    try {
      final conversation = await context
          .read<AppController>()
          .createGroup(_groupName.text.trim(), _selected.toList());
      if (mounted) Navigator.pop(context, conversation);
    } on ApiException catch (error) {
      if (mounted) setState(() => _error = error.message);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<AppController>();
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.groupMode ? 'Create group chat' : 'New private chat'),
        actions: [
          if (widget.groupMode)
            TextButton(
              onPressed: _loading ? null : _createGroup,
              child: const Text('Create'),
            ),
        ],
      ),
      body: Column(
        children: [
          if (widget.groupMode)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: TextField(
                controller: _groupName,
                maxLength: 60,
                decoration: const InputDecoration(
                  labelText: 'Group name',
                  prefixIcon: Icon(Icons.groups_2_outlined),
                ),
              ),
            ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: TextField(
              controller: _search,
              textInputAction: TextInputAction.search,
              onSubmitted: (_) => _runSearch(),
              onChanged: (_) {
                Future<void>.delayed(const Duration(milliseconds: 350), () {
                  if (mounted) _runSearch();
                });
              },
              decoration: InputDecoration(
                hintText: 'Search username only',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: IconButton(
                  onPressed: _runSearch,
                  icon: const Icon(Icons.arrow_forward),
                ),
              ),
            ),
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ),
          if (widget.groupMode)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text('${_selected.length} friend${_selected.length == 1 ? '' : 's'} selected'),
              ),
            ),
          if (_loading && _users.isEmpty) const LinearProgressIndicator(),
          Expanded(
            child: ListView.builder(
              itemCount: _users.length,
              itemBuilder: (context, index) {
                final user = _users[index];
                final selected = _selected.contains(user.id);
                return ListTile(
                  leading: GAvatar(
                    name: user.username,
                    url: controller.mediaUrl(user.profilePictureUrl),
                    online: user.isOnline,
                  ),
                  title: Text(user.username),
                  subtitle: Text(presenceText(user)),
                  trailing: widget.groupMode
                      ? Checkbox(
                          value: selected,
                          onChanged: (_) => setState(() {
                            selected ? _selected.remove(user.id) : _selected.add(user.id);
                          }),
                        )
                      : const Icon(Icons.chevron_right),
                  onTap: widget.groupMode
                      ? () => setState(() {
                            selected ? _selected.remove(user.id) : _selected.add(user.id);
                          })
                      : () => _createPrivate(user),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
