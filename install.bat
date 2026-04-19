@echo off
echo ============================================
echo   Azure Cost Optimizer - First Time Setup
echo ============================================
echo.

:: --- Find a compatible Python (3.11 or 3.12) ---
:: Python 3.13+ lacks pre-built wheels for some dependencies (pydantic-core)
:: and would require Visual Studio Build Tools to compile them from source.
:: The Python Launcher (py.exe) lets us pick a specific version.

set PYTHON_CMD=

:: Prefer 3.12, then 3.11, then fall back to whatever 'python' resolves to
py -3.12 --version >nul 2>&1
if not errorlevel 1 (
    set PYTHON_CMD=py -3.12
    goto :python_found
)

py -3.11 --version >nul 2>&1
if not errorlevel 1 (
    set PYTHON_CMD=py -3.11
    goto :python_found
)

:: Check if the default 'python' is an acceptable version (3.11 or 3.12)
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found. Install Python 3.11 or 3.12 from https://python.org
    echo NOTE:  Python 3.13+ is not yet supported due to missing binary wheels.
    pause
    exit /b 1
)

:: Capture major.minor to detect 3.13+
for /f "tokens=2 delims= " %%v in ('python --version 2^>^&1') do set PY_VER=%%v
for /f "tokens=1,2 delims=." %%a in ("%PY_VER%") do (
    set PY_MAJOR=%%a
    set PY_MINOR=%%b
)

if %PY_MAJOR% GEQ 3 if %PY_MINOR% GEQ 13 (
    echo ERROR: Python %PY_VER% detected. Python 3.13+ is not supported.
    echo        Install Python 3.11 or 3.12 from https://python.org
    echo        Then re-run this script.
    pause
    exit /b 1
)

set PYTHON_CMD=python

:python_found
for /f "tokens=2 delims= " %%v in ('%PYTHON_CMD% --version 2^>^&1') do set PY_VER=%%v
echo Using Python %PY_VER%

:: Check Node
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js not found. Install Node.js 18+ from https://nodejs.org
    pause
    exit /b 1
)

echo [1/4] Creating Python virtual environment...
cd /d "%~dp0backend"
%PYTHON_CMD% -m venv .venv
if errorlevel 1 (
    echo ERROR: Failed to create virtual environment.
    pause
    exit /b 1
)

echo [2/4] Installing Python dependencies...
.venv\Scripts\pip install --quiet -r requirements.txt
if errorlevel 1 (
    echo ERROR: pip install failed.
    pause
    exit /b 1
)

echo [3/4] Installing frontend dependencies...
cd /d "%~dp0frontend"
call npm install --silent
if errorlevel 1 (
    echo ERROR: npm install failed.
    pause
    exit /b 1
)

echo [4/4] Building frontend...
call npm run build
if errorlevel 1 (
    echo ERROR: Frontend build failed.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   Setup complete! Run start.bat to launch.
echo ============================================
pause
