@echo off
echo ============================================
echo   Azure Cost Optimizer
echo ============================================
echo.

:: ── 1. Run install if venv is missing ────────────────────────────────────────
if not exist "%~dp0backend\.venv" (
    echo First run detected — running install.bat...
    call "%~dp0install.bat"
    if errorlevel 1 exit /b 1
)

:: ── 2. Free port 8000 ─────────────────────────────────────────────────────────
echo Freeing port 8000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000 " 2^>nul') do (
    taskkill /F /PID %%a >nul 2>&1
)

:: ── 3. Build frontend ─────────────────────────────────────────────────────────
echo Building frontend (this picks up all latest code changes)...
cd /d "%~dp0frontend"
call npm run build
if errorlevel 1 (
    echo.
    echo ERROR: Frontend build failed — see errors above.
    echo        Fix the issue then run start.bat again.
    pause
    exit /b 1
)

:: ── 4. Start backend ──────────────────────────────────────────────────────────
echo Starting backend on http://localhost:8000 ...
start "Azure Cost Optimizer" cmd /k "cd /d %~dp0backend && .venv\Scripts\python.exe -m uvicorn main:app --port 8000 --reload"

:: ── 5. Open browser ───────────────────────────────────────────────────────────
timeout /t 3 /nobreak >nul
start http://localhost:8000

echo.
echo Azure Cost Optimizer is running at http://localhost:8000
echo Close the "Azure Cost Optimizer" terminal window to stop it.
