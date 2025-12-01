@echo off
echo ========================================
echo   Program Manager - Build Script
echo ========================================
echo.

:: Switch to project root
cd /d "%~dp0.."

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [X] Error: Node.js not found. Please install Node.js 18+
    echo     Download: https://nodejs.org/
    pause
    exit /b 1
)

:: Check Rust
where cargo >nul 2>&1
if %errorlevel% neq 0 (
    echo [X] Error: Rust not found. Please install Rust
    echo     Download: https://www.rust-lang.org/tools/install
    pause
    exit /b 1
)

echo [OK] Environment check passed
echo.

:: Check node_modules
if not exist node_modules (
    echo [1/3] Installing Node.js dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo [X] npm install failed
        pause
        exit /b 1
    )
    echo [OK] Dependencies installed
    echo.
) else (
    echo [1/3] Node.js dependencies exist, skipping
    echo.
)

echo [2/3] Running TypeScript build...
call npm run build
if %errorlevel% neq 0 (
    echo [X] Frontend build failed
    pause
    exit /b 1
)
echo [OK] Frontend build complete
echo.

echo [3/3] Building Tauri application (Release mode)...
call npm run tauri build
if %errorlevel% neq 0 (
    echo [X] Tauri build failed
    pause
    exit /b 1
)

echo.
echo ========================================
echo   Build Complete!
echo ========================================
echo.
echo Output location:
echo   Executable: src-tauri\target\release\program-manager.exe
echo   Installer:  src-tauri\target\release\bundle\msi\
echo.
pause
