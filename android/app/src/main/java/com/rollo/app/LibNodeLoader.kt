package com.rollo.app

import android.content.Context
import android.os.Build
import android.util.Log
import java.io.File

object LibNodeLoader {
    private const val TAG = "LibNodeLoader"
    private var loaded = false
    private var lastError: String? = null

    fun isLoaded(): Boolean = loaded
    fun getLastError(): String? = lastError

    fun load(context: Context): Boolean {
        if (loaded) return true
        lastError = null

        if (!loadCppShared(context)) return false

        try {
            System.loadLibrary("rollo-node")
            Log.i(TAG, "Loaded rollo-node JNI bridge")
        } catch (err: UnsatisfiedLinkError) {
            lastError = err.message ?: "rollo-node JNI bridge not loaded"
            Log.e(TAG, "loadLibrary(rollo-node) failed", err)
            return false
        }

        try {
            System.loadLibrary("node")
            loaded = true
            Log.i(TAG, "Loaded libnode via loadLibrary")
            return true
        } catch (err: UnsatisfiedLinkError) {
            Log.w(TAG, "loadLibrary(node) failed, trying assets fallback", err)
        }

        val abi = pickAbi()
        val libDir = File(context.filesDir, "libnode/$abi")
        val nodeDest = File(libDir, "libnode.so")
        if (!nodeDest.exists()) {
            val copied = copyFromAssets(context, "libnode/$abi/libnode.so", nodeDest)
            if (!copied) {
                lastError =
                    "libnode.so missing from APK. On PC run: cd android && powershell -File setup-libnode.ps1 then rebuild APK."
                return false
            }
        }

        return try {
            System.load(nodeDest.absolutePath)
            loaded = true
            Log.i(TAG, "Loaded libnode from ${nodeDest.absolutePath}")
            true
        } catch (err: UnsatisfiedLinkError) {
            lastError = err.message ?: "System.load failed for libnode.so"
            Log.e(TAG, "System.load failed", err)
            false
        }
    }

    /** libnode.so is linked against libc++_shared.so; load it before libnode. */
    private fun loadCppShared(context: Context): Boolean {
        try {
            System.loadLibrary("c++_shared")
            Log.i(TAG, "Loaded libc++_shared via loadLibrary")
            return true
        } catch (err: UnsatisfiedLinkError) {
            Log.w(TAG, "loadLibrary(c++_shared) failed, trying assets fallback", err)
        }

        val abi = pickAbi()
        val dest = File(context.filesDir, "libnode/$abi/libc++_shared.so")
        if (!dest.exists()) {
            val copied = copyFromAssets(context, "libnode/$abi/libc++_shared.so", dest)
            if (!copied) {
                lastError =
                    "libc++_shared.so missing from APK. Rebuild APK in Android Studio (NDK required) or run setup-libnode.ps1."
                return false
            }
        }

        return try {
            System.load(dest.absolutePath)
            Log.i(TAG, "Loaded libc++_shared from ${dest.absolutePath}")
            true
        } catch (err: UnsatisfiedLinkError) {
            lastError = err.message ?: "System.load failed for libc++_shared.so"
            Log.e(TAG, "System.load(c++_shared) failed", err)
            false
        }
    }

    private fun pickAbi(): String {
        val preferred = listOf("arm64-v8a", "armeabi-v7a", "x86_64")
        val supported = Build.SUPPORTED_ABIS?.toList() ?: emptyList()
        for (abi in preferred) {
            if (supported.contains(abi)) return abi
        }
        return preferred.first()
    }

    private fun copyFromAssets(context: Context, assetPath: String, dest: File): Boolean {
        return try {
            context.assets.open(assetPath).use { input ->
                dest.parentFile?.mkdirs()
                dest.outputStream().use { output -> input.copyTo(output) }
            }
            true
        } catch (err: Exception) {
            Log.e(TAG, "Asset missing: $assetPath", err)
            false
        }
    }
}
