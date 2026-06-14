package com.rollo.app

import android.content.ContentValues
import android.content.Context
import android.media.MediaScannerConnection
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Log
import org.json.JSONObject
import java.io.File

/**
 * Per-library control for showing Rollo media in Samsung Gallery / Google Photos.
 *
 * Never deletes files. Each profile folder can be shown or hidden independently.
 */
object GalleryVisibility {
    private const val TAG = "RolloGallery"
    private const val PREFS = "rollo_prefs"
    private const val KEY_GALLERY_VISIBLE = "gallery_visible"
    private const val KEY_LIBRARY_VISIBILITY = "gallery_library_visibility"
    private const val NOMEDIA = ".nomedia"

    private val mediaExtensions = setOf(
        "jpg", "jpeg", "png", "gif", "webp", "bmp", "heic", "heif",
        "mp4", "mov", "webm", "m4v", "mkv", "avi", "3gp"
    )

    fun listLibraryFolders(context: Context): List<String> {
        val root = RolloConfig.videosDir(context)
        return root.listFiles()
            ?.filter { it.isDirectory && isLibraryFolder(it) }
            ?.map { it.name }
            ?.sortedBy { it.lowercase() }
            ?: emptyList()
    }

    fun isLibraryVisibleInGallery(context: Context, libraryId: String): Boolean {
        migrateGlobalPreferenceIfNeeded(context)
        return readVisibilityMap(context).optBoolean(libraryId, false)
    }

    fun setLibraryVisibleInGallery(context: Context, libraryId: String, visible: Boolean) {
        migrateGlobalPreferenceIfNeeded(context)
        val map = readVisibilityMap(context)
        map.put(libraryId, visible)
        saveVisibilityMap(context, map)
        applyLibrary(context, File(RolloConfig.videosDir(context), libraryId), visible)
    }

    fun applySavedPreference(context: Context) {
        applyAllSavedPreferences(context)
    }

    fun applyAllSavedPreferences(context: Context) {
        migrateGlobalPreferenceIfNeeded(context)
        val root = RolloConfig.videosDir(context)
        root.mkdirs()
        File(root, NOMEDIA).delete()
        for (libraryId in listLibraryFolders(context)) {
            val visible = isLibraryVisibleInGallery(context, libraryId)
            applyLibrary(context, File(root, libraryId), visible)
        }
    }

    private fun migrateGlobalPreferenceIfNeeded(context: Context) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (!prefs.contains(KEY_GALLERY_VISIBLE)) return
        if (prefs.contains(KEY_LIBRARY_VISIBILITY)) {
            prefs.edit().remove(KEY_GALLERY_VISIBLE).apply()
            return
        }
        val global = prefs.getBoolean(KEY_GALLERY_VISIBLE, false)
        val map = JSONObject()
        for (libraryId in listLibraryFolders(context)) {
            map.put(libraryId, global)
        }
        saveVisibilityMap(context, map)
        prefs.edit().remove(KEY_GALLERY_VISIBLE).apply()
    }

    private fun readVisibilityMap(context: Context): JSONObject {
        val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_LIBRARY_VISIBILITY, null)
        if (raw.isNullOrBlank()) return JSONObject()
        return try {
            JSONObject(raw)
        } catch (_: Exception) {
            JSONObject()
        }
    }

    private fun saveVisibilityMap(context: Context, map: JSONObject) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_LIBRARY_VISIBILITY, map.toString())
            .apply()
    }

    private fun applyLibrary(context: Context, dir: File, visible: Boolean) {
        dir.mkdirs()
        val nomedia = File(dir, NOMEDIA)
        if (visible) {
            if (nomedia.exists()) nomedia.delete()
            setIndexedMediaPending(context, dir, pending = false)
            scanMediaFiles(context, dir)
        } else {
            if (!nomedia.exists()) nomedia.writeText("")
            setIndexedMediaPending(context, dir, pending = true)
            scanNomediaMarker(context, dir)
        }
    }

    private fun isLibraryFolder(dir: File): Boolean {
        return dir.name != NOMEDIA && dir.name != "_rollo" && !dir.name.startsWith(".")
    }

    private fun setIndexedMediaPending(context: Context, root: File, pending: Boolean) {
        val resolver = context.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.IS_PENDING, if (pending) 1 else 0)
        }
        val rootPath = root.absolutePath
        val relativeLike = relativePathLike(root)
        val collections = listOf(
            MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
        )

        var updated = 0
        for (collection in collections) {
            try {
                updated += if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && relativeLike != null) {
                    resolver.update(
                        collection,
                        values,
                        "${MediaStore.MediaColumns.RELATIVE_PATH} LIKE ?",
                        arrayOf(relativeLike)
                    )
                } else {
                    @Suppress("DEPRECATION")
                    resolver.update(
                        collection,
                        values,
                        "${MediaStore.MediaColumns.DATA} LIKE ?",
                        arrayOf("$rootPath%")
                    )
                }
            } catch (err: Exception) {
                Log.w(TAG, "MediaStore pending update failed for $collection", err)
            }
        }

        if (updated == 0) {
            updated = setIndexedMediaPendingPerFile(context, root, pending)
        }
        Log.i(TAG, "IS_PENDING=${if (pending) 1 else 0} updated $updated rows under $rootPath")
    }

    private fun setIndexedMediaPendingPerFile(context: Context, root: File, pending: Boolean): Int {
        val paths = mutableListOf<String>()
        collectMediaPaths(root, paths)
        if (paths.isEmpty()) return 0

        val resolver = context.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.IS_PENDING, if (pending) 1 else 0)
        }
        val collections = listOf(
            MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
        )
        var updated = 0
        for (path in paths) {
            for (collection in collections) {
                try {
                    @Suppress("DEPRECATION")
                    updated += resolver.update(
                        collection,
                        values,
                        "${MediaStore.MediaColumns.DATA} = ?",
                        arrayOf(path)
                    )
                } catch (err: Exception) {
                    Log.w(TAG, "Per-file pending update failed for $path", err)
                }
            }
        }
        return updated
    }

    private fun relativePathLike(root: File): String? {
        val storageRoot = Environment.getExternalStorageDirectory().absolutePath
        val path = root.absolutePath
        if (!path.startsWith(storageRoot)) return null
        val rel = path.removePrefix(storageRoot).trimStart('/')
        return if (rel.isEmpty()) "%" else "$rel/%"
    }

    private fun scanMediaFiles(context: Context, dir: File) {
        val paths = mutableListOf<String>()
        collectMediaPaths(dir, paths)
        if (paths.isEmpty()) return
        MediaScannerConnection.scanFile(context, paths.toTypedArray(), null, null)
    }

    private fun scanNomediaMarker(context: Context, dir: File) {
        val nomedia = File(dir, NOMEDIA)
        val paths = mutableListOf(dir.absolutePath)
        if (nomedia.exists()) paths.add(nomedia.absolutePath)
        MediaScannerConnection.scanFile(context, paths.toTypedArray(), null, null)
    }

    private fun collectMediaPaths(dir: File, out: MutableList<String>) {
        val entries = dir.listFiles() ?: return
        for (entry in entries) {
            if (entry.isDirectory) {
                if (entry.name != NOMEDIA && entry.name != "_rollo" && !entry.name.startsWith(".")) {
                    collectMediaPaths(entry, out)
                }
            } else if (entry.extension.lowercase() in mediaExtensions) {
                out.add(entry.absolutePath)
            }
        }
    }
}
