package com.rollo.app

import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.storage.StorageManager
import android.provider.DocumentsContract
import java.io.File
object StoragePathHelper {
    fun treeUriToPath(context: Context, treeUri: Uri): String? {
        val docId = DocumentsContract.getTreeDocumentId(treeUri)
        val parts = docId.split(":", limit = 2)
        if (parts.size < 2) return null

        val volumeId = parts[0]
        val relativePath = parts[1]

        if (volumeId == "primary") {
            return File(Environment.getExternalStorageDirectory(), relativePath).absolutePath
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            val storageManager = context.getSystemService(Context.STORAGE_SERVICE) as StorageManager
            for (volume in storageManager.storageVolumes) {
                val uuid = volume.uuid
                if (uuid != null && uuid.equals(volumeId, ignoreCase = true)) {
                    val root = volume.directory ?: continue
                    return File(root, relativePath).absolutePath
                }
            }
        }

        return try {
            File("/storage/$volumeId/$relativePath").absolutePath
        } catch (_: Exception) {
            null
        }
    }
}
