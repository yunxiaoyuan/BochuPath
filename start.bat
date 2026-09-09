@echo off
setlocal

cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] 未找到 Node.js，请先安装 Node.js 24 或更高版本。
  echo         https://nodejs.org/
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] 未找到 npm，请确认 Node.js 已正确安装并加入 PATH。
  pause
  exit /b 1
)

if not exist "node_modules\.bin\vite.cmd" (
  echo 正在安装项目依赖，首次启动可能需要一些时间...
  call npm install
  if errorlevel 1 (
    echo [ERROR] 依赖安装失败，请检查网络或 npm 配置后重试。
    pause
    exit /b 1
  )
)

echo 正在启动 BochuPath...
start "BochuPath 本地权限体验" /D "%~dp0" cmd /k "npm run dev:auth"

ping 127.0.0.1 -n 3 >nul
start "" "http://127.0.0.1:5180/diagrams"

endlocal
