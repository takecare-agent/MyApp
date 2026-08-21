# TakeCare Vision — Windows 一鍵安裝（PowerShell）
# 用法：在 vision-runtime 資料夾內執行
#   Set-ExecutionPolicy -Scope Process Bypass
#   .\setup-windows.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "==> 檢查 Python 3.12（必須 64-bit）"
$py = $null
foreach ($cmd in @("py -3.12", "py -3.11", "py -3.10")) {
    try {
        $v = Invoke-Expression "$cmd -c `"import sys; print(sys.version)`"" 2>$null
        if ($v) { $py = $cmd; break }
    } catch {}
}
if (-not $py) {
    Write-Host "找不到 Python 3.10~3.12。請先安裝：https://www.python.org/downloads/"
    Write-Host "安裝時勾選 'Add python.exe to PATH'，並選 64-bit。"
    exit 1
}
Write-Host "使用: $py"

Write-Host "==> 建立虛擬環境 .venv"
Invoke-Expression "$py -m venv .venv"

Write-Host "==> 啟動虛擬環境"
& ".\.venv\Scripts\Activate.ps1"

Write-Host "==> 升級 pip"
python -m pip install --upgrade pip

Write-Host "==> 安裝套件（可能需要幾分鐘）"
pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "安裝失敗。常見原因："
    Write-Host "  1) Python 版本是 3.13+（TensorFlow 尚不支援）→ 請裝 Python 3.12"
    Write-Host "  2) 32-bit Python → 請改裝 64-bit"
    Write-Host "檢查版本: python -c `"import sys; print(sys.version)`""
    exit 1
}

Write-Host ""
Write-Host "安裝完成。啟動服務："
Write-Host "  .\.venv\Scripts\Activate.ps1"
Write-Host "  python vision_api_server.py"
Write-Host ""
Write-Host "若鏡頭不是 0 號："
Write-Host '  $env:CAM_INDEX=1; python vision_api_server.py'
