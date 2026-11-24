@echo off
chcp 65001 >nul
setlocal
title Antigravity Chinese Localization - Install
echo ========================================================
echo   Antigravity 中文汉化引擎 - Windows 一键安装
echo ========================================================
echo.
where node >nul 2>nul
if errorlevel 1 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js 18 或更高版本：https://nodejs.org
    echo.
    pause
    exit /b 1
)
echo [提示] 安装前请先完全退出 Antigravity 桌面客户端（含右下角托盘图标）。
echo [说明] 即将安装桌面端中文汉化与官方标准中文插件。
echo.
pause
pushd "%~dp0.."
node bin\cli.js install --with-plugin %*
set EXIT_CODE=%errorlevel%
popd
echo.
if not "%EXIT_CODE%"=="0" (
    echo [失败] 安装未完成，请查看上方错误信息。
    echo.
    pause
    exit /b %EXIT_CODE%
)
echo [完成] 安装成功！请重新启动 Antigravity 桌面客户端。
echo [提示] 运行时按 Alt + Shift + L 可随时切换 中文 / English。
echo.
pause
endlocal
