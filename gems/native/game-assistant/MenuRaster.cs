using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Text;
using System.IO;

namespace Gems.GameAssistant
{
    internal static class MenuRaster
    {
        public const int GlyphSize = 48;
        public const float GlyphFont = 28;
        public static byte[] Glyph(string text, out float advance)
        {
            using (var bitmap = new Bitmap(GlyphSize, GlyphSize, PixelFormat.Format32bppArgb))
            using (var graphics = Graphics.FromImage(bitmap))
            using (var font = new Font("Microsoft YaHei UI", GlyphFont, FontStyle.Regular, GraphicsUnit.Pixel))
            using (var format = (StringFormat)StringFormat.GenericTypographic.Clone())
            using (var stream = new MemoryStream())
            {
                format.FormatFlags |= StringFormatFlags.MeasureTrailingSpaces | StringFormatFlags.NoWrap;
                graphics.Clear(Color.Transparent); graphics.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
                advance = graphics.MeasureString(text, font, 1000, format).Width;
                if (advance > GlyphSize - 4) throw new InvalidDataException("字形超过独立纹理尺寸。");
                graphics.DrawString(text, font, Brushes.White, new PointF(2, 0), format);
                bitmap.Save(stream, ImageFormat.Png); return stream.ToArray();
            }
        }
        public static byte[] Background(int height = 590)
        {
            using (var bitmap = new Bitmap(420, height, PixelFormat.Format32bppArgb))
            using (var graphics = Graphics.FromImage(bitmap))
            using (var background = new SolidBrush(Color.FromArgb(226, 18, 23, 32)))
            using (var cards = new SolidBrush(Color.FromArgb(230, 27, 34, 48)))
            using (var stream = new MemoryStream())
            {
                graphics.Clear(Color.Transparent); graphics.SmoothingMode = SmoothingMode.AntiAlias;
                using (var rounded = Rounded(new RectangleF(0, 0, 420, height), 25)) graphics.FillPath(background, rounded);
                for (var index = 0; index < 8; index++)
                    using (var rounded = Rounded(new RectangleF(18, 106 + index * 46, 384, 40), 10)) graphics.FillPath(cards, rounded);
                bitmap.Save(stream, ImageFormat.Png); return stream.ToArray();
            }
        }
        public static void Save(string path, string title, string subtitle, string[] rows, string notice)
        {
            using (var bitmap = new Bitmap(420, 590, PixelFormat.Format32bppArgb))
            using (var graphics = Graphics.FromImage(bitmap))
            using (var headerFont = new Font("Microsoft YaHei UI", 23, FontStyle.Bold, GraphicsUnit.Pixel))
            using (var font = new Font("Microsoft YaHei UI", 18, FontStyle.Regular, GraphicsUnit.Pixel))
            using (var smallFont = new Font("Microsoft YaHei UI", 13, FontStyle.Regular, GraphicsUnit.Pixel))
            using (var white = new SolidBrush(Color.FromArgb(245, 247, 250)))
            using (var muted = new SolidBrush(Color.FromArgb(160, 172, 190)))
            using (var background = new SolidBrush(Color.FromArgb(226, 18, 23, 32)))
            using (var cards = new SolidBrush(Color.FromArgb(230, 27, 34, 48)))
            using (var format = new StringFormat { Trimming = StringTrimming.EllipsisCharacter, FormatFlags = StringFormatFlags.NoWrap })
            {
                graphics.Clear(Color.Transparent);
                graphics.SmoothingMode = SmoothingMode.AntiAlias;
                graphics.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
                using (var rounded = Rounded(new RectangleF(0, 0, 420, 590), 25)) graphics.FillPath(background, rounded);
                graphics.DrawString(title, headerFont, white, new RectangleF(26, 24, 370, 40), format);
                graphics.DrawString(subtitle, smallFont, muted, new RectangleF(26, 69, 368, 25), format);
                for (var index = 0; index < rows.Length && index < 8; index++)
                {
                    using (var rounded = Rounded(new RectangleF(18, 106 + index * 46, 384, 40), 10)) graphics.FillPath(cards, rounded);
                    graphics.DrawString(rows[index], font, white, new RectangleF(33, 115 + index * 46, 354, 27), format);
                }
                graphics.DrawString(notice, smallFont, muted, new RectangleF(24, 503, 370, 45));
                graphics.DrawString("↑↓ 选择 · ←→ 分类 · 回车执行 · F5 关闭", smallFont, muted, new PointF(24, 556));
                bitmap.Save(path, ImageFormat.Png);
            }
        }
        private static GraphicsPath Rounded(RectangleF rectangle, float radius)
        {
            var result = new GraphicsPath(); var d = radius * 2;
            result.AddArc(rectangle.X, rectangle.Y, d, d, 180, 90);
            result.AddArc(rectangle.Right - d, rectangle.Y, d, d, 270, 90);
            result.AddArc(rectangle.Right - d, rectangle.Bottom - d, d, d, 0, 90);
            result.AddArc(rectangle.X, rectangle.Bottom - d, d, d, 90, 90);
            result.CloseFigure(); return result;
        }
    }
}
