@echo off
title GrokFlow - Start
echo Khoi dong GrokFlow...
docker compose up -d
if errorlevel 1 (
    echo [LOI] Khong khoi dong duoc.
    pause
    exit /b 1
)
echo.
echo GrokFlow dang chay tai http://localhost
echo.
pause
