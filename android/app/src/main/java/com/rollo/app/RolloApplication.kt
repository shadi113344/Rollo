package com.rollo.app

import android.app.Application
import android.util.Log

class RolloApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        instance = this
        libNodeLoaded = LibNodeLoader.load(this)
        if (!libNodeLoaded) {
            Log.e(TAG, "libnode not loaded: ${LibNodeLoader.getLastError()}")
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
