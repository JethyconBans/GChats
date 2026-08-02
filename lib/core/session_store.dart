import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../models/models.dart';

class SessionStore {
  static const _tokenKey = 'gchats_api_token';
  static const _userKey = 'gchats_user';

  const SessionStore();

  FlutterSecureStorage get _storage => const FlutterSecureStorage(
        aOptions: AndroidOptions(encryptedSharedPreferences: true),
      );

  Future<String?> readToken() => _storage.read(key: _tokenKey);

  Future<UserProfile?> readUser() async {
    final raw = await _storage.read(key: _userKey);
    if (raw == null || raw.isEmpty) return null;
    try {
      return UserProfile.fromJson(Map<String, dynamic>.from(jsonDecode(raw) as Map));
    } catch (_) {
      return null;
    }
  }

  Future<void> save(String token, UserProfile user) async {
    await _storage.write(key: _tokenKey, value: token);
    await saveUser(user);
  }

  Future<void> saveUser(UserProfile user) {
    return _storage.write(key: _userKey, value: jsonEncode(user.toJson()));
  }

  Future<void> clear() => _storage.deleteAll();
}
