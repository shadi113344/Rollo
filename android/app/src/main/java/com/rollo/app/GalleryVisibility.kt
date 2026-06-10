package com.rollo.app

import android.content.Context
import android.media.MediaScannerConnection
import android.os.Build
import android.provider.MediaStore
import java.io.File

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
            nomedia.writeText("")
            removeFromMediaStore(context, dir)
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
                if (entry.name == NOMEDIA) continue
                collectMediaPaths(entry, out)
            } else if (entry.extension.lowercase() in mediaExtensions) {
                out.add(entry.absolutePath)
            }
        }
    }

    private fun removeFromMediaStore(context: Context, dir: File) {
        val resolver = context.contentResolver
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val relative = "Rollo/Videos%"
            val videoUri = MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL)
            val imageUri = MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL)
            resolver.delete(
                videoUri,
                "${MediaStore.MediaColumns.RELATIVE_PATH} LIKE ?",
                arrayOf(relative)
            )
            resolver.delete(
                imageUri,
                "${MediaStore.MediaColumns.RELATIVE_PATH} LIKE ?",
                arrayOf(relative)
            )
        } else {
            @Suppress("DEPRECATION")
            resolver.delete(
                MediaStore.Files.getContentUri("external"),
                "${MediaStore.MediaColumns.DATA} LIKE ?",
                arrayOf("${dir.absolutePath}%")
            )
        }
    }
}
