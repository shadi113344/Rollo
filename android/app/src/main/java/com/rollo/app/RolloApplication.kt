package com.rollo.app

import android.app.Application

class RolloApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        instance = this
    }

    companion object {
        lateinit var instance: RolloApplication
            private set
    }
}
