@echo off
title Abracadabra Webserver
color 0B

echo =======================================================
echo.
echo     🎩  A B R A C A D A B R A  🎩
echo         Vollautomatischer Systemstart...
echo.
echo =======================================================
echo.

cd /d "%~dp0"

:: 1. Backend starten (Oeffnet ein neues Konsolenfenster)
echo [1/3] Starte Python Backend im Hintergrund...
start "Abracadabra Backend" cmd /k ".\.venv\Scripts\python.exe main.py"

:: 2. Kurz warten, damit das Backend Zeit hat zu starten
echo [2/3] Gebe Systemen Zeit zum Hochfahren...
timeout /t 3 /nobreak >nul

:: 3. Browser oeffnen
echo [3/3] Oeffne Dashboard im Browser...
start http://localhost:8090/hype.html

echo.
echo -------------------------------------------------------
echo ✅ ALLES ERFOLGREICH GESTARTET!
echo.
echo - Das Dashboard ist im Browser offen.
echo - Das Backend laeuft im anderen schwarzen Fenster.
echo - Dieser Webserver laeuft in diesem Fenster auf Port 8090.
echo.
echo Zum Beenden einfach alle schwarzen Fenster schliessen.
echo -------------------------------------------------------
echo.

:: Webserver im aktuellen Fenster starten
python -m http.server 8090
