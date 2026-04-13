@echo off
title Nami AI Launcher
color 0D

echo.
echo  ╔══════════════════════════════════════╗
echo  ║          NAMI AI COMPANION           ║
echo  ║      Ctrl+Shift+Space to Toggle      ║
echo  ╚══════════════════════════════════════╝
echo.
echo  Starting Nami...
echo.

cd /d "%~dp0"

:: Start Vite dev server in the background
start /B /MIN cmd /c "npm run dev"

:: Wait for the dev server to be ready
echo  Waiting for server to start...
:wait_loop
timeout /t 1 /nobreak >nul
curl -s http://localhost:3000 >nul 2>&1
if errorlevel 1 goto wait_loop

echo  Server is ready!
echo  Launching Nami desktop app...
echo.

:: Launch Electron
npx electron electron/main.cjs

echo.
echo  Nami has been closed. Shutting down server...

:: Kill the Vite dev server
taskkill /F /IM node.exe /FI "WINDOWTITLE eq npm*" >nul 2>&1

echo  Goodbye!
timeout /t 2 /nobreak >nul
