package com.rollo.app

import android.content.ContentValues
import android.content.Context
import android.media.MediaScannerConnection
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Log
import java.io.File

/**
 * Hide or show Rollo media in Samsung Gallery / Google Photos.
 *
 * Never deletes files. Hiding uses recursive [.nomedia] markers plus marking
 * existing MediaStore rows as pending (hidden from gallery apps).
 */
object GalleryVisibility {
    private const val TAG = "RolloGallery"
    private const val PREFS = "rollo_prefs"
    private const val KEY_GALLERY_VISIBLE = "gallery_visible"
    private const val NOMEDIA = ".nomedia"

    private val mediaExtensions = setOf(
        "jpg", "jpeg", "png", "gif", "webp", "bmp", "heic", "heif",
        "mp4", "mov", "webm", "m4v", "mkv", "avi", "3gp"
    )

    fun isVisibleInGallery(context: Context): Boolean {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getBoolean(KEY_GALLERY_VISIBLE, false)
    }

    fun setVisibleInGallery(context: Context, visible: Boolean) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_GALLERY_VISIBLE, visible)
            .apply()
        apply(context, visible)
    }

    fun applySavedPreference(context: Context) {
        apply(context, isVisibleInGallery(context))
    }

    private fun apply(context: Context, visible: Boolean) {
        val dir = RolloConfig.videosDir(context)
        dir.mkdirs()
        if (visible) {
            removeNomediaMarkers(dir)
            setIndexedMediaPending(context, dir, pending = false)
            scanMediaFiles(context, dir)
        } else {
            placeNomediaMarkers(dir)
            setIndexedMediaPending(context, dir, pending = true)
            scanNomediaMarkers(context, dir)
        }
    }

    private fun placeNomediaMarkers(dir: File) {
        val nomedia = File(dir, NOMEDIA)
        if (!nomedia.exists()) nomedia.writeText("")
        dir.listFiles()?.forEach { entry ->
            if (entry.isDirectory && shouldScanDir(entry)) {
                placeNomediaMarkers(entry)
            }
        }
    }

    private fun removeNomediaMarkers(dir: File) {
        val nomedia = File(dir, NOMEDIA)
        if (nomedia.exists()) nomedia.delete()
        dir.listFiles()?.forEach { entry ->
            if (entry.isDirectory && shouldScanDir(entry)) {
                removeNomediaMarkers(entry)
            }
        }
    }

    private fun shouldScanDir(dir: File): Boolean {
        return dir.name != NOMEDIA && dir.name != "_rollo" && !dir.name.startsWith(".")
    }

    /**
     * Mark existing MediaStore index rows hidden/visible without deleting files.
     * IS_PENDING=1 keeps files on disk but hides them from gallery apps.
     */
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

    private fun scanNomediaMarkers(context: Context, dir: File) {
        val paths = mutableListOf(dir.absolutePath)
        collectNomediaPaths(dir, paths)
        MediaScannerConnection.scanFile(context, paths.toTypedArray(), null, null)
    }

    private fun collectNomediaPaths(dir: File, out: MutableList<String>) {
        val nomedia = File(dir, NOMEDIA)
        if (nomedia.exists()) out.add(nomedia.absolutePath)
        dir.listFiles()?.forEach { entry ->
            if (entry.isDirectory && shouldScanDir(entry)) {
                collectNomediaPaths(entry, out)
            }
        }
    }

    private fun collectMediaPaths(dir: File, out: MutableList<String>) {
        val entries = dir.listFiles() ?: return
        for (entry in entries) {
            if (entry.isDirectory) {
                if (shouldScanDir(entry)) collectMediaPaths(entry, out)
            } else if (entry.extension.lowercase() in mediaExtensions) {
                out.add(entry.absolutePath)
            }
        }
    }
}
