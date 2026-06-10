package com.rollo.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.Settings
import android.view.View
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.isVisible
import java.net.HttpURLConnection
import java.net.URL

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var statusText: TextView
    private lateinit var updateButton: Button

    private val notificationPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { startServerFlow() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        statusText = findViewById(R.id.statusText)
        updateButton = findViewById(R.id.updateButton)

        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.mediaPlaybackRequiresUserGesture = false
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url.toString()
                if (url.startsWith("http://127.0.0.1") || url.startsWith("http://localhost")) {
                    return false
                }
                return false
            }
        }

        updateButton.setOnClickListener {
            updateButton.isEnabled = false
            statusText.isVisible = true
            statusText.text = getString(R.string.updating)
            UpdateManager.updateFromGitHub(this) { ok, message ->
                runOnUiThread {
                    updateButton.isEnabled = true
                    Toast.makeText(this, message, Toast.LENGTH_LONG).show()
                    if (ok) recreate()
                }
            }
        }

        requestPermissionsAndStart()
    }

    private fun requestPermissionsAndStart() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED
            ) {
                notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
                return
            }
        }
        startServerFlow()
    }

    private fun startServerFlow() {
        if (!hasStorageAccess()) {
            showStorageDialog()
            return
        }
        RolloConfig.videosDir().mkdirs()
        RolloService.start(this)
        waitForServer()
    }

    private fun hasStorageAccess(): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            return Environment.isExternalStorageManager()
        }
        val read = ContextCompat.checkSelfPermission(this, Manifest.permission.READ_EXTERNAL_STORAGE)
        val write = ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE)
        return read == PackageManager.PERMISSION_GRANTED && write == PackageManager.PERMISSION_GRANTED
    }

    private fun showStorageDialog() {
        AlertDialog.Builder(this)
            .setMessage(R.string.grant_storage)
            .setPositiveButton(R.string.open_settings) { _, _ ->
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    val intent = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION).apply {
                        data = Uri.parse("package:$packageName")
                    }
                    startActivity(intent)
                } else {
                    storagePermission.launch(
                        arrayOf(
                            Manifest.permission.READ_EXTERNAL_STORAGE,
                            Manifest.permission.WRITE_EXTERNAL_STORAGE
                        )
                    )
                }
            }
            .setCancelable(false)
            .show()
    }

    private val storagePermission = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { startServerFlow() }

    private fun waitForServer() {
        statusText.isVisible = true
        statusText.text = getString(R.string.server_starting)
        webView.isVisible = false

        Thread {
            val url = RolloConfig.serverUrl(this)
            val ready = (0 until 60).any {
                if (ping(url)) return@any true
                Thread.sleep(500)
                false
            }
            runOnUiThread {
                if (ready) {
                    statusText.isVisible = false
                    webView.isVisible = true
                    webView.loadUrl(url)
                } else {
                    statusText.text = getString(R.string.server_unavailable)
                }
            }
        }.start()
    }

    private fun ping(url: String): Boolean {
        return try {
            val connection = URL(url).openConnection() as HttpURLConnection
            connection.connectTimeout = 1000
            connection.readTimeout = 1000
            connection.requestMethod = "GET"
            connection.connect()
            connection.responseCode in 200..499
        } catch (_: Exception) {
            false
        }
    }

    override fun onResume() {
        super.onResume()
        if (::webView.isInitialized && hasStorageAccess() && !NodeRunner.isRunning()) {
            startServerFlow()
        }
    }
}
