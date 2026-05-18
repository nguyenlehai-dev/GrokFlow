@echo off
setlocal EnableDelayedExpansion
title GrokFlow - Installer

echo.
echo ============================================================
echo   GrokFlow Self-Host Installer
echo ============================================================
echo.

REM ─── 1. Check Docker ───────────────────────────────────────────
where docker >nul 2>&1
if errorlevel 1 (
    echo [LOI] Khong tim thay Docker.
    echo Hay cai Docker Desktop tu: https://www.docker.com/products/docker-desktop
    echo Sau khi cai xong, mo Docker Desktop va chay lai installer nay.
    pause
    exit /b 1
)

docker info >nul 2>&1
if errorlevel 1 (
    echo [LOI] Docker dang khong chay. Hay mo Docker Desktop truoc.
    pause
    exit /b 1
)
echo [OK] Docker san sang.

REM ─── 2. Generate .env if missing ─────────────────────────────
if exist .env (
    echo [OK] .env da ton tai - giu nguyen secrets cu.
) else (
    echo [..] Tao file .env voi secrets ngau nhien...
    copy /Y .env.example .env >nul

    REM Generate random secrets using PowerShell (always available on Win 10+)
    for /f "delims=" %%a in ('powershell -NoProfile -Command "-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 24 | ForEach-Object {[char]$_})"') do set PG_PW=%%a
    for /f "delims=" %%a in ('powershell -NoProfile -Command "-join ((48..57)+(97..102) | Get-Random -Count 64 | ForEach-Object {[char]$_})"') do set JWT=%%a
    for /f "delims=" %%a in ('powershell -NoProfile -Command "[Convert]::ToBase64String((1..32 | ForEach-Object {Get-Random -Min 0 -Max 255}))"') do set FERNET=%%a

    powershell -NoProfile -Command "(Get-Content .env) -replace 'POSTGRES_PASSWORD=.*', 'POSTGRES_PASSWORD=%PG_PW%' -replace 'JWT_SECRET=.*', 'JWT_SECRET=%JWT%' -replace 'ENCRYPTION_KEY=.*', 'ENCRYPTION_KEY=%FERNET%' | Set-Content .env"
    echo [OK] Da tao .env voi secrets moi.
)

REM ─── 3. Load bundled images (offline install) ────────────────
if exist images\backend.tar (
    echo [..] Loading Docker images tu file (offline)...
    docker load -i images\postgres.tar
    docker load -i images\redis.tar
    docker load -i images\backend.tar
    docker load -i images\frontend.tar
    echo [OK] Da load images.
) else (
    echo [..] Khong co images offline - se pull tu Docker registry...
)

REM ─── 4. Start stack ───────────────────────────────────────────
echo [..] Khoi dong GrokFlow (lan dau co the mat 1-2 phut)...
docker compose up -d
if errorlevel 1 (
    echo [LOI] Khong khoi dong duoc. Xem log:
    docker compose logs --tail=50
    pause
    exit /b 1
)

REM ─── 5. Wait for init to complete + show admin password ──────
echo [..] Cho database migration + seed admin user...
docker compose wait init >nul 2>&1
echo.
echo === SEED OUTPUT ===
docker compose logs init --tail=20 --no-log-prefix
echo === END ===
echo.

REM ─── 6. Wait for web UI to be ready ──────────────────────────
echo [..] Cho web UI san sang...
set RETRIES=0
:WAIT_LOOP
set /a RETRIES+=1
powershell -NoProfile -Command "try { (Invoke-WebRequest -Uri http://localhost -UseBasicParsing -TimeoutSec 2).StatusCode } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 goto READY
if %RETRIES% gtr 30 (
    echo [CANH BAO] UI chua phan hoi sau 60s. Kiem tra: docker compose logs
    goto DONE
)
timeout /t 2 /nobreak >nul
goto WAIT_LOOP

:READY
echo [OK] GrokFlow san sang!

:DONE
echo.
echo ============================================================
echo   CAI DAT HOAN TAT
echo   URL:   http://localhost
echo   Email + password admin xem o phan SEED OUTPUT phia tren.
echo ============================================================
echo.
echo Lenh huu ich:
echo   start.bat     - khoi dong lai
echo   stop.bat      - dung
echo   uninstall.bat - go cai dat (xoa hoan toan)
echo.
pause
