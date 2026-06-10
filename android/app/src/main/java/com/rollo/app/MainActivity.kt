package com.rollo.app

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
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
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.isVisible
import com.google.android.material.button.MaterialButton
import com.google.android.material.floatingactionbutton.FloatingActionButton
import com.google.android.material.switchmaterial.SwitchMaterial
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var settingsPanel: View
    private lateinit var settingsFab: FloatingActionButton
    private lateinit var statusLabel: TextView
    private lateinit var statusDetail: TextView
    private lateinit var accessDesc: TextView
    private lateinit var accessUrls: TextView
    private lateinit var openLibraryButton: MaterialButton
    private lateinit var retryButton: MaterialButton
    private lateinit var updateButton: MaterialButton
    private lateinit var batteryButton: MaterialButton
    private lateinit var gallerySwitch: SwitchMaterial
    private lateinit var shareWhatsAppButton: MaterialButton
    private lateinit var shareCopyButton: MaterialButton

    private var gallerySwitchListener: ((Boolean) -> Unit)? = null
    private var startupInProgress = false
    private var serverReady = false

    private val notificationPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { continueStartup() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        bindViews()
        setupWebView()
        setupControls()
        refreshAccessUrls()
        refreshSettingsState()
        requestPermissionsAndStart()
    }

    private fun bindViews() {
        webView = findViewById(R.id.webView)
        settingsPanel = findViewById(R.id.settingsPanel)
        settingsFab = findViewById(R.id.settingsFab)
        statusLabel = findViewById(R.id.statusLabel)
        statusDetail = findViewById(R.id.statusDetail)
        accessDesc = findViewById(R.id.accessDesc)
        accessUrls = findViewById(R.id.accessUrls)
        openLibraryButton = findViewById(R.id.openLibraryButton)
        retryButton = findViewById(R.id.retryButton)
        updateButton = findViewById(R.id.updateButton)
        batteryButton = findViewById(R.id.batteryButton)
        gallerySwitch = findViewById(R.id.gallerySwitch)
        shareWhatsAppButton = findViewById(R.id.shareWhatsAppButton)
        shareCopyButton = findViewById(R.id.shareCopyButton)
    }

    private fun setupWebView() {
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.mediaPlaybackRequiresUserGesture = false
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean = false
        }
    }

    private fun setupControls() {
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

        batteryButton.setOnClickListener {
            if (BatteryHelper.isExempt(this)) {
                Toast.makeText(this, R.string.battery_opt_granted, Toast.LENGTH_SHORT).show()
            } else {
                showBatteryDialog()
            }
        }

        updateButton.setOnClickListener {
            updateButton.isEnabled = false
            updateStatus(getString(R.string.status_starting), getString(R.string.updating))
            UpdateManager.updateFromGitHub(this) { ok, message ->
                runOnUiThread {
                    updateButton.isEnabled = true
                    Toast.makeText(this, message, Toast.LENGTH_LONG).show()
                    if (ok) recreate()
                }
            }
        }

        shareWhatsAppButton.setOnClickListener { shareLink(viaWhatsApp = true) }
        shareCopyButton.setOnClickListener { shareLink(viaWhatsApp = false) }

        openLibraryButton.setOnClickListener { openLibrary() }
        retryButton.setOnClickListener { startServerFlow() }

        settingsFab.setOnClickListener {
            showSettingsPanel()
        }
    }

    private fun shareLink(viaWhatsApp: Boolean) {
        val port = RolloConfig.getPort(this)
        val lan = NetworkHelper.getLanIp()
        val body = buildString {
            appendLine("Open my Rollo media library:")
            if (lan != null) appendLine("Same Wi‑Fi: http://$lan:$port/")
            appendLine("Tailscale: http://YOUR-TAILSCALE-IP:$port/")
            append("(Get Tailscale IP from the Tailscale app on the phone running Rollo)")
        }

        if (viaWhatsApp) {
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_TEXT, body)
                `package` = "com.whatsapp"
            }
            if (intent.resolveActivity(packageManager) != null) {
                startActivity(intent)
            } else {
                startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(Intent.EXTRA_TEXT, body)
                }, getString(R.string.share_whatsapp)))
            }
        } else {
            val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            clipboard.setPrimaryClip(ClipData.newPlainText("Rollo", body))
            Toast.makeText(this, R.string.share_copied, Toast.LENGTH_SHORT).show()
        }
    }

    private fun refreshAccessUrls() {
        val port = RolloConfig.getPort(this)
        accessDesc.text = getString(R.string.access_desc, port)
        accessUrls.text = NetworkHelper.accessUrls(this).joinToString("\n") { (label, url) ->
            "$label: $url"
        }
    }

    private fun refreshSettingsState() {
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
        if (startupInProgress) return
        startupInProgress = true
        serverReady = false
        showSettingsPanel()
        openLibraryButton.isVisible = false
        retryButton.isVisible = false
        updateStatus(getString(R.string.status_starting), getString(R.string.server_installing))

        Thread {
            try {
                AssetInstaller.installIfNeeded(this)
                RolloConfig.videosDir().mkdirs()
                GalleryVisibility.applySavedPreference(this)
                runOnUiThread {
                    refreshSettingsState()
                    RolloService.start(this)
                    updateStatus(getString(R.string.status_starting), getString(R.string.server_starting))
                }
                val ready = waitForServerBlocking()
                runOnUiThread {
                    startupInProgress = false
                    if (ready) {
                        onServerReady()
                    } else {
                        onServerFailed()
                    }
                }
            } catch (err: Exception) {
                runOnUiThread {
                    startupInProgress = false
                    onServerFailed(err.message)
                }
            }
        }.start()
    }

    private fun waitForServerBlocking(): Boolean {
        val url = RolloConfig.serverUrl(this)
        repeat(180) {
            if (ping(url)) return true
            if (NodeRunner.getState() == NodeRunner.State.FAILED) return false
            Thread.sleep(500)
        }
        return ping(url)
    }

    private fun onServerReady() {
        serverReady = true
        updateStatus(getString(R.string.status_running), getString(R.string.status_running))
        openLibraryButton.isVisible = true
        retryButton.isVisible = false
        openLibrary()
    }

    private fun onServerFailed(extra: String? = null) {
        serverReady = false
        val nodeError = NodeRunner.getLastError()
        val logTail = readNodeLogTail()
        val detail = buildString {
            append(getString(R.string.server_unavailable))
            extra?.let { append("\n\n").append(it) }
            nodeError?.let { append("\n\n").append(it) }
            if (logTail.isNotBlank()) append("\n\n").append(logTail)
            append("\n\n").append(getString(R.string.error_log_hint))
        }
        updateStatus(getString(R.string.status_failed), detail)
        retryButton.isVisible = true
        openLibraryButton.isVisible = false
    }

    private fun readNodeLogTail(): String {
        val log = File(RolloConfig.nodeProjectDir(this), "node.log")
        if (!log.exists()) return ""
        return log.readText().takeLast(1500).trim()
    }

    private fun updateStatus(label: String, detail: String) {
        statusLabel.text = label
        statusDetail.text = detail
    }

    private fun openLibrary() {
        webView.loadUrl(RolloConfig.serverUrl(this))
        webView.isVisible = true
        settingsPanel.isVisible = false
        settingsFab.isVisible = true
    }

    private fun showSettingsPanel() {
        webView.isVisible = false
        settingsPanel.isVisible = true
        settingsFab.isVisible = false
        refreshAccessUrls()
        refreshSettingsState()
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
                    startActivity(Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION).apply {
                        data = Uri.parse("package:$packageName")
                    })
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

    private fun ping(url: String): Boolean {
        return try {
            val connection = URL(url).openConnection() as HttpURLConnection
            connection.connectTimeout = 1500
            connection.readTimeout = 1500
            connection.requestMethod = "GET"
            connection.connect()
            connection.responseCode in 200..499
        } catch (_: Exception) {
            false
        }
    }

    override fun onResume() {
        super.onResume()
        refreshSettingsState()
        if (!serverReady && !startupInProgress && hasStorageAccess() && NodeRunner.getState() == NodeRunner.State.IDLE) {
            if (BatteryHelper.isExempt(this)) {
                startServerFlow()
            }
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.isVisible) {
            showSettingsPanel()
        } else {
            super.onBackPressed()
        }
    }
}
