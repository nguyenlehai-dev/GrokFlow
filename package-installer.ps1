# Packages GrokFlow into a self-hosted installer ZIP.
#
# Steps:
#   1. Build backend + frontend prod images (uses Dockerfile.prod)
#   2. Pull base images (postgres, redis)
#   3. docker save all 4 images → installer/images/*.tar
#   4. Copy installer scripts into a staging dir
#   5. Zip it → dist/grokflow-installer-vX.Y.Z.zip
#
# Run from repo root:
#   .\package-installer.ps1                 # default tag = "latest"
#   .\package-installer.ps1 -Tag "v1.0.0"
#
# Output: dist/grokflow-installer-<tag>.zip

param(
    [string]$Tag = "latest",
    [string]$BackendImage = "grokflow/backend",
    [string]$FrontendImage = "grokflow/frontend",
    [switch]$SkipBuild,
    [switch]$SkipImages    # skip docker save (smaller bundle, requires internet on install)
)

$ErrorActionPreference = "Stop"
$RepoRoot = $PSScriptRoot
$Staging = Join-Path $RepoRoot "dist\staging"
$DistDir = Join-Path $RepoRoot "dist"
$ZipPath = Join-Path $DistDir "grokflow-installer-$Tag.zip"

Write-Host "============================================================"
Write-Host "  GrokFlow Installer Packager"
Write-Host "  Tag: $Tag"
Write-Host "============================================================`n"

# 1. Build images
if (-not $SkipBuild) {
    Write-Host "[1/5] Building backend image..."
    docker build -t "${BackendImage}:${Tag}" -f backend/Dockerfile.prod backend/
    if ($LASTEXITCODE -ne 0) { throw "Backend build failed" }

    Write-Host "`n[1/5] Building frontend image..."
    docker build `
        -t "${FrontendImage}:${Tag}" `
        -f frontend/Dockerfile.prod `
        --build-arg VITE_API_BASE_URL= `
        frontend/
    if ($LASTEXITCODE -ne 0) { throw "Frontend build failed" }
} else {
    Write-Host "[1/5] Skipping build (--SkipBuild)."
}

# 2. Pull base images
if (-not $SkipImages) {
    Write-Host "`n[2/5] Pulling base images..."
    docker pull postgres:16-alpine
    docker pull redis:7-alpine
}

# 3. Prepare staging dir
Write-Host "`n[3/5] Preparing staging dir at $Staging..."
if (Test-Path $Staging) { Remove-Item -Recurse -Force $Staging }
New-Item -ItemType Directory -Path $Staging | Out-Null
New-Item -ItemType Directory -Path "$Staging\images" | Out-Null

Copy-Item -Recurse "installer\*" $Staging
# Re-tag the bundled compose's TAG inside .env.example
(Get-Content "$Staging\.env.example") -replace 'TAG=latest', "TAG=$Tag" |
    Set-Content "$Staging\.env.example"

# 4. docker save images
if (-not $SkipImages) {
    Write-Host "`n[4/5] Saving images to tar (this takes a while)..."
    docker save -o "$Staging\images\backend.tar"  "${BackendImage}:${Tag}"
    docker save -o "$Staging\images\frontend.tar" "${FrontendImage}:${Tag}"
    docker save -o "$Staging\images\postgres.tar" "postgres:16-alpine"
    docker save -o "$Staging\images\redis.tar"    "redis:7-alpine"

    Get-ChildItem "$Staging\images\*.tar" | ForEach-Object {
        $mb = [math]::Round($_.Length / 1MB, 1)
        Write-Host ("  " + $_.Name + " - " + $mb + " MB")
    }
} else {
    Write-Host "`n[4/5] Skipping docker save (--SkipImages). Installer will need internet."
    Remove-Item -Recurse -Force "$Staging\images"
}

# 5. Zip
Write-Host "`n[5/5] Creating ZIP at $ZipPath..."
if (Test-Path $ZipPath) { Remove-Item $ZipPath }
Compress-Archive -Path "$Staging\*" -DestinationPath $ZipPath -CompressionLevel Optimal

$zipMb = [math]::Round((Get-Item $ZipPath).Length / 1MB, 1)
Write-Host "`n============================================================"
Write-Host ("  BUNDLED: " + $ZipPath + " (" + $zipMb + " MB)")
Write-Host "============================================================"
Write-Host "Gui file ZIP cho khach. Khach giai nen, chay install.bat (Windows)"
Write-Host "hoac ./install.sh (Linux/Mac)."
