# One-time setup: create a release keystore + keystore.properties for signed APK builds.
# Back up rollo-release.jks and keystore.properties somewhere safe — you need the same
# key for every update or Play Protect treats each build as a new developer.

$ErrorActionPreference = "Stop"
$androidDir = $PSScriptRoot
$keystore = Join-Path $androidDir "rollo-release.jks"
$props = Join-Path $androidDir "keystore.properties"

if ((Test-Path $keystore) -and (Test-Path $props)) {
    Write-Host "Release keystore already exists:"
    Write-Host "  $keystore"
    Write-Host "  $props"
    exit 0
}

$keytool = Get-Command keytool -ErrorAction SilentlyContinue
if (-not $keytool) {
    $candidates = @(
        "${env:ProgramFiles}\Android\Android Studio\jbr\bin\keytool.exe",
        "${env:ProgramFiles(x86)}\Android\Android Studio\jbr\bin\keytool.exe",
        "${env:LOCALAPPDATA}\Programs\Android\Android Studio\jbr\bin\keytool.exe"
    )
    foreach ($path in $candidates) {
        if (Test-Path $path) {
            $keytool = Get-Command $path
            break
        }
    }
}
if (-not $keytool) {
    Write-Error "keytool not found. Install JDK 17+ or Android Studio."
}

function New-RandomPassword {
    $bytes = New-Object byte[] 24
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    return [Convert]::ToBase64String($bytes) -replace '[^a-zA-Z0-9]', 'x'
}

$storePass = New-RandomPassword
$keyPass = $storePass
$alias = "rollo"
$dname = "CN=Rollo-Server, OU=Personal, O=Rollo, L=Local, ST=Local, C=US"

Write-Host "Creating release keystore at $keystore ..."
& $keytool.Source -genkeypair -v `
    -keystore $keystore `
    -alias $alias `
    -keyalg RSA -keysize 2048 -validity 10000 `
    -storepass $storePass -keypass $keyPass `
    -dname $dname

$propsContent = @"
storeFile=rollo-release.jks
storePassword=$storePass
keyAlias=$alias
keyPassword=$keyPass
"@
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($props, $propsContent.TrimEnd(), $utf8NoBom)

Write-Host ""
Write-Host "Done. Created:"
Write-Host "  $keystore"
Write-Host "  $props"
Write-Host ""
Write-Host "IMPORTANT: Back up both files. Use the same keystore for all future releases."
Write-Host "Build a signed release APK with:"
Write-Host "  cd android"
Write-Host "  .\gradlew.bat assembleRelease"
