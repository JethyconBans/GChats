@echo off
setlocal
cd /d "%~dp0"

where flutter >nul 2>nul
if errorlevel 1 (
  echo Flutter was not found in PATH.
  echo Install Flutter, reopen this terminal, then run this file again.
  pause
  exit /b 1
)

echo [1/4] Checking Flutter...
flutter --version || goto :fail

echo [2/4] Installing packages...
flutter pub get || goto :fail

echo [3/4] Checking source...
flutter analyze || goto :fail

echo [4/4] Building APK...
flutter build apk --release --dart-define=API_BASE_URL=https://kulot-friends-chat.onrender.com || goto :fail

echo.
echo APK created at:
echo %CD%\build\app\outputs\flutter-apk\app-release.apk
pause
exit /b 0

:fail
echo.
echo Build failed. Read the error above.
pause
exit /b 1
