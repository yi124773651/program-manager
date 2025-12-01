@echo off
echo ========================================
echo   Program Manager - Development Mode
echo ========================================
echo.

:: Switch to project root
cd /d "%~dp0.."

:: Check dependencies
if not exist node_modules (
    echo [Info] First run, installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo [X] npm install failed
        pause
        exit /b 1
    )
    echo.
)

echo Starting development server (hot reload enabled)...
echo.
echo Press Ctrl+C to stop
echo.
call npm run tauri dev
