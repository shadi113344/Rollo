package com.rollo.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.Settings
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
import com.google.android.material.switchmaterial.SwitchMaterial
import java.net.HttpURLConnection
import java.net.URL

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var statusText: TextView
    private lateinit var updateButton: Button
    private lateinit var batteryButton: Button
    private lateinit var gallerySwitch: SwitchMaterial
    private var gallerySwitchListener: ((Boolean) -> Unit)? = null

    private val notificationPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { continueStartup() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        statusText = findViewById(R.id.statusText)
        updateButton = findViewById(R.id.updateButton)
        batteryButton = findViewById(R.id.batteryButton)
        gallerySwitch = findViewById(R.id.gallerySwitch)

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

        setupGallerySwitch()
        setupBatteryButton()

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

    private fun setupGallerySwitch() {
        gallerySwitchListener = { visible ->
            GalleryVisibility.setVisibleInGallery(this, visible)
            Toast.makeText(
                this,
                if (visible) R.string.gallery_visible_toast else R.string.gallery_hidden_toast,
                Toast.LENGTH_SHORT
            ).show()
        }
        gallerySwitch.setOnCheckedChangeListener { _, checked ->
            gallerySwitchListener?.invoke(checked)
        }
    }

    private fun setupBatteryButton() {
        batteryButton.setOnClickListener {
            if (BatteryHelper.isExempt(this)) {
                Toast.makeText(this, R.string.battery_opt_granted, Toast.LENGTH_SHORT).show()
            } else {
                showBatteryDialog()
            }
        }
    }

    private fun refreshToolbarState() {
        gallerySwitch.setOnCheckedChangeListener(null)
        gallerySwitch.isChecked = GalleryVisibility.isVisibleInGallery(this)
        gallerySwitch.setOnCheckedChangeListener { _, checked ->
            gallerySwitchListener?.invoke(checked)
        }
        batteryButton.text = if (BatteryHelper.isExempt(this)) {
            getString(R.string.battery_opt_granted)
        } else {
            getString(R.string.battery_button)
        }
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
        continueStartup()
    }

    private fun continueStartup() {
        if (!hasStorageAccess()) {
            showStorageDialog()
            return
        }
        if (!BatteryHelper.isExempt(this)) {
            showBatteryDialog()
            return
        }
        startServerFlow()
    }

    private fun showBatteryDialog() {
        AlertDialog.Builder(this)
            .setTitle(R.string.battery_opt_title)
            .setMessage(R.string.battery_opt_message)
            .setPositiveButton(R.string.battery_opt_allow) { _, _ ->
                BatteryHelper.requestExemption(this)
            }
            .setNegativeButton(R.string.battery_opt_later) { _, _ ->
                startServerFlow()
            }
            .show()
    }

    private fun startServerFlow() {
        RolloConfig.videosDir().mkdirs()
        GalleryVisibility.applySavedPreference(this)
        refreshToolbarState()
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
    ) { continueStartup() }

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
        if (!::webView.isInitialized) return
        refreshToolbarState()
        if (hasStorageAccess() && !NodeRunner.isRunning()) {
            startServerFlow()
        }
    }
}
