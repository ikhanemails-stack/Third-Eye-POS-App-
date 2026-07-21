@echo off
title Third Eye Computer Solutions - POS System
color 0A
cls
echo ========================================================
echo   THIRD EYE COMPUTER SOLUTIONS
echo   POS System - Starting...
echo ========================================================
echo.

cd /d "%~dp0"

REM Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Node.js is NOT installed.
    echo.
    echo  1. Go to https://nodejs.org in your browser
    echo  2. Click the LTS button to download
    echo  3. Install it - click Next on every screen
    echo  4. RESTART your computer
    echo  5. Then double-click START.bat again
    echo.
    pause
    exit /b 1
)
echo [OK] Node.js found.
echo.

REM Check if node_modules exists - if not, install
if not exist "node_modules\express" (
    echo Installing packages - please wait 1-2 minutes...
    call npm install
    if %errorlevel% neq 0 (
        color 0C
        echo.
        echo [ERROR] Could not install packages.
        echo Make sure your internet connection is working.
        echo.
        pause
        exit /b 1
    )
    echo [OK] Packages installed.
    echo.
) else (
    echo [OK] Packages already installed.
    echo.
)

REM Create data folder
if not exist "data" mkdir data

REM Open browser after 3 seconds
start "" /b cmd /c "timeout /t 3 >nul && start http://localhost:4173"

echo ========================================================
echo   POS System is RUNNING
echo.
echo   Open Chrome and go to:
echo   http://localhost:4173
echo.
echo   IMPORTANT: Do NOT close this window!
echo   Close this window only when done using POS.
echo ========================================================
echo.

node server\index.js

echo.
color 0C
echo ========================================================
echo  The server stopped. See the error above.
echo  Take a screenshot and contact Third Eye CS support.
echo ========================================================
pause
