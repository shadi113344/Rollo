# Downloads nodejs-mobile native libraries required to build the APK.
# Run once from the android/ folder before opening in Android Studio.

$ErrorActionPreference = "Stop"

$Version = "18.20.4"
$ZipName = "nodejs-mobile-v$Version-android.zip"
$Url = "https://github.com/nodejs-mobile/nodejs-mobile/releases/download/v$Version/$ZipName"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$LibNodeDir = Join-Path $Root "app\libnode"
$JniDir = Join-Path $Root "app\src\main\jniLibs"
$ZipPath = Join-Path $env:TEMP $ZipName

Write-Host "Downloading nodejs-mobile v$Version..."
Invoke-WebRequest -Uri $Url -OutFile $ZipPath

Write-Host "Extracting..."
Expand-Archive -Path $ZipPath -DestinationPath $LibNodeDir -Force
Remove-Item $ZipPath

$BinDir = Join-Path $LibNodeDir "bin"
if (-not (Test-Path $BinDir)) {
    throw "Expected bin/ inside extracted nodejs-mobile archive"
}

New-Item -ItemType Directory -Force -Path $JniDir | Out-Null
foreach ($Abi in @("arm64-v8a", "armeabi-v7a", "x86_64")) {
    $Src = Join-Path $BinDir "$Abi\libnode.so"
    if (-not (Test-Path $Src)) { continue }
    $DstDir = Join-Path $JniDir $Abi
    New-Item -ItemType Directory -Force -Path $DstDir | Out-Null
    Copy-Item $Src (Join-Path $DstDir "libnode.so") -Force
    Write-Host "Installed libnode.so for $Abi"
}

Write-Host "Done. jniLibs populated under app/src/main/jniLibs/"
