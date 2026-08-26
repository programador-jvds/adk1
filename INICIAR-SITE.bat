@echo off
cd /d "%~dp0"
start "" http://localhost:5500/
py -m http.server 5500 2>nul || python -m http.server 5500
pause
