package com.rollo.app

import android.util.Log
import java.io.File

object NodeRunner {
    private const val TAG = "RolloNode"
    @Volatile
    private var running = false

    fun isRunning(): Boolean = running

    fun start(nodeProjectDir: File) {
        if (running) return
        Thread {
            try {
                System.loadLibrary("node")
                val mainJs = File(nodeProjectDir, "main.js").absolutePath
                Log.i(TAG, "Starting Node at $mainJs")
                running = true
                val code = startNodeWithArguments(arrayOf("node", mainJs))
                Log.w(TAG, "Node exited with code $code")
            } catch (err: Throwable) {
                Log.e(TAG, "Node failed", err)
            } finally {
                running = false
            }
        }.start()
    }

    private external fun startNodeWithArguments(arguments: Array<String>): Int
}
