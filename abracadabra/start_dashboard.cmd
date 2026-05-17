@echo off
title Hype-Barometer Dashboard Server
color 0B

echo =======================================================
echo.
echo     🎩  A B R A K A D A B R A  🎩
echo         Starte Dashboard Server...
echo.
echo =======================================================
echo.

cd /d "%~dp0"

echo Oeffne Browser...
start http://localhost:8090/hype.html

echo.
echo Server laeuft auf Port 8090.
echo Bitte dieses Fenster offen lassen, solange das Dashboard genutzt wird.
python -m http.server 8090

pause
