package com.rollo.app

import android.content.Context
import android.util.Log
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLRequest
import org.json.JSONObject
import java.io.File

object AndroidDownloadWorker {
    private const val TAG = "RolloYtdlp"

    @Volatile
    private var running = false

    fun start(context: Context) {
        if (running) return
        running = true

        Thread({
            val app = context.applicationContext
            val dataDir = RolloConfig.dataDir(app)
            val bridgeDir = File(dataDir, "android-downloader")
            val requestsDir = File(bridgeDir, "requests")
            val jobsDir = File(bridgeDir, "jobs")
            requestsDir.mkdirs()
            jobsDir.mkdirs()

            File(bridgeDir, "ready").delete()
            File(bridgeDir, "init-error").delete()

            try {
                YoutubeDL.getInstance().init(app)
                File(bridgeDir, "ready").writeText(System.currentTimeMillis().toString())
                Log.i(TAG, "YoutubeDL ready")
            } catch (err: Throwable) {
                Log.e(TAG, "YoutubeDL init failed", err)
                File(bridgeDir, "init-error").writeText(err.message ?: "init failed")
                running = false
                return@Thread
            }

            while (running) {
                try {
                    requestsDir.listFiles()
                        ?.filter { it.isFile && it.name.startsWith("request-") && it.name.endsWith(".json") }
                        ?.forEach { reqFile -> processRequest(reqFile, jobsDir) }
                } catch (err: Throwable) {
                    Log.e(TAG, "worker loop error", err)
                }
                Thread.sleep(400)
            }
        }, "RolloYtdlpWorker").start()
    }

    private fun processRequest(reqFile: File, jobsDir: File) {
        val jobId = reqFile.name.removePrefix("request-").removeSuffix(".json")
        val jobFile = File(jobsDir, "$jobId.json")
        try {
            val req = JSONObject(reqFile.readText())
            val url = req.getString("url")
            val outputDir = req.getString("outputDir")
            val quality = req.optString("quality", "fast")
            val cookiesPath = req.optString("cookiesFile", "")

            File(outputDir).mkdirs()
            val before = mediaNames(outputDir)
            writeJob(jobFile, jobId, "downloading", 0, null, null, null)

            val outTemplate = File(outputDir, "%(title).200B [%(id)s].%(ext)s").absolutePath
            val request = YoutubeDLRequest(url)
            request.addOption("-o", outTemplate)
            request.addOption("--no-playlist")
            request.addOption("--newline")
            request.addOption("-f", formatSelector(quality, url))

            if (cookiesPath.isNotBlank()) {
                val cookies = File(cookiesPath)
                if (cookies.isFile) request.addOption("--cookies", cookies.absolutePath)
            }

            var lastPct = -1
            YoutubeDL.getInstance().execute(request) { progress, _, _ ->
                val pct = progress.toInt().coerceIn(0, 99)
                if (pct != lastPct) {
                    lastPct = pct
                    writeJob(jobFile, jobId, "downloading", pct, null, null, null)
                }
            }

            val filename = findNewFile(outputDir, before)
            writeJob(jobFile, jobId, "completed", 100, null, filename, null)
        } catch (err: Throwable) {
            Log.e(TAG, "download failed for $jobId", err)
            writeJob(jobFile, jobId, "failed", 0, null, null, err.message ?: "Download failed")
        } finally {
            reqFile.delete()
        }
    }

    private fun formatSelector(quality: String, url: String): String {
        if (isTwitterUrl(url)) return "bv*+ba/b"
        val maxH = when (quality) {
            "hd" -> 1080
            "best" -> 2160
            else -> 720
        }
        if (maxH >= 2160) return "b[ext=mp4]/bv*[ext=mp4]+ba[ext=m4a]/bv*+ba/b"
        return listOf(
            "b[ext=mp4][height<=$maxH]",
            "b[height<=$maxH]",
            "bv*[height<=$maxH][ext=mp4]+ba[ext=m4a]",
            "bv*[height<=$maxH]+ba",
            "b",
        ).joinToString("/")
    }

    private fun isTwitterUrl(url: String): Boolean {
        return try {
            val host = java.net.URI(url).host?.lowercase()?.removePrefix("www.") ?: return false
            host == "x.com" || host == "twitter.com" || host == "mobile.twitter.com"
        } catch (_: Exception) {
            false
        }
    }

    private fun mediaNames(dir: String): Set<String> {
        val folder = File(dir)
        if (!folder.isDirectory) return emptySet()
        val re = Regex("""\.(mp4|webm|mov|m4v|mkv|avi|gif|png|jpe?g|webp|heic|heif|bmp|avif)$""", RegexOption.IGNORE_CASE)
        return folder.listFiles()
            ?.filter { it.isFile && re.containsMatchIn(it.name) }
            ?.map { it.name }
            ?.toSet()
            ?: emptySet()
    }

    private fun findNewFile(dir: String, before: Set<String>): String? {
        val folder = File(dir)
        val re = Regex("""\.(mp4|webm|mov|m4v|mkv|avi|gif|png|jpe?g|webp|heic|heif|bmp|avif)$""", RegexOption.IGNORE_CASE)
        val after = folder.listFiles()
            ?.filter { it.isFile && re.containsMatchIn(it.name) }
            ?.sortedByDescending { it.lastModified() }
            ?: return null
        return after.firstOrNull { !before.contains(it.name) }?.name ?: after.firstOrNull()?.name
    }

    private fun writeJob(
        jobFile: File,
        id: String,
        status: String,
        progress: Int,
        title: String?,
        filename: String?,
        error: String?,
    ) {
        val json = JSONObject()
        json.put("id", id)
        json.put("status", status)
        json.put("progress", progress)
        if (!title.isNullOrBlank()) json.put("title", title)
        if (!filename.isNullOrBlank()) json.put("filename", filename)
        if (!error.isNullOrBlank()) json.put("error", error)
        jobFile.writeText(json.toString())
    }
}
