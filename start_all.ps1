param(
    [switch]$StableApiOnly
)

$ErrorActionPreference = "Stop"
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Join-Path $Root "backend"
$FrontendDir = Join-Path $Root "frontend"
$LogDir = Join-Path $Root "logs\startup"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Test-LocalPort {
    param([int]$Port)
    $conn = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
        Where-Object { $_.LocalPort -eq $Port } |
        Select-Object -First 1
    return $null -ne $conn
}

function Wait-LocalPort {
    param(
        [int]$Port,
        [int]$Seconds = 20
    )
    for ($i = 0; $i -lt $Seconds; $i++) {
        if (Test-LocalPort -Port $Port) {
            return $true
        }
        Start-Sleep -Seconds 1
    }
    return $false
}

function Stop-LocalPort {
    param(
        [int]$Port,
        [string]$Name
    )

    $connections = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
        Where-Object { $_.LocalPort -eq $Port }
    $processIds = $connections |
        Select-Object -ExpandProperty OwningProcess -Unique |
        Where-Object { $_ -and $_ -gt 0 }

    foreach ($processId in $processIds) {
        try {
            $process = Get-Process -Id $processId -ErrorAction Stop
            Write-Host "[..] Stopping existing $Name on port $Port (PID $processId, $($process.ProcessName))..."
            Stop-Process -Id $processId -Force
        } catch {
            Write-Host "[WARN] Could not stop $Name PID ${processId}: $($_.Exception.Message)"
        }
    }

    for ($i = 0; $i -lt 10; $i++) {
        if (-not (Test-LocalPort -Port $Port)) {
            return
        }
        Start-Sleep -Milliseconds 500
    }

    if (Test-LocalPort -Port $Port) {
        throw "$Name is still listening on port $Port after stop attempt."
    }
}

function Stop-FrontendPorts {
    $ports = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
        Where-Object { $_.LocalPort -ge 3000 -and $_.LocalPort -le 3010 } |
        Select-Object -ExpandProperty LocalPort -Unique

    foreach ($port in $ports) {
        Stop-LocalPort -Port $port -Name "frontend"
    }
}

function Find-Mongod {
    $cmd = Get-Command mongod -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }

    $candidates = Get-ChildItem "C:\Program Files\MongoDB\Server" -Directory -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending |
        ForEach-Object { Join-Path $_.FullName "bin\mongod.exe" } |
        Where-Object { Test-Path $_ }

    return $candidates | Select-Object -First 1
}

function Find-Python {
    $condaPython = "D:\Anaconda\python.exe"
    if (Test-Path $condaPython) { return $condaPython }

    $cmd = Get-Command python -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }

    throw "Python was not found. Install Python or update start_all.ps1."
}

function Start-Mongo {
    if (Test-LocalPort -Port 27017) {
        Write-Host "[OK] MongoDB already listening on 27017"
        return
    }

    Write-Host "[..] Starting MongoDB..."

    $service = Get-Service -Name MongoDB -ErrorAction SilentlyContinue
    if ($service) {
        try {
            if ($service.Status -ne "Running") {
                Start-Service -Name MongoDB
            }
            if (Wait-LocalPort -Port 27017 -Seconds 12) {
                Write-Host "[OK] MongoDB service started on 27017"
                return
            }
        } catch {
            Write-Host "[WARN] Could not start MongoDB service: $($_.Exception.Message)"
        }
    }

    $mongod = Find-Mongod
    if (-not $mongod) {
        Write-Host "[WARN] mongod.exe not found. Please start MongoDB manually."
        return
    }

    $dbPath = "E:\MongoDB\data"
    if (-not (Test-Path $dbPath)) {
        $dbPath = Join-Path $Root "MongoData\db"
        New-Item -ItemType Directory -Force -Path $dbPath | Out-Null
    }

    $mongoOut = Join-Path $LogDir "mongo.out.log"
    $mongoErr = Join-Path $LogDir "mongo.err.log"
    Start-Process -FilePath $mongod `
        -ArgumentList "--dbpath", $dbPath `
        -RedirectStandardOutput $mongoOut `
        -RedirectStandardError $mongoErr `
        -WindowStyle Hidden

    if (Wait-LocalPort -Port 27017 -Seconds 15) {
        Write-Host "[OK] MongoDB started on 27017"
    } else {
        Write-Host "[WARN] MongoDB did not open 27017. Check $mongoErr"
    }
}

