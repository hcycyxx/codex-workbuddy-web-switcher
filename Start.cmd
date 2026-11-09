@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto missing_node

for /f "usebackq delims=" %%V in (`node -p "process.versions.node.split('.')[0]"`) do set "NODE_MAJOR=%%V"
if not defined NODE_MAJOR goto missing_node
if %NODE_MAJOR% LSS 22 goto old_node

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-Web.ps1"
if errorlevel 1 goto failed
exit /b 0

:missing_node
echo.
echo 没有找到 Node.js。请先安装 Node.js 22 或更新版本。
echo 安装完成后重新双击 Start.cmd。
echo.
start "" "https://nodejs.org/en/download"
pause
exit /b 1

:old_node
echo.
echo 当前 Node.js 版本是 v%NODE_MAJOR%，本项目需要 Node.js 22 或更新版本。
echo 请升级 Node.js 后重新双击 Start.cmd。
echo.
pause
exit /b 1

:failed
echo.
echo 启动失败。请查看上面的错误信息，或检查 .runtime 目录中的日志。
pause
exit /b 1
