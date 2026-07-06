$ErrorActionPreference = "Stop"
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$AndroidProject = Join-Path $Root "App-main\App-main\MyApplication"
$ReleaseDir = Join-Path $Root "APK发布"
$BuildTools = "D:\Android\SDK\build-tools\34.0.0"
$Zipalign = Join-Path $BuildTools "zipalign.exe"
$ApkSigner = Join-Path $BuildTools "apksigner.bat"

$UnsignedApk = Join-Path $AndroidProject "app\build\outputs\apk\release\app-release-unsigned.apk"
$AlignedApk = Join-Path $AndroidProject "app\build\outputs\apk\release\app-release-aligned.apk"
$SignedApk = Join-Path $AndroidProject "app\build\outputs\apk\release\platform-management-release-public.apk"
$FinalApk = Join-Path $ReleaseDir "platform-management-release-public.apk"
$Keystore = Join-Path $AndroidProject "release-keystore.jks"
$KeyAlias = "platform-release"
$KeyPassword = "PlatformYaokong2026!"

if (-not (Test-Path $AndroidProject)) {
    throw "Android project not found: $AndroidProject"
}
if (-not (Test-Path $Zipalign)) {
    throw "zipalign not found: $Zipalign"
}
if (-not (Test-Path $ApkSigner)) {
    throw "apksigner not found: $ApkSigner"
}
if (-not (Test-Path $Keystore)) {
    throw "Release keystore not found: $Keystore"
}

New-Item -ItemType Directory -Force -Path $ReleaseDir | Out-Null

Write-Host "[1/4] Building release APK..."
Push-Location $AndroidProject
try {
    & ".\gradlew.bat" assembleRelease
    if ($LASTEXITCODE -ne 0) {
        throw "Gradle build failed."
    }
} finally {
    Pop-Location
}

Write-Host "[2/4] Aligning APK..."
if (Test-Path $AlignedApk) { Remove-Item -LiteralPath $AlignedApk -Force }
if (Test-Path $SignedApk) { Remove-Item -LiteralPath $SignedApk -Force }
& $Zipalign -p -f 4 $UnsignedApk $AlignedApk
if ($LASTEXITCODE -ne 0) {
    throw "zipalign failed."
}

Write-Host "[3/4] Signing APK..."
& $ApkSigner sign `
    --ks $Keystore `
    --ks-key-alias $KeyAlias `
    --ks-pass "pass:$KeyPassword" `
    --key-pass "pass:$KeyPassword" `
    --out $SignedApk `
    $AlignedApk
if ($LASTEXITCODE -ne 0) {
    throw "APK signing failed."
}

Write-Host "[4/4] Verifying and copying APK..."
& $ApkSigner verify --verbose $SignedApk | Select-Object -First 8
if ($LASTEXITCODE -ne 0) {
    throw "APK verification failed."
}

Copy-Item -LiteralPath $SignedApk -Destination $FinalApk -Force
$Apk = Get-Item $FinalApk

Write-Host ""
Write-Host "APK packaged successfully:"
Write-Host $Apk.FullName
Write-Host ("Size: {0:N2} MB" -f ($Apk.Length / 1MB))
