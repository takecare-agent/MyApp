# 啟動影像服務（需先跑過 setup-windows.ps1）
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path ".\.venv\Scripts\Activate.ps1")) {
    Write-Host "請先執行: .\setup-windows.ps1"
    exit 1
}

& ".\.venv\Scripts\Activate.ps1"
python vision_api_server.py
