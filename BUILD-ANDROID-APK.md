# Build the Kulot Friends Android APK (Trusted Web Activity)

Website: https://kulot-friends-chat.onrender.com
Package: com.kulot.friends

## A. Deploy the Android-ready website files

Copy the patch files into your existing project, then run:

```powershell
git add .
git commit -m "Prepare website for Android app"
git push origin main
```

Wait for Render to show **Deploy live**. Check these URLs in a browser:

- https://kulot-friends-chat.onrender.com/static/manifest.webmanifest
- https://kulot-friends-chat.onrender.com/.well-known/assetlinks.json

Before the fingerprint is configured, the second URL correctly shows `[]`.

## B. Install Bubblewrap on Windows

Install Node.js LTS first, then open a new PowerShell window:

```powershell
node --version
npm --version
npm install -g @bubblewrap/cli
bubblewrap --version
```

## C. Generate the Android project

```powershell
mkdir C:\PY_project\kulot-friends-android
cd C:\PY_project\kulot-friends-android
bubblewrap init --manifest=https://kulot-friends-chat.onrender.com/static/manifest.webmanifest
```

Accept the automatic JDK/Android SDK setup when Bubblewrap offers it.
Use these answers when prompted:

- Application name: `Kulot Friends`
- Short name: `Kulot Friends`
- Package ID: `com.kulot.friends`
- Start URL: `/chat`
- Display mode: `standalone`
- Theme/background color: `#0b141a`
- Signing key path: keep the suggested path

Use a strong keystore password and save it safely. Never upload the keystore or its password to GitHub.

## D. Build the signed APK

```powershell
bubblewrap build
```

The output is normally:

```text
app-release-signed.apk
```

## E. Get the signing SHA-256 fingerprint

Run this from the Android project folder, replacing the keystore filename if needed:

```powershell
keytool -list -v -keystore android.keystore
```

Copy only the value beside `SHA256:`. It looks like:

```text
AA:BB:CC:DD:...
```

## F. Connect the app to the website

In Render, open **kulot-friends-chat → Environment** and add/update:

```text
ANDROID_PACKAGE_NAME=com.kulot.friends
ANDROID_SHA256_FINGERPRINT=AA:BB:CC:DD:...
```

Save and redeploy. Then open:

```text
https://kulot-friends-chat.onrender.com/.well-known/assetlinks.json
```

It should now show your package name and fingerprint instead of `[]`.

## G. Install and test the APK

Enable installation from unknown sources on your Android phone, transfer `app-release-signed.apk`, and install it. Or connect the phone with USB debugging and run:

```powershell
bubblewrap install
```

Test login, text, image/video upload, microphone, camera, voice call, and video call.

## Important backups

Back up these files permanently:

- Android signing keystore (usually `android.keystore`)
- Keystore password
- Key alias and key password

Losing the signing key can prevent you from publishing updates signed with the same identity.
