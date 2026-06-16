# Build signed release APK (sets JAVA_HOME from Android Studio if needed).
$ErrorActionPreference = "Stop"
$androidDir = $PSScriptRoot

if (-not $env:JAVA_HOME) {
    $candidates = @(
        "${env:ProgramFiles}\Android\Android Studio\jbr",
        "${env:ProgramFiles(x86)}\Android\Android Studio\jbr",
        "${env:LOCALAPPDATA}\Programs\Android\Android Studio\jbr"
    )
    foreach ($path in $candidates) {
        if (Test-Path (Join-Path $path "bin\java.exe")) {
            $env:JAVA_HOME = $path
            break
        }
    }
}

if (-not (Test-Path (Join-Path $androidDir "keystore.properties"))) {
    Write-Host "No keystore.properties — running setup-release-keystore.ps1 ..."
    & (Join-Path $androidDir "setup-release-keystore.ps1")
}

Set-Location $androidDir
& .\gradlew.bat assembleRelease @args
if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Release APK: app\build\outputs\apk\release\app-release.apk"
}
