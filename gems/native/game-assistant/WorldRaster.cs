using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;

namespace Gems.GameAssistant
{
    // Six immutable code-drawn assets. Weather selections and changing numeric
    // values do not produce new texture filenames.
    internal static class WorldRaster
    {
        public static readonly string[] IconNames = { "sun", "cloud", "rain", "thunder", "fog", "snow" };
        public static byte[] WeatherIcon(string name)
        {
            if (Array.IndexOf(IconNames, name) < 0) throw new ArgumentException("未知天气图标", nameof(name));
            return Render(64, 64, graphics => {
                using (var background = new SolidBrush(Color.FromArgb(255, 35, 47, 68))) graphics.FillEllipse(background, 1, 1, 62, 62);
                if (name == "sun")
                {
                    using (var pen = new Pen(Color.FromArgb(255, 248, 193, 79), 3) { StartCap = LineCap.Round, EndCap = LineCap.Round })
                        for (var i = 0; i < 8; i++) { var a = Math.PI * i / 4; graphics.DrawLine(pen, 32 + (float)Math.Cos(a) * 21, 32 + (float)Math.Sin(a) * 21, 32 + (float)Math.Cos(a) * 26, 32 + (float)Math.Sin(a) * 26); }
                    using (var brush = new SolidBrush(Color.FromArgb(255, 255, 210, 102))) graphics.FillEllipse(brush, 17, 17, 30, 30);
                }
                else
                {
                    using (var cloud = new SolidBrush(Color.FromArgb(255, 213, 226, 243)))
                    {
                        graphics.FillEllipse(cloud, 10, 22, 24, 22); graphics.FillEllipse(cloud, 22, 13, 27, 30);
                        graphics.FillEllipse(cloud, 37, 24, 18, 20); graphics.FillRectangle(cloud, 21, 30, 25, 14);
                    }
                    if (name == "rain") using (var pen = new Pen(Color.FromArgb(255, 102, 180, 255), 3) { StartCap = LineCap.Round, EndCap = LineCap.Round })
                        for (var i = 0; i < 3; i++) graphics.DrawLine(pen, 23 + i * 11, 47, 20 + i * 11, 54);
                    if (name == "thunder") using (var brush = new SolidBrush(Color.FromArgb(255, 255, 207, 76)))
                        graphics.FillPolygon(brush, new[] { new PointF(33, 35), new PointF(25, 48), new PointF(33, 48), new PointF(29, 59), new PointF(44, 42), new PointF(35, 42), new PointF(40, 35) });
                    if (name == "fog") using (var pen = new Pen(Color.FromArgb(255, 160, 191, 218), 3) { StartCap = LineCap.Round, EndCap = LineCap.Round })
                    { graphics.DrawLine(pen, 13, 48, 51, 48); graphics.DrawLine(pen, 19, 55, 46, 55); }
                    if (name == "snow") using (var pen = new Pen(Color.FromArgb(255, 172, 224, 255), 2))
                        for (var i = 0; i < 3; i++) { var x = 21 + i * 12; var y = i == 1 ? 54 : 49; graphics.DrawLine(pen, x - 3, y, x + 3, y); graphics.DrawLine(pen, x, y - 3, x, y + 3); graphics.DrawLine(pen, x - 2, y - 2, x + 2, y + 2); }
                }
            });
        }
        public static byte[] SliderTrack() => Render(300, 4, g => g.Clear(Color.FromArgb(255, 63, 79, 104)));
        public static byte[] SliderFill() => Render(300, 4, g => g.Clear(Color.FromArgb(255, 91, 163, 255)));
        public static byte[] SliderThumb() => Render(10, 10, g => { using (var brush = new SolidBrush(Color.FromArgb(255, 215, 235, 255))) g.FillEllipse(brush, 0, 0, 9, 9); });
        private static byte[] Render(int width, int height, Action<Graphics> draw)
        {
            using (var bitmap = new Bitmap(width, height, PixelFormat.Format32bppArgb))
            using (var graphics = Graphics.FromImage(bitmap))
            using (var stream = new MemoryStream())
            {
                graphics.Clear(Color.Transparent); graphics.SmoothingMode = SmoothingMode.AntiAlias; draw(graphics);
                bitmap.Save(stream, ImageFormat.Png); return stream.ToArray();
            }
        }
    }
}
