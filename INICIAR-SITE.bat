@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul && (
  echo Atualizando catalogo tecnico de retentores...
  py -m pip install -q requests beautifulsoup4 >nul 2>nul
  py tools\sync-retentores-arca.py >nul 2>nul
)
start "" http://localhost:5500/
py -m http.server 5500
