package com.rollo.app

import android.content.Context
import android.util.Log
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.zip.ZipInputStream

object UpdateManager {
    private const val TAG = "RolloUpdate"

    fun updateFromGitHub(context: Context, onDone: (Boolean, String) -> Unit) {
        Thread {
            try {
                val zipUrl = URL("https://github.com/${RolloConfig.GITHUB_REPO}/archive/refs/heads/main.zip")
                val connection = zipUrl.openConnection() as HttpURLConnection
                connection.connectTimeout = 20000
                connection.readTimeout = 60000
                connection.instanceFollowRedirects = true

                if (connection.responseCode !in 200..299) {
                    onDone(false, "Download failed (${connection.responseCode})")
                    return@Thread
                }

                val nodeDir = RolloConfig.nodeProjectDir(context)
                val tempZip = File(context.cacheDir, "rollo-update.zip")
                connection.inputStream.use { input ->
                    tempZip.outputStream().use { output -> input.copyTo(output) }
                }

                val tempRoot = File(context.cacheDir, "rollo-update")
                tempRoot.deleteRecursively()
                tempRoot.mkdirs()
                unzip(tempZip, tempRoot)
                tempZip.delete()

                val extracted = tempRoot.listFiles()?.firstOrNull { it.isDirectory }
                    ?: throw IllegalStateException("Unexpected zip layout")

                copyIfExists(extracted, nodeDir, "server.js")
                copyTreeIfExists(extracted, nodeDir, "lib")
                copyTreeIfExists(extracted, nodeDir, "public")

                RolloConfig.writeNodeConfig(context)
                tempRoot.deleteRecursively()
                onDone(true, "Updated from GitHub. Restart the app to reload.")
            } catch (err: Throwable) {
                Log.e(TAG, "Update failed", err)
                onDone(false, err.message ?: "Update failed")
            }
        }.start()
    }

    private fun copyIfExists(srcRoot: File, destRoot: File, name: String) {
        val src = File(srcRoot, name)
        if (!src.exists()) return
        src.copyTo(File(destRoot, name), overwrite = true)
    }

    private fun copyTreeIfExists(srcRoot: File, destRoot: File, name: String) {
        val src = File(srcRoot, name)
        if (!src.exists()) return
        val dest = File(destRoot, name)
        dest.deleteRecursively()
        src.copyRecursively(dest, overwrite = true)
    }

    private fun unzip(zipFile: File, destDir: File) {
        ZipInputStream(zipFile.inputStream()).use { zis ->
            var entry = zis.nextEntry
            while (entry != null) {
                val outFile = File(destDir, entry.name)
                if (entry.isDirectory) {
                    outFile.mkdirs()
                } else {
                    outFile.parentFile?.mkdirs()
                    outFile.outputStream().use { zis.copyTo(it) }
                }
                zis.closeEntry()
                entry = zis.nextEntry
            }
        }
    }
}
