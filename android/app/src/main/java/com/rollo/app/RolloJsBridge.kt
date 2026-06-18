package com.rollo.app

import android.webkit.JavascriptInterface

class RolloJsBridge(private val activity: MainActivity) {
    @JavascriptInterface
    fun isXConnected(): Boolean = XCookies.isConnected(activity)

    @JavascriptInterface
    fun readClipboard(): String {
        return activity.readClipboardText()
    }

    @JavascriptInterface
    fun connectX() {
        activity.runOnUiThread { activity.launchXLogin() }
    }

    @JavascriptInterface
    fun disconnectX() {
        activity.runOnUiThread {
            XCookies.clear(activity)
            activity.onXAuthChanged()
        }
    }
}
