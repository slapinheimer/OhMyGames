@echo off
rem Double-click to stop Oh My GAMES! and remove it from this PC.
copy /y "%~dp0install.ps1" "%TEMP%\omw-uninstall.ps1" >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%TEMP%\omw-uninstall.ps1" -Uninstall & pause & exit /b
