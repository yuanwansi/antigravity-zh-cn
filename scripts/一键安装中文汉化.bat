@echo off
chcp 65001 >nul
setlocal

echo ========================================================
echo   Antigravity 中文汉化引擎 - Windows 一键安装脚本
echo ========================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [错误] 未检测到 Node.js（需要 Node.js >= 18）。
    echo 请先访问 https://nodejs.org 安装后重试。
    pause
    exit /b 1
)

echo [提示] 安装前请确保已完全退出 Antigravity 桌面客户端（包含系统托盘图标）。
echo.
set /p CONFIRM=按回车开始安装（将同时安装桌面端汉化与官方标准中文插件），或按 Ctrl+C 取消...

pushd "%~dp0\.."
node bin\cli.js install --with-plugin %*
set EXIT_CODE=%errorlevel%
popd

echo.
if not "%EXIT_CODE%"=="0" (
    echo [失败] 安装未完成，请查看上方提示信息。
    pause
    exit /b %EXIT_CODE%
)

echo [完成] 安装成功！请重新启动 Antigravity 桌面端查看中文界面。
echo [提示] 运行中按 Alt + Shift + L 可随时切换 中文 / English。
pause
endlocal
