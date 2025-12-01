@echo off
setlocal enabledelayedexpansion

title Program Manager - Clean Debug Build
echo ========================================
echo   Program Manager - Clean Debug Build
echo ========================================
echo.
echo This script only cleans Debug build, preserving Release build
echo.

:: Switch to project root
cd /d "%~dp0.." || (
    echo Error: Cannot switch to project root.
    goto :error_exit
)

cd src-tauri || (
    echo Error: Cannot enter src-tauri directory.
    goto :error_exit
)

if exist target\debug (
    echo Deleting src-tauri/target/debug/ ...
    rmdir /s /q target\debug
    if exist target\debug (
        echo Error: Failed to delete debug folder. It may be in use.
    ) else (
        echo [OK] Debug build cleaned (saved ~4.2 GB)
    )
) else (
    echo [!] target/debug folder not found, skipping
)

cd ..

echo.
echo ========================================
echo   Clean Complete!
echo ========================================
echo.
echo Release build preserved at src-tauri/target/release/
echo.
pause
exit /b 0

:error_exit
echo.
echo An error occurred during execution.
pause
exit /b 1
