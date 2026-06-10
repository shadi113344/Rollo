package com.rollo.app

import android.util.Log
import java.io.File
import java.util.concurrent.atomic.AtomicReference

object NodeRunner {
    private const val TAG = "RolloNode"

    enum class State { IDLE, STARTING, RUNNING, FAILED }

    private val state = AtomicReference(State.IDLE)
    private val lastError = AtomicReference<String?>(null)

    fun getState(): State = state.get()
    fun getLastError(): String? = lastError.get()

    fun isRunning(): Boolean = state.get() == State.RUNNING

    fun start(nodeProjectDir: File) {
        if (state.get() == State.STARTING || state.get() == State.RUNNING) return

        if (!LibNodeLoader.isLoaded() && !LibNodeLoader.load(RolloApplication.instance)) {
            fail(LibNodeLoader.getLastError() ?: "libnode.so not loaded")
            return
        }

        val mainJs = File(nodeProjectDir, "main.js")
        if (!mainJs.exists()) {
            fail("main.js not found at ${mainJs.absolutePath}")
            return
        }

        state.set(State.STARTING)
        lastError.set(null)

        Thread {
            try {
                Log.i(TAG, "Starting Node at ${mainJs.absolutePath}")
                state.set(State.RUNNING)
                val code = startNodeWithArguments(arrayOf("node", mainJs.absolutePath))
                Log.w(TAG, "Node exited with code $code")
                if (code != 0) {
                    fail("Node exited with code $code")
                } else {
                    state.set(State.IDLE)
                }
            } catch (err: Throwable) {
                Log.e(TAG, "Node failed", err)
                fail(err.message ?: err.toString())
            }
        }.start()
    }

    private fun fail(message: String) {
        lastError.set(message)
        state.set(State.FAILED)
    }

    @JvmStatic
    private external fun startNodeWithArguments(arguments: Array<String>): Int
}
