@echo off
rem CS2 优化助手 启动脚本
setlocal
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=
where node >nul 2>nul
if %errorlevel%==0 (
  node node_modules\electron\cli.js .
  goto :eof
)
if exist "node_modules\electron\dist\electron.exe" (
  "node_modules\electron\dist\electron.exe" .
  goto :eof
)
echo 未找到 Node.js 或 electron 运行时。
echo 请先执行: npm install  （或 pnpm install）
echo 或安装 Node.js: https://nodejs.org/zh-cn
pause
endlocal
