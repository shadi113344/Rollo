import java.net.URI
import java.util.zip.ZipInputStream

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.rollo.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.rollo.app"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"

        ndk {
            abiFilters += listOf("arm64-v8a", "armeabi-v7a", "x86_64")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    packaging {
        jniLibs {
            useLegacyPackaging = true
        }
    }
}

// No instrumented tests in this project — skip androidTest tasks on APK builds.
tasks.matching { it.name.contains("AndroidTest", ignoreCase = true) }.configureEach {
    enabled = false
}

// Download nodejs-mobile native libs if missing (required for Node server).
tasks.register("ensureLibnode") {
    val jniRoot = layout.projectDirectory.dir("src/main/jniLibs")
    val arm64Lib = jniRoot.file("arm64-v8a/libnode.so")

    outputs.file(arm64Lib)

    doLast {
        if (arm64Lib.asFile.exists()) {
            logger.lifecycle("libnode.so already installed")
            return@doLast
        }

        val version = "18.20.4"
        val zipName = "nodejs-mobile-v$version-android.zip"
        val zipUrl =
            "https://github.com/nodejs-mobile/nodejs-mobile/releases/download/v$version/$zipName"
        val zipFile = layout.buildDirectory.file("nodejs-mobile/$zipName").get().asFile

        logger.lifecycle("Downloading nodejs-mobile v$version …")
        zipFile.parentFile.mkdirs()
        URI(zipUrl).toURL().openStream().use { input ->
            zipFile.outputStream().use { output -> input.copyTo(output) }
        }

        val abis = listOf("arm64-v8a", "armeabi-v7a", "x86_64")
        ZipInputStream(zipFile.inputStream()).use { zis ->
            var entry = zis.nextEntry
            while (entry != null) {
                val name = entry.name.replace('\\', '/')
                for (abi in abis) {
                    val needle = "bin/$abi/libnode.so"
                    if (name.endsWith(needle)) {
                        val out = jniRoot.file("$abi/libnode.so").asFile
                        out.parentFile.mkdirs()
                        out.outputStream().use { zis.copyTo(it) }
                        logger.lifecycle("Installed libnode.so for $abi")
                    }
                }
                zis.closeEntry()
                entry = zis.nextEntry
            }
        }

        if (!arm64Lib.asFile.exists()) {
            throw GradleException(
                "Failed to install libnode.so. Run: powershell -File android/setup-libnode.ps1"
            )
        }
    }
}

tasks.named("preBuild").configure {
    dependsOn("ensureLibnode")
}

dependencies {
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("com.google.android.material:material:1.11.0")
    implementation("androidx.constraintlayout:constraintlayout:2.1.4")
    implementation("androidx.webkit:webkit:1.10.0")
}
