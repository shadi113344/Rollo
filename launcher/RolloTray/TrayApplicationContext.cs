using System.Diagnostics;

namespace RolloTray;

sealed class TrayApplicationContext : ApplicationContext
{
    readonly RolloConfig _config;
    readonly ServerProcess _server = new();
    readonly NotifyIcon _tray;
    readonly MainForm _form;
    readonly bool _launchedAtStartup;

    public TrayApplicationContext(string[] args)
    {
        _launchedAtStartup = args.Contains("--startup", StringComparer.OrdinalIgnoreCase);
        _config = RolloConfig.Load();

        // Keep registry in sync with saved preference.
        if (_config.AutoStartWithWindows != StartupRegistry.IsEnabled())
            StartupRegistry.SetEnabled(_config.AutoStartWithWindows);

        _form = new MainForm(_config, _server, MinimizeToTray);
        _form.FormClosed += (_, _) => ExitThread();

        _tray = new NotifyIcon
        {
            Icon = RolloIcon.Create(),
            Text = "Rollo",
            Visible = true,
        };
        _tray.DoubleClick += (_, _) => ShowWindow();
        _tray.ContextMenuStrip = BuildTrayMenu();

        _server.StateChanged += (_, _) => UpdateTrayText();

        if (_launchedAtStartup || _config.AutoStartServer)
        {
            if (_config.AutoStartServer)
                TryStartServerQuietly();
            MinimizeToTray();
        }
        else
        {
            _form.Show();
        }
    }

    ContextMenuStrip BuildTrayMenu()
    {
        var menu = new ContextMenuStrip();

        var showItem = new ToolStripMenuItem("Show Rollo", null, (_, _) => ShowWindow());
        var startItem = new ToolStripMenuItem("Start server", null, (_, _) => StartFromTray());
        var stopItem = new ToolStripMenuItem("Stop server", null, (_, _) => StopFromTray());
        var browserItem = new ToolStripMenuItem("Open in browser", null, (_, _) => OpenBrowser());
        var startupItem = new ToolStripMenuItem("Start with Windows")
        {
            CheckOnClick = true,
            Checked = _config.AutoStartWithWindows,
        };
        startupItem.Click += (_, _) =>
        {
            _config.AutoStartWithWindows = startupItem.Checked;
            _config.Save();
            StartupRegistry.SetEnabled(_config.AutoStartWithWindows);
            _form.SyncFromConfig();
        };
        var exitItem = new ToolStripMenuItem("Exit", null, (_, _) => ExitApp());

        menu.Opening += (_, _) =>
        {
            var running = _server.IsRunning || ServerProcess.IsPortInUse(_config.Port);
            startItem.Enabled = !running;
            stopItem.Enabled = running;
            browserItem.Enabled = running;
            startupItem.Checked = _config.AutoStartWithWindows;
        };

        menu.Items.Add(showItem);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(startItem);
        menu.Items.Add(stopItem);
        menu.Items.Add(browserItem);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(startupItem);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(exitItem);

        return menu;
    }

    void ShowWindow()
    {
        _form.SyncFromConfig();
        _form.Show();
        _form.WindowState = FormWindowState.Normal;
        _form.Activate();
    }

    void MinimizeToTray()
    {
        _form.Hide();
        _tray.Visible = true;
        UpdateTrayText();
    }

    void TryStartServerQuietly()
    {
        if (_server.IsRunning || ServerProcess.IsPortInUse(_config.Port))
            return;

        try
        {
            _server.Start(_config.Port);
        }
        catch
        {
            _tray.ShowBalloonTip(
                4000,
                "Rollo",
                "Could not start server. Open Rollo from the tray to try again.",
                ToolTipIcon.Warning);
        }
    }

    void StartFromTray()
    {
        try
        {
            _server.Start(_config.Port);
            MinimizeToTray();
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "Could not start server", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    void StopFromTray()
    {
        _server.Stop();
        UpdateTrayText();
    }

    void OpenBrowser()
    {
        try
        {
            Process.Start(new ProcessStartInfo($"http://localhost:{_config.Port}") { UseShellExecute = true });
        }
        catch
        {
            // ignore
        }
    }

    void UpdateTrayText()
    {
        var running = _server.IsRunning || ServerProcess.IsPortInUse(_config.Port);
        _tray.Text = running ? $"Rollo — running (:{_config.Port})" : "Rollo — stopped";
    }

    void ExitApp()
    {
        _server.Dispose();
        _tray.Visible = false;
        _tray.Dispose();
        _form.Close();
        ExitThread();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _server.Dispose();
            _tray.Dispose();
        }

        base.Dispose(disposing);
    }
}
