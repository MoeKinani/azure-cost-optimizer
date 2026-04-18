@echo off
echo Starting Azure Cost Optimizer...

:: Check setup has been run
if not exist "%~dp0backend\.venv" (
    echo Setup not complete. Running install.bat first...
    call "%~dp0install.bat"
)

:: Kill anything on port 8000
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000 "') do taskkill /F /PID %%a 2>nul

:: Always rebuild frontend to pick up latest changes
echo Building frontend...
cd /d "%~dp0frontend"
call npm run build

:: Start backend (serves frontend + API on port 8000)
start "Azure Cost Optimizer" cmd /k "cd /d %~dp0backend && .venv\Scripts\python.exe -m uvicorn main:app --port 8000"

:: Wait then open browser
timeout /t 3 /nobreak >nul
start http://localhost:8000

echo Azure Cost Optimizer running at http://localhost:8000
