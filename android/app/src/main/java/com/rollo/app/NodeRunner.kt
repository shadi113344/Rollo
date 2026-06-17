package com.rollo.app

import android.content.Context
import android.os.Environment
import android.util.Log
import java.io.File
import java.util.concurrent.atomic.AtomicReference

object NodeRunner {
    private const val TAG = "RolloNode"
    private const val MAX_RESTART_DELAY_MS = 30_000L

    enum class State { IDLE, STARTING, RUNNING, FAILED }

    private val state = AtomicReference(State.IDLE)
    private val lastError = AtomicReference<String?>(null)
    @Volatile private var restartAttempts = 0
    @Volatile private var projectDir: File? = null
    @Volatile private var watchdogRunning = false

    fun getState(): State = state.get()
    fun getLastError(): String? = lastError.get()

    fun isRunning(): Boolean = state.get() == State.RUNNING

    fun reset() {
        state.set(State.IDLE)
        lastError.set(null)
        restartAttempts = 0
    }

    fun start(nodeProjectDir: File) {
        projectDir = nodeProjectDir
        if (state.get() == State.STARTING || state.get() == State.RUNNING) return
        launchNode(nodeProjectDir)
        ensureWatchdog()
    }

    private fun ensureWatchdog() {
        if (watchdogRunning) return
        watchdogRunning = true
        Thread({
            while (watchdogRunning) {
                try {
                    Thread.sleep(2500)
                } catch (_: InterruptedException) {
                    break
                }
                val dir = projectDir ?: continue
                val current = state.get()
                if (current == State.FAILED || (current == State.IDLE && restartAttempts > 0)) {
                    val delay = minOf(MAX_RESTART_DELAY_MS, 1000L shl minOf(restartAttempts, 5))
                    try {
                        Thread.sleep(delay)
                    } catch (_: InterruptedException) {
                        break
                    }
                    restartAttempts++
                    Log.w(TAG, "Restarting Node (attempt $restartAttempts)")
                    launchNode(dir)
                } else if (current == State.RUNNING) {
                    restartAttempts = 0
                }
            }
        }, "RolloNodeWatchdog").start()
    }

    private fun launchNode(nodeProjectDir: File) {
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

        Thread({
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
        }, "RolloNode").start()
    }

    private fun fail(message: String) {
        lastError.set(message)
        state.set(State.FAILED)
    }

    @JvmStatic
    private external fun startNodeWithArguments(arguments: Array<String>): Int
}
