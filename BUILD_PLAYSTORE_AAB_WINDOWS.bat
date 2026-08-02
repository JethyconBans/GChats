@echo off
setlocal
cd /d "%~dp0"

if not exist "android\key.properties" (
  echo Missing android\key.properties.
  echo Configure your Play Store upload keystore first.
  pause
  exit /b 1
)

flutter pub get || goto :fail
flutter analyze || goto :fail
flutter build appbundle --release --dart-define=API_BASE_URL=https://kulot-friends-chat.onrender.com || goto :fail

echo.
echo AAB created at:
echo %CD%\build\app\outputs\bundle\release\app-release.aab
pause
exit /b 0

:fail
echo Build failed. Read the error above.
pause
exit /b 1
