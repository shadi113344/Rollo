package com.rollo.app

import android.content.Context
import android.os.Environment
import org.json.JSONObject
import java.io.File
import java.security.SecureRandom
import java.util.UUID

object RolloConfig {
    const val DEFAULT_PORT = 3847
    const val GITHUB_REPO = "shadi113344/Rollo"
    private const val PREFS = "rollo_prefs"
    private const val KEY_SECRET = "video_secret"
    private const val KEY_PORT = "port"

    fun videosDir(): File = File(Environment.getExternalStorageDirectory(), "Rollo/Videos")

    fun dataDir(context: Context): File = File(context.filesDir, "data")

    fun nodeProjectDir(context: Context): File = File(context.filesDir, "nodejs-project")

    fun getPort(context: Context): Int {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        return prefs.getInt(KEY_PORT, DEFAULT_PORT)
    }

    fun getOrCreateSecret(context: Context): String {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        prefs.getString(KEY_SECRET, null)?.let { return it }
        val secret = generateSecret()
        prefs.edit().putString(KEY_SECRET, secret).apply()
        return secret
    }

    fun writeNodeConfig(context: Context) {
        val nodeDir = nodeProjectDir(context)
        nodeDir.mkdirs()
        videosDir().mkdirs()
        dataDir(context).mkdirs()

        val cfg = JSONObject()
        cfg.put("PORT", getPort(context))
        cfg.put("VIDEO_SECRET", getOrCreateSecret(context))
        cfg.put("VIDEOS_DIR", videosDir().absolutePath)
        cfg.put("DATA_DIR", dataDir(context).absolutePath)
        cfg.put("ROLLO_CONFIG", File(nodeDir, "rollo-config.json").absolutePath)

        File(nodeDir, "rollo-config.json").writeText(cfg.toString(2))
    }

    fun serverUrl(context: Context): String = "http://127.0.0.1:${getPort(context)}/"

    private fun generateSecret(): String {
        val bytes = ByteArray(32)
        SecureRandom().nextBytes(bytes)
        return bytes.joinToString("") { "%02x".format(it) }
    }
}
