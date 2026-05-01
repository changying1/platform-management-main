@echo off
chcp 65001 >nul
echo ============================================================
echo    MongoDB 启动脚本 (数据跟随项目目录)
echo ============================================================
echo.

set "SCRIPT_DIR=%~dp0"
set "MONGO_DATA=%SCRIPT_DIR%..\MongoData\db"

echo 数据目录: %MONGO_DATA%
echo.

if not exist "%MONGO_DATA%" (
    echo 创建数据目录...
    mkdir "%MONGO_DATA%"
)

echo 启动 MongoDB...
echo.
echo 💡 保持此窗口打开，不要关闭！
echo 💡 正常启动后会看到: waiting for connections on port 27017
echo.
echo ============================================================
echo.

mongod --dbpath "%MONGO_DATA%"
