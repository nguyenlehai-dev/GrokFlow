# Deploy GrokFlow lên VPS qua SSH (chạy từ máy local Windows).
#
# Sử dụng:
#   .\deploy\deploy-to-vps.ps1 -SshUser vpsroot -SshHost 192.168.1.15 -DeployMode intranet
#   .\deploy\deploy-to-vps.ps1 -SshUser vpsroot -SshHost 192.168.1.15 -DeployMode cloudflare -TunnelToken "eyJh..."
#
# Yêu cầu trên máy local:
#   - PowerShell 7+
#   - OpenSSH client (Windows 10/11 đã có sẵn)
#   - tar (Git Bash đã có sẵn, hoặc Windows 10 1803+)

param(
    [Parameter(Mandatory=$true)][string]$SshUser,
    [Parameter(Mandatory=$true)][string]$SshHost,
    [string]$RemoteDir = "~/grokflow",
    [ValidateSet("intranet", "cloudflare")][string]$DeployMode = "intranet",
    [string]$TunnelToken = "",
    [string]$Domain = "",
    [string]$ApiDomain = "",
    [string]$AdminEmail = "admin@local",
    [string]$AdminPassword = "",
    # Set when intentionally rotating secrets. Default = false → re-deploy
    # reuses the existing .env.prod on the server so JWT_SECRET stays the
    # same and users don't get logged out. Postgres password and Fernet key
    # are likewise preserved (rotating them mid-life would lock users out
    # of the DB and break encrypted-at-rest data).
    [switch]$RegenSecrets
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot

Write-Host "==> Pre-flight check" -ForegroundColor Cyan
if ($DeployMode -eq "cloudflare" -and -not $TunnelToken) {
    throw "DeployMode=cloudflare cần -TunnelToken (lấy từ Cloudflare Zero Trust → Tunnels → Create)"
}
if ($DeployMode -eq "cloudflare" -and (-not $Domain -or -not $ApiDomain)) {
    throw "DeployMode=cloudflare cần -Domain và -ApiDomain (vd app.example.com / api.example.com)"
}

# Sinh password admin nếu user không truyền
if (-not $AdminPassword) {
    $AdminPassword = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 16 | ForEach-Object {[char]$_})
    Write-Host "Auto-generated admin password: $AdminPassword" -ForegroundColor Yellow
}

# Sinh secrets
function New-Hex32 { -join (1..32 | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) }) }

$pgPassword = New-Hex32
$jwtSecret = New-Hex32
# Fernet key cần chuẩn 32 byte URL-safe base64 — để cho user sinh trên server bằng python.
$encKey = "GENERATE_ON_SERVER"

