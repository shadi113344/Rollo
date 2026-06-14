package com.rollo.app

import android.content.Context
import android.media.MediaScannerConnection
import java.io.File

/**
 * Hide or show Rollo media in Samsung Gallery / Google Photos.
 *
 * Uses only a [.nomedia] marker file — never deletes media from disk.
 * (Older builds incorrectly called MediaStore.delete, which removed real files.)
 */
object GalleryVisibility {
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
        val nomedia = File(dir, NOMEDIA)
        if (visible) {
            if (nomedia.exists()) nomedia.delete()
            scanFolder(context, dir)
        } else {
            if (!nomedia.exists()) nomedia.writeText("")
        }
    }

    private fun scanFolder(context: Context, dir: File) {
        val paths = mutableListOf<String>()
        collectMediaPaths(dir, paths)
        if (paths.isEmpty()) return
        MediaScannerConnection.scanFile(
            context,
            paths.toTypedArray(),
            null,
            null
        )
    }

    private fun collectMediaPaths(dir: File, out: MutableList<String>) {
        val entries = dir.listFiles() ?: return
        for (entry in entries) {
            if (entry.isDirectory) {
                if (entry.name == NOMEDIA || entry.name == "_rollo") continue
                collectMediaPaths(entry, out)
            } else if (entry.extension.lowercase() in mediaExtensions) {
                out.add(entry.absolutePath)
            }
        }
    }
}
