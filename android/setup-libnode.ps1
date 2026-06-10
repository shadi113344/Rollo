# Downloads nodejs-mobile native libraries required to build the APK.
# Run from the android/ folder before building in Android Studio.

$ErrorActionPreference = "Stop"

$Version = "18.20.4"
$ZipName = "nodejs-mobile-v$Version-android.zip"
$Url = "https://github.com/nodejs-mobile/nodejs-mobile/releases/download/v$Version/$ZipName"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$LibNodeDir = Join-Path $Root "app\libnode"
$IncludeDir = Join-Path $LibNodeDir "include"
$JniDir = Join-Path $Root "app\src\main\jniLibs"
$AssetsDir = Join-Path $Root "app\src\main\assets\libnode"
$Abis = @("arm64-v8a", "armeabi-v7a", "x86_64")
$AbiTriples = @{
    "arm64-v8a"   = "aarch64-linux-android"
    "armeabi-v7a" = "arm-linux-androideabi"
    "x86_64"      = "x86_64-linux-android"
}

function Get-NdkRoot {
    if ($env:ANDROID_NDK_HOME -and (Test-Path $env:ANDROID_NDK_HOME)) {
        return $env:ANDROID_NDK_HOME
    }
    $localProps = Join-Path $Root "local.properties"
    if (Test-Path $localProps) {
        $sdkLine = Get-Content $localProps | Where-Object { $_ -match '^sdk\.dir=' } | Select-Object -First 1
        if ($sdkLine) {
            $sdkDir = ($sdkLine -replace '^sdk\.dir=', '').Trim()
            $sdkDir = $sdkDir -replace '\\\\', '\'
            $sdkDir = $sdkDir -replace '\\:', ':'
            $ndkParent = Join-Path $sdkDir "ndk"
            if (Test-Path $ndkParent) {
                $latest = Get-ChildItem $ndkParent | Sort-Object Name -Descending | Select-Object -First 1
                if ($latest) { return $latest.FullName }
            }
        }
    }
    return $null
}

function Find-CppShared($NdkRoot, $Abi) {
    $legacy = Join-Path $NdkRoot "sources\cxx-stl\llvm-libc++\libs\$Abi\libc++_shared.so"
    if (Test-Path $legacy) { return $legacy }

    $triple = $AbiTriples[$Abi]
    $prebuiltRoot = Join-Path $NdkRoot "toolchains\llvm\prebuilt"
    if (-not (Test-Path $prebuiltRoot)) { return $null }
    $hostDir = Get-ChildItem $prebuiltRoot | Select-Object -First 1
    if (-not $hostDir) { return $null }
    $modern = Join-Path $hostDir.FullName "sysroot\usr\lib\$triple\libc++_shared.so"
    if (Test-Path $modern) { return $modern }
    return $null
}

function Install-CppSharedFromNdk {
    $ndk = Get-NdkRoot
    if (-not $ndk) {
        Write-Host "NDK not found - libc++_shared.so will be bundled by Gradle CMake build."
        return
    }
    foreach ($Abi in $Abis) {
        $src = Find-CppShared $ndk $Abi
        if (-not $src) { continue }
        $dstDir = Join-Path $JniDir $Abi
        New-Item -ItemType Directory -Force -Path $dstDir | Out-Null
        Copy-Item $src (Join-Path $dstDir "libc++_shared.so") -Force
        Write-Host "Installed libc++_shared.so for $Abi (jniLibs)"
    }
}

function Sync-AssetsFromJniLibs {
    New-Item -ItemType Directory -Force -Path $AssetsDir | Out-Null
    foreach ($Abi in $Abis) {
        $assetAbiDir = Join-Path $AssetsDir $Abi
        New-Item -ItemType Directory -Force -Path $assetAbiDir | Out-Null
        foreach ($lib in @("libnode.so", "libc++_shared.so")) {
            $src = Join-Path $JniDir "$Abi\$lib"
            if (-not (Test-Path $src)) { continue }
            Copy-Item $src (Join-Path $assetAbiDir $lib) -Force
            Write-Host "Copied $lib to assets for $Abi"
        }
    }
}

function Ensure-NodeHeaders {
    $nodeH = Join-Path $IncludeDir "node\node.h"
    if (Test-Path $nodeH) { return }
    Write-Host "Node headers missing - downloading nodejs-mobile v$Version for include/..."
    $ZipPath = Join-Path $env:TEMP "$ZipName.$PID.headers.zip"
    if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force -ErrorAction SilentlyContinue }
    Invoke-WebRequest -Uri $Url -OutFile $ZipPath
    if (Test-Path $LibNodeDir) { Remove-Item $LibNodeDir -Recurse -Force }
    Expand-Archive -Path $ZipPath -DestinationPath $LibNodeDir -Force
    Remove-Item $ZipPath -Force -ErrorAction SilentlyContinue
    if (-not (Test-Path $nodeH)) {
        throw "Expected include/node/node.h inside nodejs-mobile archive"
    }
    Write-Host "Installed Node headers to $IncludeDir"
}

$Arm64 = Join-Path $JniDir "arm64-v8a\libnode.so"
if (Test-Path $Arm64) {
    Write-Host "libnode.so already installed - syncing headers, libc++, and assets."
    Ensure-NodeHeaders
    Install-CppSharedFromNdk
    Sync-AssetsFromJniLibs
    Write-Host "Done. Rebuild APK in Android Studio."
    exit 0
}

$ZipPath = Join-Path $env:TEMP "$ZipName.$PID.zip"
if (Test-Path $ZipPath) {
    Remove-Item $ZipPath -Force -ErrorAction SilentlyContinue
}

Write-Host "Downloading nodejs-mobile v$Version..."
Invoke-WebRequest -Uri $Url -OutFile $ZipPath

Write-Host "Extracting..."
if (Test-Path $LibNodeDir) { Remove-Item $LibNodeDir -Recurse -Force }
Expand-Archive -Path $ZipPath -DestinationPath $LibNodeDir -Force
Remove-Item $ZipPath -Force -ErrorAction SilentlyContinue

$BinDir = Join-Path $LibNodeDir "bin"
if (-not (Test-Path $BinDir)) {
    throw "Expected bin/ inside extracted nodejs-mobile archive"
}

New-Item -ItemType Directory -Force -Path $JniDir | Out-Null

foreach ($Abi in $Abis) {
    $Src = Join-Path $BinDir "$Abi\libnode.so"
    if (-not (Test-Path $Src)) { continue }
    $DstDir = Join-Path $JniDir $Abi
    New-Item -ItemType Directory -Force -Path $DstDir | Out-Null
    Copy-Item $Src (Join-Path $DstDir "libnode.so") -Force
    Write-Host "Installed libnode.so for $Abi (jniLibs)"
}

Ensure-NodeHeaders
Install-CppSharedFromNdk
Sync-AssetsFromJniLibs

Write-Host "Done. Rebuild APK in Android Studio."
