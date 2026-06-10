package com.rollo.app

import android.content.Context
import android.net.Uri
import android.os.Environment
import org.json.JSONObject
import java.io.File
import java.security.SecureRandom

object RolloConfig {
    const val DEFAULT_PORT = 3847
    const val GITHUB_REPO = "shadi113344/Rollo"
    private const val PREFS = "rollo_prefs"
    private const val KEY_SECRET = "video_secret"
    private const val KEY_PORT = "port"
    private const val KEY_VIDEOS_DIR = "videos_dir"
    private const val KEY_VIDEOS_TREE_URI = "videos_tree_uri"

    fun defaultVideosDir(): File =
        File(Environment.getExternalStorageDirectory(), "Rollo/Videos")

    fun videosDir(context: Context): File {
        val custom = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_VIDEOS_DIR, null)
        return if (!custom.isNullOrBlank()) File(custom) else defaultVideosDir()
    }

    fun getVideosTreeUri(context: Context): Uri? {
        val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_VIDEOS_TREE_URI, null)
        return raw?.let { Uri.parse(it) }
    }

    fun setVideosDir(context: Context, dir: File, treeUri: Uri? = null) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_VIDEOS_DIR, dir.absolutePath)
            .putString(KEY_VIDEOS_TREE_URI, treeUri?.toString())
            .apply()
    }

    fun clearCustomVideosDir(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .remove(KEY_VIDEOS_DIR)
            .remove(KEY_VIDEOS_TREE_URI)
            .apply()
    }

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
        videosDir(context).mkdirs()
        dataDir(context).mkdirs()

        val cfg = JSONObject()
        cfg.put("PORT", getPort(context))
        cfg.put("VIDEO_SECRET", getOrCreateSecret(context))
        cfg.put("VIDEOS_DIR", videosDir(context).absolutePath)
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
