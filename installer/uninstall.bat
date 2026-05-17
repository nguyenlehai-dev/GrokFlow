@echo off
title GrokFlow - Uninstall
echo.
echo ============================================================
echo   CANH BAO: thao tac nay se xoa TOAN BO du lieu GrokFlow
echo   (user, prompt, chat history, jobs, browser profiles).
echo   Khong the khoi phuc.
echo ============================================================
echo.
set /p CONFIRM=Go phim 'YES' (chu hoa) de xac nhan:
if /I not "%CONFIRM%"=="YES" (
    echo Da huy.
    pause
    exit /b 0
)

echo [..] Dung va xoa containers + volumes...
docker compose down -v
echo [..] Xoa Docker images...
docker image rm grokflow/backend:latest grokflow/frontend:latest 2>nul
echo.
echo Da go cai dat. File .env van con tren disk - xoa thu cong neu muon.
pause
