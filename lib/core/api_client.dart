import 'dart:io';

import 'package:dio/dio.dart';

import '../models/models.dart';
import 'session_store.dart';

class ApiException implements Exception {
  const ApiException(this.message, [this.statusCode]);

  final String message;
  final int? statusCode;

  @override
  String toString() => message;
}

class ApiClient {
  ApiClient(this._session)
      : dio = Dio(
          BaseOptions(
            baseUrl: const String.fromEnvironment(
              'API_BASE_URL',
              defaultValue: 'https://kulot-friends-chat.onrender.com',
            ),
            connectTimeout: const Duration(seconds: 35),
            receiveTimeout: const Duration(seconds: 35),
            headers: const {'Accept': 'application/json'},
          ),
        ) {
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await _session.readToken();
          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          handler.next(options);
        },
        onError: (error, handler) {
          handler.reject(error);
        },
      ),
    );
  }

  final SessionStore _session;
  final Dio dio;

  String get baseUrl => dio.options.baseUrl.replaceFirst(RegExp(r'/+$'), '');

  String absoluteUrl(String? url) {
    if (url == null || url.isEmpty) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return '$baseUrl${url.startsWith('/') ? '' : '/'}$url';
  }

  Future<Map<String, dynamic>> login(String username, String password) async {
    return _postJson('/api/mobile/auth/login', {
      'username': username,
      'password': password,
      'device_name': Platform.operatingSystem,
    });
  }

  Future<Map<String, dynamic>> register(
    String username,
    String password,
    String inviteCode,
  ) async {
    return _postJson('/api/mobile/auth/register', {
      'username': username,
      'password': password,
      'invite_code': inviteCode,
      'device_name': Platform.operatingSystem,
    });
  }

  Future<Map<String, dynamic>> bootstrap() => _getJson('/api/mobile/bootstrap');

  Future<void> logout() async {
    try {
      await dio.post('/api/mobile/auth/logout');
    } catch (_) {
      // Local logout must still work when the server is sleeping or offline.
    }
  }

  Future<List<Conversation>> conversations() async {
    final data = await _getJson('/api/mobile/conversations');
    return _conversationList(data['conversations']);
  }

  Future<Map<String, dynamic>> messages(
    int conversationId, {
    int? beforeId,
    int limit = 50,
  }) async {
    final data = await _getJson(
      '/api/mobile/conversations/$conversationId/messages',
      query: {
        if (beforeId != null) 'before_id': beforeId,
        'limit': limit,
      },
    );
    return data;
  }

  Future<ChatMessage> sendMessage(
    int conversationId,
    String body, {
    int? replyToId,
  }) async {
    final data = await _postJson(
      '/api/mobile/conversations/$conversationId/messages',
      {
        'body': body,
        if (replyToId != null) 'reply_to_id': replyToId,
      },
    );
    return ChatMessage.fromJson(Map<String, dynamic>.from(data['message'] as Map));
  }

  Future<ChatMessage> uploadMessage(
    int conversationId,
    String filePath, {
    String caption = '',
    int? replyToId,
  }) async {
    final name = filePath.split(Platform.pathSeparator).last;
    final form = FormData.fromMap({
      'file': await MultipartFile.fromFile(filePath, filename: name),
      'caption': caption,
      if (replyToId != null) 'reply_to_id': replyToId.toString(),
    });
    try {
      final response = await dio.post(
        '/api/mobile/conversations/$conversationId/upload',
        data: form,
        options: Options(contentType: 'multipart/form-data'),
      );
      final data = Map<String, dynamic>.from(response.data as Map);
      return ChatMessage.fromJson(Map<String, dynamic>.from(data['message'] as Map));
    } on DioException catch (error) {
      throw _apiError(error);
    }
  }

  Future<void> toggleReaction(int messageId, String emoji) async {
    await _postJson('/api/mobile/messages/$messageId/reaction', {'emoji': emoji});
  }

  Future<List<UserProfile>> searchUsers(String query) async {
    final data = await _getJson('/api/mobile/users', query: {'q': query});
    final raw = data['users'];
    if (raw is! List) return const [];
    return raw
        .whereType<Map>()
        .map((item) => UserProfile.fromJson(Map<String, dynamic>.from(item)))
        .toList();
  }

  Future<Conversation> createPrivate(int userId) async {
    final data = await _postJson('/api/mobile/conversations/private', {'user_id': userId});
    return Conversation.fromJson(Map<String, dynamic>.from(data['conversation'] as Map));
  }

  Future<Conversation> createGroup(String name, List<int> memberIds) async {
    final data = await _postJson('/api/mobile/conversations/group', {
      'name': name,
      'member_ids': memberIds,
    });
    return Conversation.fromJson(Map<String, dynamic>.from(data['conversation'] as Map));
  }

  Future<UserProfile> updateProfile({String? bio, String? note}) async {
    try {
      final response = await dio.patch('/api/mobile/profile', data: {
        if (bio != null) 'bio': bio,
        if (note != null) 'note': note,
      });
      final data = Map<String, dynamic>.from(response.data as Map);
      return UserProfile.fromJson(Map<String, dynamic>.from(data['profile'] as Map));
    } on DioException catch (error) {
      throw _apiError(error);
    }
  }

  Future<UserProfile> updateProfilePicture(String filePath) async {
    final name = filePath.split(Platform.pathSeparator).last;
    final form = FormData.fromMap({
      'file': await MultipartFile.fromFile(filePath, filename: name),
    });
    try {
      final response = await dio.post(
        '/api/mobile/profile/picture',
        data: form,
        options: Options(contentType: 'multipart/form-data'),
      );
      final data = Map<String, dynamic>.from(response.data as Map);
      return UserProfile.fromJson(Map<String, dynamic>.from(data['profile'] as Map));
    } on DioException catch (error) {
      throw _apiError(error);
    }
  }

  Future<UserProfile> removeProfilePicture() async {
    try {
      final response = await dio.delete('/api/mobile/profile/picture');
      final data = Map<String, dynamic>.from(response.data as Map);
      return UserProfile.fromJson(Map<String, dynamic>.from(data['profile'] as Map));
    } on DioException catch (error) {
      throw _apiError(error);
    }
  }

  Future<Conversation> updateGroup(
    int conversationId,
    String name, {
    String? filePath,
    bool removePicture = false,
  }) async {
    final formMap = <String, dynamic>{
      'name': name,
      'remove_picture': removePicture.toString(),
    };
    if (filePath != null) {
      final filename = filePath.split(Platform.pathSeparator).last;
      formMap['file'] = await MultipartFile.fromFile(filePath, filename: filename);
    }
    try {
      final response = await dio.post(
        '/api/mobile/conversations/$conversationId/profile',
        data: FormData.fromMap(formMap),
        options: Options(contentType: 'multipart/form-data'),
      );
      final data = Map<String, dynamic>.from(response.data as Map);
      return Conversation.fromJson(Map<String, dynamic>.from(data['conversation'] as Map));
    } on DioException catch (error) {
      throw _apiError(error);
    }
  }

  Future<void> leaveGroup(int conversationId) async {
    await _postJson('/api/mobile/conversations/$conversationId/leave', const {});
  }

  Future<void> deleteAccount(String password) async {
    await _postJson('/api/mobile/account/delete', {'password': password});
  }

  Future<Map<String, dynamic>> _getJson(
    String path, {
    Map<String, dynamic>? query,
  }) async {
    try {
      final response = await dio.get(path, queryParameters: query);
      return Map<String, dynamic>.from(response.data as Map);
    } on DioException catch (error) {
      throw _apiError(error);
    }
  }

  Future<Map<String, dynamic>> _postJson(
    String path,
    Map<String, dynamic> data,
  ) async {
    try {
      final response = await dio.post(path, data: data);
      return Map<String, dynamic>.from(response.data as Map);
    } on DioException catch (error) {
      throw _apiError(error);
    }
  }

  ApiException _apiError(DioException error) {
    final responseData = error.response?.data;
    if (responseData is Map && responseData['error'] != null) {
      return ApiException(responseData['error'].toString(), error.response?.statusCode);
    }
    if (error.type == DioExceptionType.connectionTimeout ||
        error.type == DioExceptionType.receiveTimeout) {
      return const ApiException('The server is waking up. Please try again in a moment.');
    }
    if (error.type == DioExceptionType.connectionError) {
      return const ApiException('No connection. Cached chats are still available.');
    }
    return ApiException(error.message ?? 'Something went wrong.', error.response?.statusCode);
  }

  List<Conversation> _conversationList(dynamic raw) {
    if (raw is! List) return const [];
    return raw
        .whereType<Map>()
        .map((item) => Conversation.fromJson(Map<String, dynamic>.from(item)))
        .toList();
  }
}
