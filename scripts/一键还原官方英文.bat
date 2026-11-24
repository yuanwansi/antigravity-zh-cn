@echo off
chcp 65001 >nul
setlocal

echo ========================================================
echo   Antigravity 中文汉化引擎 - Windows 一键无损还原脚本
echo ========================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [错误] 未检测到 Node.js（需要 Node.js >= 18）。
    pause
    exit /b 1
)

echo [提示] 还原前请确保已完全退出 Antigravity 桌面客户端。
echo.
set /p CONFIRM=按回车开始还原为官方英文原版，或按 Ctrl+C 取消...

pushd "%~dp0\.."
node bin\cli.js restore %*
set EXIT_CODE=%errorlevel%
popd

echo.
if not "%EXIT_CODE%"=="0" (
    echo [失败] 还原未完成，请查看上方提示信息。
    pause
    exit /b %EXIT_CODE%
)

echo [完成] 已字节级无损还原为官方原版！重启 Antigravity 即可恢复英文界面。
pause
endlocal