Write-Host "==> Creating archive (excludes node_modules, __pycache__, .venv, .git, storage)" -ForegroundColor Cyan
$tar = "$env:TEMP\grokflow_deploy.tgz"
Push-Location $RepoRoot
try {
    tar `
        --exclude='./node_modules' `
        --exclude='./frontend/node_modules' `
        --exclude='./backend/__pycache__' `
        --exclude='./backend/.venv' `
        --exclude='./backend/storage' `
        --exclude='./backend/browser_profiles' `
        --exclude='./.git' `
        --exclude='./.claude' `
        --exclude='./.env' `
        --exclude='./backend/.env' `
        --exclude='./frontend/.env' `
        --exclude='./.env.prod' `
        -czf $tar .
    if (-not $?) { throw "tar failed" }
} finally {
    Pop-Location
}

Write-Host "==> Uploading to ${SshUser}@${SshHost}:${RemoteDir}" -ForegroundColor Cyan
# Wipe code dir but preserve persistent state: .env.prod (so secrets keep
# their value — no mass logout on redeploy) and browser_profiles/ (Chrome
# profile state for VNC sessions; bind-mounted into the backend container).
$preserveScript = @"
set -e
mkdir -p $RemoteDir
cd $RemoteDir
mkdir -p /tmp/grokflow-keep
[ -f .env.prod ] && cp .env.prod /tmp/grokflow-keep/.env.prod
[ -d browser_profiles ] && mv browser_profiles /tmp/grokflow-keep/browser_profiles
rm -rf ./* ./.??* 2>/dev/null || true
"@
ssh -o StrictHostKeyChecking=accept-new "${SshUser}@${SshHost}" "$preserveScript"
scp $tar "${SshUser}@${SshHost}:$RemoteDir/deploy.tgz"
$restoreScript = @"
set -e
cd $RemoteDir
tar -xzf deploy.tgz
rm deploy.tgz
[ -f /tmp/grokflow-keep/.env.prod ] && mv /tmp/grokflow-keep/.env.prod ./.env.prod
[ -d /tmp/grokflow-keep/browser_profiles ] && mv /tmp/grokflow-keep/browser_profiles ./browser_profiles
rmdir /tmp/grokflow-keep 2>/dev/null || true
"@
ssh "${SshUser}@${SshHost}" "$restoreScript"
Remove-Item $tar -Force

# Whether to overwrite an existing .env.prod on the server. Default = keep
# existing (preserves JWT_SECRET so users don't get logged out across
# redeploys). Force-regenerate with -RegenSecrets.
$forceWrite = if ($RegenSecrets) { "true" } else { "false" }
if ($RegenSecrets) {
    Write-Host "==> -RegenSecrets set: will overwrite .env.prod (all users get logged out)" -ForegroundColor Yellow
}

# Compose file is needed later for 'docker compose up' whether we regen env or not.
$composeFile = if ($DeployMode -eq "cloudflare") { "docker-compose.cloudflare.yml" } else { "docker-compose.intranet.yml" }
$publicApiUrl = if ($DeployMode -eq "cloudflare") { "https://$ApiDomain" } else { "http://${SshHost}:8000" }
$corsOrigins = if ($DeployMode -eq "cloudflare") { "https://$Domain" } else { "http://${SshHost}:5173,http://localhost:5173" }

$envContent = @"
APP_NAME=GrokFlow
APP_ENV=production
APP_DEBUG=false

POSTGRES_USER=grokflow
POSTGRES_PASSWORD=$pgPassword
POSTGRES_DB=grokflow

JWT_SECRET=$jwtSecret
JWT_ALGORITHM=HS256
JWT_EXPIRES_MINUTES=1440

API_KEY_PREFIX=uxpm_live

STORAGE_DRIVER=local
LOCAL_STORAGE_PATH=/app/storage
PROFILE_BASE_PATH=/app/browser_profiles

MAX_CONCURRENT_JOBS_PER_USER=2
MAX_CONCURRENT_JOBS_PER_PROFILE=1
DEFAULT_DAILY_LIMIT=1000
JOB_TIMEOUT_SECONDS=600

CORS_ORIGINS=$corsOrigins
PUBLIC_API_URL=$publicApiUrl

DOMAIN=$Domain
API_DOMAIN=$ApiDomain
CLOUDFLARE_TUNNEL_TOKEN=$TunnelToken

TAG=latest
"@

# Sinh ENCRYPTION_KEY trên server (cần Python 3 + cryptography hoặc dùng Docker)
$genFernet = "docker run --rm python:3.11-slim sh -c 'pip install --quiet cryptography && python -c \`"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\`"'"

$remoteScript = @"
set -e
cd $RemoteDir
if [ -f .env.prod ] && [ "$forceWrite" != "true" ]; then
  echo '.env.prod already exists on server — keeping it (preserves JWT_SECRET, no mass logout)'
  exit 0
fi
echo '$envContent' > .env.prod
ENC_KEY=\`$($genFernet)
echo "ENCRYPTION_KEY=\`$ENC_KEY" >> .env.prod
chmod 600 .env.prod
echo '.env.prod created'
"@

Write-Host "==> Ensuring .env.prod on server (keeps existing unless -RegenSecrets)" -ForegroundColor Cyan
ssh "${SshUser}@${SshHost}" "$remoteScript"

Write-Host "==> docker compose up --build (this takes 3-8 minutes first run)" -ForegroundColor Cyan
ssh "${SshUser}@${SshHost}" "cd $RemoteDir && docker compose -f $composeFile up -d --build"

Write-Host "==> Waiting for backend health..." -ForegroundColor Cyan
$maxWait = 60
for ($i=0; $i -lt $maxWait; $i++) {
    $ok = ssh "${SshUser}@${SshHost}" "docker compose -f $RemoteDir/$composeFile exec -T backend curl -fsS http://localhost:8000/health 2>/dev/null || echo NOT_READY"
    if ($ok -match '"status":"ok"') { Write-Host "Backend healthy" -ForegroundColor Green; break }
    Start-Sleep -Seconds 2
}

Write-Host "==> Seeding admin user" -ForegroundColor Cyan
ssh "${SshUser}@${SshHost}" "cd $RemoteDir && docker compose -f $composeFile exec -T backend python -m app.scripts.create_admin --email '$AdminEmail' --password '$AdminPassword'"

Write-Host ""
Write-Host "================================================================" -ForegroundColor Green
Write-Host "Deploy complete!" -ForegroundColor Green
Write-Host "================================================================" -ForegroundColor Green
if ($DeployMode -eq "cloudflare") {
    Write-Host "Frontend: https://$Domain"
    Write-Host "API:      https://$ApiDomain/docs"
    Write-Host ""
    Write-Host "Trong Cloudflare Zero Trust → Tunnels → <your-tunnel> → Public Hostname:"
    Write-Host "  $Domain      → http://frontend:80"
    Write-Host "  $ApiDomain   → http://backend:8000"
} else {
    Write-Host "Frontend: http://${SshHost}:5173"
    Write-Host "API:      http://${SshHost}:8000/docs"
}
Write-Host ""
Write-Host "Login:    $AdminEmail / $AdminPassword"
Write-Host ""
Write-Host "BAO MAT: doi password SSH ngay! Hien tai dang dung password yeu." -ForegroundColor Yellow
