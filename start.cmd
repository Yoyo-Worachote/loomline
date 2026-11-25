@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  for /d %%D in ("%~dp0..\..\.node\node-*") do set "PATH=%%~fD;%PATH%"
)
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 or newer is required: https://nodejs.org
  pause
  exit /b 1
)
if not exist node_modules call npm ci || goto :failed
call npm run build || goto :failed
start "" http://localhost:8787
node dist\server.mjs
goto :eof
:failed
echo Setup failed. See the messages above.
pause
exit /b 1
