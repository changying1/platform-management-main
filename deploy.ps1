<#
.SYNOPSIS
智能安全帽平台一键部署脚本
#>

$ErrorActionPreference = "Stop"

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "    智能安全帽平台 - 本地一键部署工具" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$PROJECT_ROOT = $PSScriptRoot
$BACKEND_DIR = Join-Path $PROJECT_ROOT "backend"
$FRONTEND_DIR = Join-Path $PROJECT_ROOT "frontend"

# ============================================================
# 1. 环境检查
# ============================================================
Write-Host "`n[1/6] 🔍 环境检查" -ForegroundColor Yellow

function Test-CommandExists {
    param($Command)
    $null -ne (Get-Command $Command -ErrorAction SilentlyContinue)
}

$checks = @(
    @{Name = "Python"; Command = "python" },
    @{Name = "Node.js"; Command = "node" },
    @{Name = "MySQL"; Command = "mysql" },
    @{Name = "MongoDB"; Command = "mongod" }
)

foreach ($check in $checks) {
    if (Test-CommandExists $check.Command) {
        $version = & $check.Command --version 2>&1 | Select-Object -First 1
        Write-Host "   ✅ $($check.Name): $version" -ForegroundColor Green
    }
    else {
        Write-Host "   ⚠️  $($check.Name): 未找到, 请手动安装" -ForegroundColor Yellow
    }
}

# ============================================================
# 2. MongoDB 数据导入
# ============================================================
Write-Host "`n[2/6] 📦 MongoDB 数据导入" -ForegroundColor Yellow

try {
    Push-Location $BACKEND_DIR
    python -m scripts.import_mongo
    Pop-Location
    Write-Host "   ✅ MongoDB 数据导入完成" -ForegroundColor Green
}
catch {
    Write-Host "   ⚠️  MongoDB 导入失败: $_" -ForegroundColor Yellow
}

# ============================================================
# 3. MySQL 数据库初始化
# ============================================================
Write-Host "`n[3/6] 🗄️  MySQL 数据库初始化" -ForegroundColor Yellow

try {
    Push-Location $BACKEND_DIR
    
    Write-Host "   执行 SQLAlchemy 表结构自动创建..."
    python -c @"
from app.core.database import engine, Base, ensure_schema_compatibility
import app.models.admin_user
import app.models.device
import app.models.video
import app.models.group_call
import app.models.fence
import app.models.alarm_records
import app.models.location_history

Base.metadata.create_all(bind=engine)
ensure_schema_compatibility()
print('✅ MySQL 表结构创建完成')
"@
    
    Pop-Location
}
catch {
    Write-Host "   ⚠️  MySQL 初始化失败: $_" -ForegroundColor Yellow
}

# ============================================================
# 4. 后端依赖安装
# ============================================================
Write-Host "`n[4/6] 🐍 后端依赖安装" -ForegroundColor Yellow

try {
    Push-Location $BACKEND_DIR
    if (!(Test-Path "venv")) {
        Write-Host "   创建虚拟环境..."
        python -m venv venv
    }
    
    $pipPath = Join-Path $BACKEND_DIR "venv\Scripts\pip.exe"
    & $pipPath install -q -r requirements.txt
    Write-Host "   ✅ 后端依赖安装完成" -ForegroundColor Green
    Pop-Location
}
catch {
    Write-Host "   ⚠️  后端依赖安装失败: $_" -ForegroundColor Yellow
}

# ============================================================
# 5. 前端依赖安装
# ============================================================
Write-Host "`n[5/6] 📦 前端依赖安装" -ForegroundColor Yellow

try {
    Push-Location $FRONTEND_DIR
    npm install --silent
    Write-Host "   ✅ 前端依赖安装完成" -ForegroundColor Green
    Pop-Location
}
catch {
    Write-Host "   ⚠️  前端依赖安装失败: $_" -ForegroundColor Yellow
}

# ============================================================
# 6. 启动提示
# ============================================================
Write-Host "`n[6/6] 🚀 启动服务" -ForegroundColor Yellow

Write-Host "`n============================================================" -ForegroundColor Green
Write-Host "    部署完成！接下来请执行以下命令:" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green

Write-Host "`n📌 启动后端服务 (新开终端):" -ForegroundColor Cyan
Write-Host "   cd backend"
Write-Host "   venv\Scripts\activate"
Write-Host "   python main.py"
Write-Host "   (默认端口: 8000)"

Write-Host "`n📌 启动前端服务 (新开终端):" -ForegroundColor Cyan
Write-Host "   cd frontend"
Write-Host "   npm run dev"
Write-Host "   (默认端口: 3000)"

Write-Host "`n📌 数据库配置:" -ForegroundColor Cyan
Write-Host "   MySQL: root:123456@localhost:3306/company-management"
Write-Host "   MongoDB: localhost:27017/smart_helmet_mongo"

Write-Host "`n🎉 访问: http://localhost:3000`n"

Write-Host "💡 提示: 先确保 MySQL 和 MongoDB 服务已启动`n"
