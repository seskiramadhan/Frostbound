@echo off
rem Serves Frostbound over http (ES modules don't load from file://).
cd /d "%~dp0"

echo.
echo  Frostbound running at http://localhost:8000
echo  On your phone (same Wi-Fi), open http://^<this-PC-IP^>:8000 using one of:
ipconfig | findstr /c:"IPv4"
echo  Close this window to stop the server.
echo.

rem Open the browser a moment after the server starts
start "" cmd /c "timeout /t 1 /nobreak >nul & start http://localhost:8000"

where python >nul 2>nul
if %errorlevel%==0 (
  python -m http.server 8000
) else (
  py -m http.server 8000
)
pause
