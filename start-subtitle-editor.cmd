@echo off
setlocal

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found.
  echo Please install Node.js 20 or later, then run this file again.
  echo.
  echo Windows install example:
  echo winget install OpenJS.NodeJS.LTS
  pause
  exit /b 1
)

node scripts\start-editor.mjs

