package com.rollo.app

import android.content.Context
import java.io.File
import java.io.FileOutputStream

object AssetInstaller {
    fun installIfNeeded(context: Context, force: Boolean = false) {
        val dest = RolloConfig.nodeProjectDir(context)
        val marker = File(dest, ".installed-version")
        val versionCode = context.packageManager.getPackageInfo(context.packageName, 0).longVersionCode

        if (!force && marker.exists() && marker.readText() == versionCode.toString() && File(dest, "main.js").exists()) {
            RolloConfig.writeNodeConfig(context)
            return
        }

        if (dest.exists()) {
            dest.deleteRecursively()
        }
        dest.mkdirs()
        copyAssetFolder(context, "nodejs-project", dest.absolutePath)
        marker.writeText(versionCode.toString())
        RolloConfig.writeNodeConfig(context)
    }

    private fun copyAssetFolder(context: Context, assetPath: String, destPath: String) {
        val assets = context.assets.list(assetPath) ?: return
        val destDir = File(destPath)
        destDir.mkdirs()
        for (name in assets) {
            val childAsset = if (assetPath.isEmpty()) name else "$assetPath/$name"
            val destChild = File(destDir, name)
            val nested = context.assets.list(childAsset)
            if (nested.isNullOrEmpty()) {
                context.assets.open(childAsset).use { input ->
                    FileOutputStream(destChild).use { output ->
                        input.copyTo(output)
                    }
                }
            } else {
                copyAssetFolder(context, childAsset, destChild.absolutePath)
            }
        }
    }
}
