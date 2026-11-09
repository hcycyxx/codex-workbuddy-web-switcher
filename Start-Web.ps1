param(
    [int]$Port = 8900,
    [string]$DataDirectory,
    [int]$MaxBodyMiB = 1024,
    [switch]$NoBrowser
)
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$runtimeRoot = Join-Path $projectRoot '.runtime'
$serverPath = Join-Path $projectRoot 'src\server.js'
if ($Port -lt 1024 -or $Port -gt 65535) { throw '端口应在 1024-65535 之间。' }
if ($MaxBodyMiB -lt 1) { throw 'MaxBodyMiB 必须大于零。' }
if (-not $DataDirectory) { $DataDirectory = Join-Path $projectRoot 'data' }
$DataDirectory = [IO.Path]::GetFullPath($DataDirectory)

$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $nodeCommand) { throw '没有找到 Node.js。需要 Node.js 22 或更高版本。' }
$serviceUrl = "http://127.0.0.1:$Port"
$existing = $null
try { $existing = Invoke-RestMethod "$serviceUrl/health" -TimeoutSec 2 } catch {}
if ($existing -and $existing.service -ne 'codex-workbuddy-web-switcher') {
    throw "端口 $Port 正由其他程序使用。请选择其他端口。"
}

if (-not $existing) {
    New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
    $stamp = Get-Date -Format 'yyyyMMdd_HHmmss_fff'
    $outLog = Join-Path $runtimeRoot "start_$stamp.out.log"
    $errLog = Join-Path $runtimeRoot "start_$stamp.err.log"
    $previousDataDir = $env:WORKBUDDY_DATA
    $previousMaxMiB = $env:WORKBUDDY_MAX_BODY_MIB
    try {
        $env:WORKBUDDY_DATA = $DataDirectory
        $env:WORKBUDDY_MAX_BODY_MIB = "$MaxBodyMiB"
        $child = Start-Process -FilePath $nodeCommand.Source -ArgumentList ("`"$serverPath`"", '--port', "$Port") -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru
    } finally {
        $env:WORKBUDDY_DATA = $previousDataDir
        $env:WORKBUDDY_MAX_BODY_MIB = $previousMaxMiB
    }
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Milliseconds 500
        $child.Refresh()
        if ($child.HasExited) { throw "启动失败，请查看日志：$errLog" }
        try {
            $health = Invoke-RestMethod "$serviceUrl/health" -TimeoutSec 1
            if ($health.service -eq 'codex-workbuddy-web-switcher') { $ready = $true; break }
        } catch {}
    }
    if (-not $ready) { throw "服务未及时启动，请查看日志：$errLog" }
}

if (-not $NoBrowser) { Start-Process $serviceUrl | Out-Null }
Write-Host "管理页：$serviceUrl"
Write-Host "请求体上限：$MaxBodyMiB MiB"
Write-Host '停止服务：powershell -ExecutionPolicy Bypass -File .\Stop-Web.ps1'
