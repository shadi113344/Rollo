package com.rollo.app

import android.app.Application
import android.util.Log

class RolloApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        instance = this
        try {
            System.loadLibrary("node")
            libNodeLoaded = true
        } catch (err: UnsatisfiedLinkError) {
            Log.e(TAG, "Failed to load libnode.so — run setup-libnode.ps1 before building", err)
            libNodeLoaded = false
        }
    }

    companion object {
        private const val TAG = "RolloApp"
        lateinit var instance: RolloApplication
            private set
        var libNodeLoaded: Boolean = false
            private set
    }
}
