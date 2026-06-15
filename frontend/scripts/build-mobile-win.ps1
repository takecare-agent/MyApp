param(
  [string]$DriveLetter = "X"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$driveRoot = "$DriveLetter`:"
$mounted = $false

try {
  $existing = Get-PSDrive -Name $DriveLetter -ErrorAction SilentlyContinue
  if ($existing) {
    throw "Drive $driveRoot already exists. Use another letter: npm run build:mobile:win -- -DriveLetter Y"
  }

  subst $driveRoot $projectRoot | Out-Null
  $mounted = $true

  Push-Location "$driveRoot\"

  npm.cmd run build
  if ($LASTEXITCODE -ne 0) {
    throw "vite build failed"
  }

  npx.cmd cap sync
  if ($LASTEXITCODE -ne 0) {
    throw "capacitor sync failed"
  }
}
finally {
  if (Get-Location) {
    Pop-Location -ErrorAction SilentlyContinue
  }

  if ($mounted) {
    subst $driveRoot /d | Out-Null
  }
}
