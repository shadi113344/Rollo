package com.rollo.app

import android.content.Context
import android.util.Log
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLRequest
import org.json.JSONArray
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
            val probesDir = File(bridgeDir, "probes")
            requestsDir.mkdirs()
            jobsDir.mkdirs()
            probesDir.mkdirs()

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
                        ?.forEach { reqFile ->
                            val type = runCatching {
                                JSONObject(reqFile.readText()).optString("type", "download")
                            }.getOrDefault("download")
                            when (type) {
                                "probe" -> processProbe(reqFile, probesDir, app)
                                else -> processRequest(reqFile, jobsDir, app)
                            }
                        }
                } catch (err: Throwable) {
                    Log.e(TAG, "worker loop error", err)
                }
                Thread.sleep(400)
            }
        }, "RolloYtdlpWorker").start()
    }

    private fun processProbe(reqFile: File, probesDir: File, context: Context) {
        val probeId = reqFile.name.removePrefix("request-").removeSuffix(".json")
        val responseFile = File(probesDir, "response-$probeId.json")
        try {
            val req = JSONObject(reqFile.readText())
            val url = req.getString("url")
            val cookiesPath = req.optString("cookiesFile", "")
            if (cookiesPath.isNotBlank()) XCookies.repairCookiesFile(context)

            val request = YoutubeDLRequest(url)
            request.addOption("--no-playlist")
            request.addOption("-J")
            if (cookiesPath.isNotBlank()) {
                val cookies = File(cookiesPath)
                if (cookies.isFile) request.addOption("--cookies", cookies.absolutePath)
            }

            val response = YoutubeDL.getInstance().execute(request)
            val json = JSONObject()
            json.put("ok", true)
            json.put("stdout", response.out ?: "")
            responseFile.writeText(json.toString())
        } catch (err: Throwable) {
            Log.e(TAG, "probe failed for $probeId", err)
            val json = JSONObject()
            json.put("ok", false)
            json.put("error", err.message ?: "Probe failed")
            responseFile.writeText(json.toString())
        } finally {
            reqFile.delete()
        }
    }

    private fun processRequest(reqFile: File, jobsDir: File, context: Context) {
        val jobId = reqFile.name.removePrefix("request-").removeSuffix(".json")
        val jobFile = File(jobsDir, "$jobId.json")
        try {
            val req = JSONObject(reqFile.readText())
            val url = req.getString("url")
            val outputDir = req.getString("outputDir")
            val cookiesPath = req.optString("cookiesFile", "")
            if (cookiesPath.isNotBlank()) XCookies.repairCookiesFile(context)

            File(outputDir).mkdirs()
            val before = mediaNames(outputDir)
            writeJob(jobFile, jobId, "downloading", 0, null, null, null)

            val attempts = req.optJSONArray("attempts")
            var lastError: String? = null
            var succeeded = false

            if (attempts != null && attempts.length() > 0) {
                for (i in 0 until attempts.length()) {
                    val args = attempts.getJSONArray(i)
                    try {
                        val request = buildRequestFromArgs(args, url)
                        if (executeDownload(request, jobFile, jobId)) {
                            succeeded = true
                            break
                        }
                    } catch (err: Throwable) {
                        lastError = err.message ?: "Download failed"
                        Log.w(TAG, "attempt ${i + 1} failed for $jobId", err)
                    }
                }
            } else {
                val quality = req.optString("quality", "best")
                val request = YoutubeDLRequest(url)
                request.addOption("-o", File(outputDir, "%(title).200B [%(id)s].%(ext)s").absolutePath)
                request.addOption("--no-playlist")
                request.addOption("--newline")
                request.addOption("-f", formatSelector(quality, url))
                if (cookiesPath.isNotBlank()) {
                    val cookies = File(cookiesPath)
                    if (cookies.isFile) request.addOption("--cookies", cookies.absolutePath)
                }
                try {
                    succeeded = executeDownload(request, jobFile, jobId)
                } catch (err: Throwable) {
                    lastError = err.message ?: "Download failed"
                }
            }

            if (succeeded) {
                val filename = findNewFile(outputDir, before)
                writeJob(jobFile, jobId, "completed", 100, null, filename, null)
            } else {
                writeJob(jobFile, jobId, "failed", 0, null, null, lastError ?: "Download failed")
            }
        } catch (err: Throwable) {
            Log.e(TAG, "download failed for $jobId", err)
            writeJob(jobFile, jobId, "failed", 0, null, null, err.message ?: "Download failed")
        } finally {
            reqFile.delete()
        }
    }

    private fun executeDownload(request: YoutubeDLRequest, jobFile: File, jobId: String): Boolean {
        var lastPct = -1
        YoutubeDL.getInstance().execute(request) { progress, _, _ ->
            val pct = progress.toInt().coerceIn(0, 99)
            if (pct != lastPct) {
                lastPct = pct
                writeJob(jobFile, jobId, "downloading", pct, null, null, null)
            }
        }
        return true
    }

    private fun buildRequestFromArgs(args: JSONArray, defaultUrl: String): YoutubeDLRequest {
        val tokens = mutableListOf<String>()
        var url = defaultUrl
        for (i in 0 until args.length()) {
            val token = args.getString(i)
            if (token.startsWith("http://") || token.startsWith("https://")) {
                url = token
            } else {
                tokens.add(token)
            }
        }
        val request = YoutubeDLRequest(url)
        var idx = 0
        while (idx < tokens.size) {
            val key = tokens[idx]
            if (key.startsWith("-") && idx + 1 < tokens.size && !tokens[idx + 1].startsWith("-")) {
                request.addOption(key, tokens[idx + 1])
                idx += 2
            } else {
                request.addOption(key)
                idx += 1
            }
        }
        return request
    }

    private fun formatSelector(quality: String, url: String): String {
        if (quality.startsWith("format:")) return quality.removePrefix("format:")
        if (isTwitterUrl(url)) return "bv*+ba/b"
        val maxH = when (quality) {
            "fast" -> 720
            "hd" -> 1080
            else -> 2160
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
