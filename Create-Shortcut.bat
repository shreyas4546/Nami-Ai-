@echo off
:: Creates a desktop shortcut for Nami AI
set SCRIPT_DIR=%~dp0
set SHORTCUT_NAME=Nami AI
set DESKTOP=%USERPROFILE%\Desktop

echo Creating desktop shortcut for Nami AI...

powershell -Command "$ws = New-Object -ComObject WScript.Shell; $sc = $ws.CreateShortcut('%DESKTOP%\%SHORTCUT_NAME%.lnk'); $sc.TargetPath = '%SCRIPT_DIR%Launch-Nami.bat'; $sc.WorkingDirectory = '%SCRIPT_DIR%'; $sc.Description = 'Launch Nami AI Companion'; $sc.Save()"

echo.
echo Shortcut created on your Desktop!
echo Double-click "Nami AI" on your desktop to launch her.
echo.
pause
