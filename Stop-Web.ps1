param([string]$DataDirectory)
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$serverPath = Join-Path $projectRoot 'src\server.js'
if (-not $DataDirectory) { $DataDirectory = Join-Path $projectRoot 'data' }
$lockPath = Join-Path ([IO.Path]::GetFullPath($DataDirectory)) 'bridge.lock'
if (-not (Test-Path -LiteralPath $lockPath)) { Write-Host '没有找到运行记录。'; exit 0 }
$bridgePid = [int](Get-Content -LiteralPath $lockPath -Raw)
$processInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$bridgePid" -ErrorAction SilentlyContinue
if (-not $processInfo) { Write-Host '服务已经停止。'; exit 0 }
if ($processInfo.Name -ne 'node.exe' -or -not $processInfo.CommandLine.Contains($serverPath)) {
    throw '进程与本项目不匹配，已停止操作。'
}
$portMatch = [regex]::Match($processInfo.CommandLine, '--port\s+(\d+)')
if (-not $portMatch.Success) { throw '无法确认服务端口。' }
$serviceUrl = "http://127.0.0.1:$($portMatch.Groups[1].Value)"
$health = Invoke-RestMethod "$serviceUrl/health" -TimeoutSec 3
if ($health.service -ne 'codex-workbuddy-web-switcher') { throw '服务与本项目不匹配。' }
$session = Invoke-RestMethod "$serviceUrl/api/session" -TimeoutSec 3
$null = Invoke-RestMethod "$serviceUrl/api/shutdown" -Method Post -Headers @{ 'X-Admin-Token' = $session.token } -ContentType 'application/json' -Body '{}' -TimeoutSec 5
Write-Host '已停止网页版反代；账号和记录已保留。'
