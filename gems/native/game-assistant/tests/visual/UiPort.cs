// Offline GDI port for exercising the production panel layout. This is deliberately
// not the SHVDNE runtime, native texture allocator, or a game-load test.
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
namespace GTA.UI
{
    public static class Screen { public static float ScaledWidth => 1280; }
    public sealed class CustomSprite
    {
        public static readonly Dictionary<string, Bitmap> Images = new Dictionary<string, Bitmap>();
        public static readonly Bitmap Canvas = new Bitmap(1280, 720);
        public static readonly Graphics Graphics = Graphics.FromImage(Canvas);
        public static readonly List<string> DrawnSprites = new List<string>();
        private readonly string path;
        public SizeF Size { get; set; }
        public PointF Position { get; set; }
        public Color Color { get; set; } = Color.White;
        public CustomSprite(string path, SizeF size, PointF position)
        {
            this.path = path; Size = size; Position = position;
            if (!Images.ContainsKey(path)) using (var image = Image.FromFile(path)) Images[path] = new Bitmap(image);
        }
        public void ScaledDraw()
        {
            DrawnSprites.Add(path);
            using (var attributes = new ImageAttributes())
            {
                attributes.SetColorMatrix(new ColorMatrix(new[] {
                    new[]{Color.R/255f,0,0,0,0}, new[]{0,Color.G/255f,0,0,0}, new[]{0,0,Color.B/255f,0,0},
                    new[]{0,0,0,Color.A/255f,0}, new[]{0f,0,0,0,1} }));
                var image = Images[path];
                Graphics.DrawImage(image, Rectangle.Round(new RectangleF(Position, Size)), 0, 0, image.Width, image.Height, GraphicsUnit.Pixel, attributes);
            }
        }
    }
}
namespace GTA.Native
{
    public enum Hash { DRAW_RECT }
    public static class Function
    {
        public static float LastMarkerY;
        public static void Call(Hash hash, float x, float y, float width, float height, int r, int g, int b, int a, bool unused)
        {
            LastMarkerY = y * 720;
            using (var brush = new SolidBrush(Color.FromArgb(a, r, g, b)))
                GTA.UI.CustomSprite.Graphics.FillRectangle(brush, (x - width/2) * 1280, (y - height/2) * 720, width * 1280, height * 720);
        }
    }
}
