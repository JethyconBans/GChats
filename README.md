# GChats Fast Native Android App

This is a real Flutter Android application for the existing GChats Flask system.
It is not a WebView or Trusted Web Activity.

## Why chats open faster

The app stores data in the phone's private app storage:

- `sqflite` keeps conversations, messages, reactions, and unsent text messages.
- `flutter_secure_storage` keeps the login token securely.
- `cached_network_image` stores viewed profile photos and chat images on disk.
- The app renders the local conversation immediately, then checks the server for updates.
- Text messages typed while disconnected remain in a phone-side queue and retry after the live connection returns.

The cache stays after closing or restarting the app. Android removes it only when the user clears app data or uninstalls GChats.

## Important limitation

Phone storage removes the blank waiting screen for chats that were opened before. Sending or receiving brand-new data still needs the cloud server. A sleeping Render Free server can still delay synchronization, but cached chats remain visible while it wakes.

## A. Update the Flask server

The `backend_patch` folder contains the matching Flask mobile API.

Copy these files to your current backend folder:

```text
C:\PY_project\kulot-friends-chat
```

Then run:

```powershell
cd C:\PY_project\kulot-friends-chat
.\venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python mobile_api_smoke_test.py
```

Upload to GitHub:

```powershell
git add .
git commit -m "Add native GChats mobile API"
git push origin main
```

Wait for Render to become **Deploy live**.

## B. Build the APK on Windows

Extract this project to:

```text
C:\PY_project\gchats-fast-native
```

Run:

```powershell
cd C:\PY_project\gchats-fast-native
flutter pub get
flutter analyze
flutter build apk --release --dart-define=API_BASE_URL=https://kulot-friends-chat.onrender.com
```

Or double-click:

```text
BUILD_APK_WINDOWS.bat
```

The APK is created at:

```text
build\app\outputs\flutter-apk\app-release.apk
```

## C. Build the APK in GitHub without using your laptop

1. Create a new GitHub repository, for example `gchats-native`.
2. Upload all files from this folder.
3. Commit to the `main` branch.
4. Open the repository's **Actions** tab.
5. Open **Build GChats Android**.
6. Press **Run workflow**.
7. After it finishes, download the artifact named **GChats-Android-APK**.

The workflow also runs `flutter analyze`; it stops instead of producing a broken APK when the source has an error.

## D. Build for Google Play

Use your own permanent upload keystore. Copy:

```text
android\key.properties.example
```

to:

```text
android\key.properties
```

Fill in the keystore paths and passwords, then run:

```powershell
flutter build appbundle --release --dart-define=API_BASE_URL=https://kulot-friends-chat.onrender.com
```

Or double-click:

```text
BUILD_PLAYSTORE_AAB_WINDOWS.bat
```

The Play Store file is:

```text
build\app\outputs\bundle\release\app-release.aab
```

Never upload `android/key.properties` or your keystore to a public repository.
