@echo off
title Abrakadabra Hype-Barometer Backend
color 0A

echo =======================================================
echo.
echo     🎩  A B R A K A D A B R A  🎩
echo         Starte Hype-Barometer Backend...
echo.
echo =======================================================
echo.

:: Wechsel in das Verzeichnis, in dem dieses Skript liegt
cd /d "%~dp0"

:: Pruefen ob die virtuelle Umgebung existiert
if not exist ".venv\Scripts\python.exe" (
    echo [FEHLER] Virtuelle Umgebung ^(.venv^) nicht gefunden!
    echo Bitte fuehre erst das Setup aus ^(python -m venv .venv ^&^& pip install -r requirements.txt^).
    pause
    exit /b 1
)

:: Bot starten
.\.venv\Scripts\python.exe main.py

:: Falls der Bot abstuerzt oder beendet wird, Fenster offen halten um Fehler zu lesen
pause
