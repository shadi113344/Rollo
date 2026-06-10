using System.Diagnostics;

namespace RolloTray;

sealed class MainForm : Form
{
    readonly RolloConfig _config;
    readonly ServerProcess _server;
    readonly Action _onServerStarted;

    readonly Label _statusLabel = new() { AutoSize = true, Font = new Font("Segoe UI", 10f) };
    readonly Button _toggleButton = new() { Width = 140, Height = 36 };
    readonly CheckBox _startupCheck = new() { AutoSize = true, Text = "Start with Windows" };
    readonly CheckBox _autoServerCheck = new() { AutoSize = true, Text = "Start server when launcher opens" };
    readonly LinkLabel _openLink = new() { AutoSize = true, Text = "Open in browser" };

    public void SyncFromConfig()
    {
        _startupCheck.CheckedChanged -= StartupCheckChanged;
        _autoServerCheck.CheckedChanged -= AutoServerCheckChanged;
        _startupCheck.Checked = _config.AutoStartWithWindows;
        _autoServerCheck.Checked = _config.AutoStartServer;
        _startupCheck.CheckedChanged += StartupCheckChanged;
        _autoServerCheck.CheckedChanged += AutoServerCheckChanged;
    }

    void StartupCheckChanged(object? sender, EventArgs e) => SaveStartupSetting();
    void AutoServerCheckChanged(object? sender, EventArgs e) => SaveAutoServerSetting();

    public MainForm(RolloConfig config, ServerProcess server, Action onServerStarted)
    {
        _config = config;
        _server = server;
        _onServerStarted = onServerStarted;

        Text = "Rollo";
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = true;
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(320, 200);
        Icon = RolloIcon.Create();

        var layout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(16),
            ColumnCount = 1,
            RowCount = 6,
        };
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));

        var title = new Label
        {
            AutoSize = true,
            Text = "Rollo media server",
            Font = new Font("Segoe UI Semibold", 12f),
        };

        _startupCheck.Checked = _config.AutoStartWithWindows;
        _autoServerCheck.Checked = _config.AutoStartServer;
        _startupCheck.CheckedChanged += StartupCheckChanged;
        _autoServerCheck.CheckedChanged += AutoServerCheckChanged;

        _toggleButton.Click += (_, _) => ToggleServer();
        _openLink.LinkClicked += (_, _) => OpenBrowser();

        layout.Controls.Add(title, 0, 0);
        layout.Controls.Add(_statusLabel, 0, 1);
        layout.Controls.Add(_toggleButton, 0, 2);
        layout.Controls.Add(_startupCheck, 0, 3);
        layout.Controls.Add(_autoServerCheck, 0, 4);
        layout.Controls.Add(_openLink, 0, 5);

        Controls.Add(layout);

        _server.StateChanged += (_, _) => BeginInvoke(RefreshUi);
        RefreshUi();
    }

    void RefreshUi()
    {
        var running = _server.IsRunning || ServerProcess.IsPortInUse(_config.Port);
        _statusLabel.Text = running
            ? $"Status: Running on port {_config.Port}"
            : "Status: Stopped";
        _statusLabel.ForeColor = running ? Color.FromArgb(0, 120, 0) : Color.FromArgb(160, 0, 0);
        _toggleButton.Text = running ? "Stop server" : "Start server";
        _openLink.Enabled = running;
    }

    void ToggleServer()
    {
        if (_server.IsRunning || ServerProcess.IsPortInUse(_config.Port))
        {
            _server.Stop();
            return;
        }

        try
        {
            _server.Start(_config.Port);
            _onServerStarted();
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                this,
                ex.Message,
                "Could not start server",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }

        RefreshUi();
    }

    void SaveStartupSetting()
    {
        _config.AutoStartWithWindows = _startupCheck.Checked;
        _config.Save();
        StartupRegistry.SetEnabled(_config.AutoStartWithWindows);
    }

    void SaveAutoServerSetting()
    {
        _config.AutoStartServer = _autoServerCheck.Checked;
        _config.Save();
    }

    void OpenBrowser()
    {
        try
        {
            Process.Start(new ProcessStartInfo($"http://localhost:{_config.Port}") { UseShellExecute = true });
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "Open browser", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (_server.IsRunning && e.CloseReason == CloseReason.UserClosing)
        {
            e.Cancel = true;
            Hide();
        }

        base.OnFormClosing(e);
    }
}
