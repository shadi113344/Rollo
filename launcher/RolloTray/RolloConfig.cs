using System.Text.Json;

namespace RolloTray;

sealed class RolloConfig
{
    public bool AutoStartWithWindows { get; set; }
    public bool AutoStartServer { get; set; }
    public int Port { get; set; } = 3847;

    static string ConfigPath =>
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Rollo",
            "launcher.json");

    public static RolloConfig Load()
    {
        try
        {
            if (File.Exists(ConfigPath))
            {
                var json = File.ReadAllText(ConfigPath);
                return JsonSerializer.Deserialize<RolloConfig>(json) ?? new RolloConfig();
            }
        }
        catch
        {
            // fall through to defaults
        }

        return new RolloConfig();
    }

    public void Save()
    {
        var dir = Path.GetDirectoryName(ConfigPath)!;
        Directory.CreateDirectory(dir);
        var json = JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(ConfigPath, json);
    }
}
