@echo off
chcp 65001 >nul
setlocal
title Antigravity Chinese Localization - Restore
echo ========================================================
echo   Antigravity 中文汉化引擎 - Windows 一键无损还原
echo ========================================================
echo.
where node >nul 2>nul
if errorlevel 1 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js 18 或更高版本。
    echo.
    pause
    exit /b 1
)
echo [提示] 还原前请先完全退出 Antigravity 桌面客户端。
echo.
pause
pushd "%~dp0.."
node bin\cli.js restore %*
set EXIT_CODE=%errorlevel%
popd
echo.
if not "%EXIT_CODE%"=="0" (
    echo [失败] 还原未完成，请查看上方错误信息。
    echo.
    pause
    exit /b %EXIT_CODE%
)
echo [完成] 已无损还原为官方原版英文！请重启 Antigravity。
echo.
pause
endlocal
