@echo off
echo ========================================
echo   Program Manager - Clean Script
echo ========================================
echo.

:: Switch to project root
cd /d "%~dp0.."

echo [1/3] Cleaning Rust build cache...
cd src-tauri
if exist target (
    echo Deleting src-tauri/target/ ...
    rmdir /s /q target
    echo [OK] Rust build cache cleaned
) else (
    echo [!] target folder not found, skipping
)
cd ..

echo.
echo [2/3] Cleaning Node.js dependencies...
if exist node_modules (
    echo Deleting node_modules/ ...
    rmdir /s /q node_modules
    echo [OK] Node.js dependencies cleaned
) else (
    echo [!] node_modules folder not found, skipping
)

echo.
echo [3/3] Cleaning frontend build output...
if exist dist (
    echo Deleting dist/ ...
    rmdir /s /q dist
    echo [OK] Frontend build output cleaned
) else (
    echo [!] dist folder not found, skipping
)

echo.
echo ========================================
echo   Clean Complete!
echo ========================================
echo.
echo To restart development, run:
echo   npm install
echo   npm run tauri dev
echo.
pause