function Start-Backend {
    if (Test-LocalPort -Port 9000) {
        Stop-LocalPort -Port 9000 -Name "backend"
    }

    $python = Find-Python
    $backendOut = Join-Path $LogDir "backend.out.log"
    $backendErr = Join-Path $LogDir "backend.err.log"
    $args = @("-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "9000")
    if ($StableApiOnly) {
        $args += @("--lifespan", "off")
    }

    Write-Host "[..] Starting backend on 9000..."
    $env:PYTHONIOENCODING = "utf-8"
    Start-Process -FilePath $python `
        -ArgumentList $args `
        -WorkingDirectory $BackendDir `
        -RedirectStandardOutput $backendOut `
        -RedirectStandardError $backendErr `
        -WindowStyle Hidden

    if (Wait-LocalPort -Port 9000 -Seconds 25) {
        Write-Host "[OK] Backend started on http://localhost:9000"
    } else {
        Write-Host "[WARN] Backend did not open 9000. Check $backendErr"
    }
}

function Start-Ollama {
    if (Test-LocalPort -Port 11434) {
        Write-Host "[OK] Ollama already running on 11434"
        return
    }

    Write-Host "[..] Starting Ollama..."

    $ollama = Get-Command ollama -ErrorAction SilentlyContinue
    if (-not $ollama) {
        Write-Host "[WARN] ollama command not found. Please install Ollama from https://ollama.com/download"
        Write-Host "[WARN] AI chat assistant will not work without Ollama"
        return
    }

    $ollamaOut = Join-Path $LogDir "ollama.out.log"
    $ollamaErr = Join-Path $LogDir "ollama.err.log"
    
    Start-Process -FilePath $ollama.Source `
        -ArgumentList "serve" `
        -RedirectStandardOutput $ollamaOut `
        -RedirectStandardError $ollamaErr `
        -WindowStyle Hidden

    if (Wait-LocalPort -Port 11434 -Seconds 10) {
        Write-Host "[OK] Ollama started on http://localhost:11434"
    } else {
        Write-Host "[WARN] Ollama did not start properly. Check $ollamaErr"
    }
}

function Start-Frontend {
    $frontendPort = 3000
    Stop-FrontendPorts

    $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $npm) {
        Write-Host "[WARN] npm.cmd not found. Please install Node.js or add npm to PATH."
        return
    }

    $frontendOut = Join-Path $LogDir "frontend.out.log"
    $frontendErr = Join-Path $LogDir "frontend.err.log"

    Write-Host "[..] Starting frontend..."
    Start-Process -FilePath $npm.Source `
        -ArgumentList "run", "dev", "--", "--host", "0.0.0.0" `
        -WorkingDirectory $FrontendDir `
        -RedirectStandardOutput $frontendOut `
        -RedirectStandardError $frontendErr `
        -WindowStyle Hidden

    Start-Sleep -Seconds 4
    $vitePort = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
        Where-Object { $_.LocalPort -ge 3000 -and $_.LocalPort -le 3010 } |
        Sort-Object LocalPort |
        Select-Object -First 1 -ExpandProperty LocalPort

    if ($vitePort) {
        Write-Host "[OK] Frontend started on http://localhost:$vitePort"
    } else {
        Write-Host "[WARN] Frontend did not open a 3000-3010 port. Check $frontendErr"
    }
}

Write-Host "============================================================"
Write-Host "Starting platform services"
Write-Host "Root: $Root"
Write-Host "Logs: $LogDir"
Write-Host "Backend mode: $(if ($StableApiOnly) { 'stable API only' } else { 'full lifespan, includes fence polling and JT808 8989' })"
Write-Host "============================================================"

Start-Mongo
Start-Ollama
Start-Backend
Start-Frontend

Write-Host "============================================================"
Write-Host "Done."
Write-Host "Frontend: http://localhost:3000  (or the 3001+ port printed above)"
Write-Host "Backend:  http://localhost:9000"
Write-Host "MongoDB:  mongodb://127.0.0.1:27017"
Write-Host "AI:       http://localhost:9000/api/ai (integrated in backend)"
if ($FullBackend) {
    Write-Host "JT808:    127.0.0.1:8989"
} else {
    Write-Host "Tip: use .\start_all.ps1 -FullBackend to also start lifecycle services."
}
Write-Host "`nAI assistant service notes:"
Write-Host "  - AI API is integrated into the backend; no separate service is required."
Write-Host "  - Health check: http://localhost:9000/api/ai/health"
Write-Host "  - To use AI features, make sure Ollama is installed and running."
Write-Host "============================================================"
