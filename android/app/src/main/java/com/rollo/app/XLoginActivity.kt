package com.rollo.app

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.appbar.MaterialToolbar
import com.google.android.material.button.MaterialButton

class XLoginActivity : AppCompatActivity() {
    private lateinit var webView: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_x_login)

        val toolbar = findViewById<MaterialToolbar>(R.id.xLoginToolbar)
        val doneButton = findViewById<MaterialButton>(R.id.xLoginDone)
        webView = findViewById(R.id.xLoginWebView)

        toolbar.setNavigationOnClickListener { finish() }

        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(webView, true)
        }

        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean = false
        }

        doneButton.setOnClickListener { saveAndClose() }
        webView.loadUrl("https://x.com/i/flow/login")
    }

    private fun saveAndClose() {
        val ok = XCookies.saveFromCookieManager(this)
        if (ok) {
            setResult(RESULT_OK)
            Toast.makeText(this, R.string.x_login_saved, Toast.LENGTH_SHORT).show()
            finish()
        } else {
            Toast.makeText(this, R.string.x_login_not_ready, Toast.LENGTH_LONG).show()
        }
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }
}
