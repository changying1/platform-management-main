@echo off
chcp 65001 >nul
color 0A

cls
echo ============================================================
echo    MongoDB 启动脚本 - 增强版
echo ============================================================
echo.

set "SCRIPT_DIR=%~dp0"
set "MONGO_DATA=%SCRIPT_DIR%..\MongoData\db"

echo [1/4] 检测数据目录
echo        %MONGO_DATA%

if not exist "%MONGO_DATA%" (
    echo        创建目录...
    mkdir "%MONGO_DATA%"
)
echo        ✅ 就绪
echo.

echo [2/4] 查找 MongoDB...

where mongod >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    set "MONGO_EXE=mongod"
    echo        找到: mongod (系统PATH)
    goto :start_mongo
)

:: 自动搜索常见安装路径
set "MONGO_PATH="
for /d %%d in ("C:\Program Files\MongoDB\Server\*") do (
    if exist "%%d\bin\mongod.exe" (
        set "MONGO_EXE=%%d\bin\mongod.exe"
        echo        找到: %%d\bin\mongod.exe
        goto :start_mongo
    )
)

echo.
echo ❌ 未找到 MongoDB！
echo.
echo 请选择：
echo   1. 手动下载安装: https://www.mongodb.com/try/download/community
echo   2. 或把 mongod.exe 所在目录加入系统 PATH
echo.
pause
exit /b 1

:start_mongo
echo.
echo [3/4] 准备启动...
echo.
echo 💡 保持此窗口打开，不要关闭！
echo 💡 正常启动后最后一行会显示:
echo    waiting for connections on port 27017
echo.
echo [4/4] 启动 MongoDB 服务
echo ============================================================
echo.

"%MONGO_EXE%" --dbpath "%MONGO_DATA%"

echo.
echo ============================================================
echo ❌ MongoDB 已退出，按任意键关闭...
echo ============================================================
pause
