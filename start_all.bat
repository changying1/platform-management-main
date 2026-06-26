@echo off
chcp 65001 >nul
set "SCRIPT_DIR=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$OutputEncoding=[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); & '%SCRIPT_DIR%start_all.ps1' %*"
pause
