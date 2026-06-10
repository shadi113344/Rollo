using System.Diagnostics;
using System.Net;
using System.Net.Sockets;

namespace RolloTray;

sealed class ServerProcess : IDisposable
{
    Process? _process;
    readonly object _lock = new();

    public bool IsRunning
    {
        get
        {
            lock (_lock)
            {
                return _process is { HasExited: false };
            }
        }
    }

    public event EventHandler? StateChanged;

    public void Start(int port)
    {
        lock (_lock)
        {
            if (_process is { HasExited: false })
                return;

            var root = RolloPaths.Root;
            var startInfo = new ProcessStartInfo
            {
                FileName = "node",
                Arguments = "server.js",
                WorkingDirectory = root,
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
            };
            startInfo.Environment["PORT"] = port.ToString();

            _process = Process.Start(startInfo);
            if (_process is null)
                throw new InvalidOperationException("Failed to start node server.js");

            _process.EnableRaisingEvents = true;
            _process.Exited += (_, _) => StateChanged?.Invoke(this, EventArgs.Empty);
        }

        StateChanged?.Invoke(this, EventArgs.Empty);
    }

    public void Stop()
    {
        Process? proc;
        lock (_lock)
        {
            proc = _process;
            _process = null;
        }

        if (proc is null || proc.HasExited)
            return;

        try
        {
            proc.Kill(entireProcessTree: true);
            proc.WaitForExit(5000);
        }
        catch
        {
            // process may already be gone
        }
        finally
        {
            proc.Dispose();
            StateChanged?.Invoke(this, EventArgs.Empty);
        }
    }

    public static bool IsPortInUse(int port)
    {
        try
        {
            using var listener = new TcpListener(IPAddress.Loopback, port);
            listener.Start();
            listener.Stop();
            return false;
        }
        catch (SocketException)
        {
            return true;
        }
    }

    public void Dispose() => Stop();
}
