import 'package:intl/intl.dart';

import '../models/models.dart';

String presenceText(UserProfile? user) {
  if (user == null) return '';
  if (user.isOnline) return 'Active now';
  final last = user.lastSeenAt;
  if (last == null) return 'Offline';
  final difference = DateTime.now().difference(last);
  if (difference.inMinutes < 1) return 'Offline · just now';
  if (difference.inMinutes < 60) return 'Offline · ${difference.inMinutes}m ago';
  if (difference.inHours < 24) return 'Offline · ${difference.inHours}h ago';
  if (difference.inDays == 1) return 'Offline · yesterday ${DateFormat.jm().format(last)}';
  return 'Offline · ${DateFormat('MMM d, h:mm a').format(last)}';
}

String compactTime(DateTime? time) {
  if (time == null) return '';
  final now = DateTime.now();
  if (now.year == time.year && now.month == time.month && now.day == time.day) {
    return DateFormat.jm().format(time);
  }
  return DateFormat('MMM d').format(time);
}
