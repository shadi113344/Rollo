using System.Drawing.Drawing2D;

namespace RolloTray;

static class RolloIcon
{
    public static Icon Create()
    {
        using var bmp = new Bitmap(32, 32);
        using var g = Graphics.FromImage(bmp);
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.Clear(Color.FromArgb(10, 10, 10));
        using var pen = new Pen(Color.White, 2.5f);
        g.DrawEllipse(pen, 5, 5, 22, 22);
        g.FillPolygon(Brushes.White, new[] { new Point(13, 10), new Point(13, 22), new Point(23, 16) });
        return Icon.FromHandle((IntPtr)bmp.GetHicon());
    }
}
