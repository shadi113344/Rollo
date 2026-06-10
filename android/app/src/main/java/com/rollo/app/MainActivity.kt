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
import android.os.Process
import android.provider.DocumentsContract
import android.provider.Settings
import android.view.View
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.isVisible
import com.google.android.material.appbar.MaterialToolbar
import com.google.android.material.button.MaterialButton
import com.google.android.material.switchmaterial.SwitchMaterial
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private lateinit var libraryPanel: View
    private lateinit var libraryToolbar: MaterialToolbar
    private lateinit var settingsPanel: View
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
    private lateinit var videosFolderPath: TextView
    private lateinit var chooseVideosFolderButton: MaterialButton
    private lateinit var defaultVideosFolderButton: MaterialButton
    private lateinit var exitButton: MaterialButton

    private var gallerySwitchListener: ((Boolean) -> Unit)? = null
    private var startupInProgress = false
    private var serverReady = false

    private val notificationPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { continueStartup() }

    private val pickVideosFolder = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode != RESULT_OK) return@registerForActivityResult
        val uri = result.data?.data ?: return@registerForActivityResult
        val flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
        try {
            contentResolver.takePersistableUriPermission(uri, flags)
        } catch (_: SecurityException) {
            // Some providers do not allow persistable grants.
        }
        applyVideosFolderUri(uri)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        bindViews()
        setupWebView()
        setupControls()
        setupBackNavigation()
        refreshAccessUrls()
        refreshSettingsState()
        requestPermissionsAndStart()
    }

    private fun bindViews() {
        webView = findViewById(R.id.webView)
        libraryPanel = findViewById(R.id.libraryPanel)
        libraryToolbar = findViewById(R.id.libraryToolbar)
        settingsPanel = findViewById(R.id.settingsPanel)
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
        videosFolderPath = findViewById(R.id.videosFolderPath)
        chooseVideosFolderButton = findViewById(R.id.chooseVideosFolderButton)
        defaultVideosFolderButton = findViewById(R.id.defaultVideosFolderButton)
        exitButton = findViewById(R.id.exitButton)
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
        chooseVideosFolderButton.setOnClickListener { openVideosFolderPicker() }
        defaultVideosFolderButton.setOnClickListener { resetVideosFolderToDefault() }
        exitButton.setOnClickListener { confirmKillServerAndExit() }

        libraryToolbar.setNavigationOnClickListener { leaveLibrary() }
    }

    private fun setupBackNavigation() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (libraryPanel.isVisible) {
                    if (webView.canGoBack()) {
                        webView.goBack()
                    } else {
                        leaveLibrary()
                    }
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })
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
        refreshVideosFolderLabel()
    }

    private fun refreshVideosFolderLabel() {
        videosFolderPath.text = getString(
            R.string.videos_folder_current,
            RolloConfig.videosDir(this).absolutePath
        )
    }

    private fun openVideosFolderPicker() {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
            addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        }
        RolloConfig.getVideosTreeUri(this)?.let { existing ->
            intent.putExtra(DocumentsContract.EXTRA_INITIAL_URI, existing)
        }
        pickVideosFolder.launch(intent)
    }

    private fun applyVideosFolderUri(uri: Uri) {
        val path = StoragePathHelper.treeUriToPath(this, uri)
        if (path.isNullOrBlank()) {
            Toast.makeText(this, R.string.videos_folder_error, Toast.LENGTH_LONG).show()
            return
        }
        val dir = File(path)
        if (!dir.exists() && !dir.mkdirs()) {
            Toast.makeText(this, R.string.videos_folder_error, Toast.LENGTH_LONG).show()
            return
        }
        RolloConfig.setVideosDir(this, dir, uri)
        RolloConfig.writeNodeConfig(this)
        GalleryVisibility.applySavedPreference(this)
        refreshVideosFolderLabel()
        Toast.makeText(this, R.string.videos_folder_set, Toast.LENGTH_SHORT).show()
        if (serverReady || NodeRunner.isRunning()) {
            offerServerRestartForNewFolder()
        }
    }

    private fun resetVideosFolderToDefault() {
        RolloConfig.clearCustomVideosDir(this)
        RolloConfig.writeNodeConfig(this)
        RolloConfig.defaultVideosDir().mkdirs()
        GalleryVisibility.applySavedPreference(this)
        refreshVideosFolderLabel()
        Toast.makeText(this, R.string.videos_folder_set, Toast.LENGTH_SHORT).show()
        if (serverReady || NodeRunner.isRunning()) {
            offerServerRestartForNewFolder()
        }
    }

    private fun offerServerRestartForNewFolder() {
        AlertDialog.Builder(this)
            .setTitle(R.string.videos_folder_restart_title)
            .setMessage(R.string.videos_folder_restart_message)
            .setPositiveButton(R.string.videos_folder_restart_now) { _, _ ->
                restartAppForNewConfig()
            }
            .setNegativeButton(R.string.videos_folder_restart_later, null)
            .show()
    }

    private fun confirmKillServerAndExit() {
        AlertDialog.Builder(this)
            .setTitle(R.string.exit_title)
            .setMessage(R.string.exit_message)
            .setPositiveButton(R.string.exit_confirm) { _, _ ->
                killServerAndExit()
            }
            .setNegativeButton(android.R.string.cancel, null)
            .show()
    }

    private fun killServerAndExit() {
        RolloService.stop(this)
        finishAndRemoveTask()
        Process.killProcess(Process.myPid())
    }

    private fun restartAppForNewConfig() {
        RolloService.stop(this)
        Process.killProcess(Process.myPid())
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
                RolloConfig.videosDir(this).mkdirs()
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
        updateStatus(getString(R.string.status_running), getString(R.string.server_ready_hint))
        openLibraryButton.isVisible = true
        retryButton.isVisible = false
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
        val url = RolloConfig.serverUrl(this)
        if (webView.url != url) {
            webView.loadUrl(url)
        }
        libraryPanel.isVisible = true
        settingsPanel.isVisible = false
    }

    private fun leaveLibrary() {
        showSettingsPanel()
    }

    private fun showSettingsPanel() {
        libraryPanel.isVisible = false
        settingsPanel.isVisible = true
        refreshAccessUrls()
        refreshSettingsState()
        if (serverReady) {
            updateStatus(getString(R.string.status_running), getString(R.string.server_ready_hint))
            openLibraryButton.isVisible = true
        }
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

}
