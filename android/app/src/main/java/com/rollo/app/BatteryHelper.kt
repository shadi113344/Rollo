package com.rollo.app

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings

object BatteryHelper {
    fun isExempt(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true
        val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        return pm.isIgnoringBatteryOptimizations(context.packageName)
    }

    fun requestExemption(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
        if (isExempt(context)) return

        val direct = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
            data = Uri.parse("package:${context.packageName}")
        }
        if (direct.resolveActivity(context.packageManager) != null) {
            context.startActivity(direct.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            return
        }

        val list = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
        if (list.resolveActivity(context.packageManager) != null) {
            context.startActivity(list.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            return
        }

        val appDetails = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
            data = Uri.parse("package:${context.packageName}")
        }
        context.startActivity(appDetails.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}
