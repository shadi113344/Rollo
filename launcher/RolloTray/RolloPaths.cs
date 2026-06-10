namespace RolloTray;

static class RolloPaths
{
    public static string Root
    {
        get
        {
            var dir = AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            if (File.Exists(Path.Combine(dir, "server.js")))
                return dir;

            // Dev build: exe lives in launcher/RolloTray/bin/... — walk up to repo root.
            var current = new DirectoryInfo(dir);
            while (current is not null)
            {
                if (File.Exists(Path.Combine(current.FullName, "server.js")))
                    return current.FullName;
                current = current.Parent;
            }

            throw new FileNotFoundException(
                "Could not find server.js. Place Rollo.exe in your Rollo folder (next to server.js).");
        }
    }

    public static string ExePath => Environment.ProcessPath ?? Application.ExecutablePath;
}
