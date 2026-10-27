using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using GTA.UI;

namespace Gems.GameAssistant
{
    // SHVDNE retains textures by path for the process lifetime. Reuse bounded, stable
    // grapheme images; never create another page texture for a changing coordinate/value.
    internal sealed class ChinesePanel
    {
        private readonly string directory;
        private sealed class Glyph
        {
            public readonly CustomSprite Sprite;
            public readonly float Advance;
            public Glyph(CustomSprite sprite, float advance) { Sprite = sprite; Advance = advance; }
        }
        private readonly GlyphBudget budget = new GlyphBudget();
        private readonly Dictionary<string, Glyph> sprites = new Dictionary<string, Glyph>(StringComparer.Ordinal);
        private readonly HashSet<string> unsupported = new HashSet<string>(StringComparer.Ordinal);
        private readonly CustomSprite background;
        private readonly Dictionary<string, CustomSprite> weatherIcons = new Dictionary<string, CustomSprite>(StringComparer.Ordinal);
        private readonly CustomSprite sliderTrack, sliderFill, sliderThumb;
        public ChinesePanel(string root)
        {
            directory = Path.Combine(root, "glyph-v1");
            BridgeCatalog.RejectLinks(directory); Directory.CreateDirectory(directory);
            // A script reload must retain the process-wide budget, even for older glyphs.
            foreach (var file in Directory.EnumerateFiles(directory, "glyph-*.png").OrderBy(f => f, StringComparer.Ordinal))
            {
                var glyph = GlyphBudget.FromFileKey(Path.GetFileName(file));
                if (glyph != null && !budget.Admit(glyph)) throw new InvalidDataException("字形缓存数量超限，未创建更多游戏纹理。");
            }
            var path = Path.Combine(directory, "background-input-v1.png"); EnsureFile(path, MenuRaster.Background(620));
            background = new CustomSprite(path, new SizeF(420, 620), new PointF());
            var worldDirectory = Path.Combine(root, "world-ui-v1");
            BridgeCatalog.RejectLinks(worldDirectory); Directory.CreateDirectory(worldDirectory);
            foreach (var icon in WorldRaster.IconNames)
                weatherIcons.Add(icon, FixedSprite(worldDirectory, "weather-" + icon + ".png", WorldRaster.WeatherIcon(icon), new SizeF(34, 34)));
            sliderTrack = FixedSprite(worldDirectory, "slider-track.png", WorldRaster.SliderTrack(), new SizeF(300, 4));
            sliderFill = FixedSprite(worldDirectory, "slider-fill.png", WorldRaster.SliderFill(), new SizeF(300, 4));
            sliderThumb = FixedSprite(worldDirectory, "slider-thumb.png", WorldRaster.SliderThumb(), new SizeF(10, 10));
            GetGlyph(GlyphBudget.Fallback, out _);
            for (var i = 32; i < 127; i++) GetGlyph(((char)i).ToString(), out _);
            foreach (var glyph in GlyphBudget.Elements("玩家当前车辆天气与时间生成器故事模式未实测无敌恢复生命护甲清除通缉等级无限体力接口待验证超级跳跃持续请求移动倍率契约隐身主角切换未实现显示坐标本助手可开关修复清洗启动关闭引擎翻正晴天多云雨雷暴正午夜晚原版测试下一页已安装↑↓选择←→分类回车执行调节条件失败读取状态正在加载模型请稍候资源更新需要重新启动游戏日志错误外部修改停止成功不可用：；，。（）□")) GetGlyph(glyph, out _);
            foreach (var glyph in GlyphBudget.Elements(VehicleMenu.BuiltInText)) GetGlyph(glyph, out _);
            foreach (var glyph in GlyphBudget.Elements(WorldMenu.BuiltInText)) GetGlyph(glyph, out _);
            GetGlyph("值", out _);
        }

        public bool Draw(string title, string subtitle, MenuRow[] rows, MenuViewport viewport, string notice, string detail = "", string navigationHint = "↑↓选择  ←→分类", string actionHint = "回车执行 · F5关闭 · +/-调值")
        {
            var left = Screen.ScaledWidth - 444;
            background.Position = new PointF(left, 70); background.ScaledDraw();
            DrawText(title, left + 26, 94, 23, 370, Color.White);
            DrawText(subtitle, left + 26, 139, 13, 368, Color.LightSteelBlue);
            var selectedLegible = false;
            for (var i = 0; i < viewport.VisibleCount; i++)
            {
                var row = rows[viewport.First + i];
                var text = row.Label + (row.Value.Length == 0 ? "" : "：" + row.Value);
                var rowY = 185 + i * 46; var color = row.Enabled ? Color.White : Color.Gray;
                var weather = WorldMenu.WeatherCard(row); bool legible;
                if (weather != null)
                {
                    var icon = weatherIcons[weather.Icon]; icon.Position = new PointF(left + 32, rowY - 5); icon.ScaledDraw();
                    legible = DrawText(row.Label, left + 78, rowY - 6, 16, 309, color);
                    legible &= DrawText(row.Value, left + 78, rowY + 16, 10, 309, Color.LightSteelBlue);
                }
                else if (WorldMenu.TrySlider(row, out var fraction))
                {
                    legible = DrawText(text, left + 33, rowY - 5, 14, 354, color);
                    DrawSlider(left + 35, rowY + 25, fraction, row.Enabled);
                }
                else legible = DrawText(text, left + 33, rowY, 18, 354, color);
                if (viewport.Selected == viewport.First + i) selectedLegible = legible;
            }
            if (viewport.Selected >= 0)
                GTA.Native.Function.Call(GTA.Native.Hash.DRAW_RECT, (left + 20) / Screen.ScaledWidth, (196 + viewport.VisibleSelection * 46) / 720f, 4f / Screen.ScaledWidth, 36f / 720f, 75, 139, 255, 255, false);
            var navLegible = DrawWrapped((viewport.Selected + 1) + " / " + viewport.Count + "  " + navigationHint, left + 24, 546, 10, 370, 2, out _);
            var actionLegible = DrawWrapped(actionHint, left + 24, 578, 10, 370, 3, out _);
            var noticeLegible = DrawWrapped(notice, left + 24, 625, 12, 370, 3, out var lines);
            var detailLegible = DrawWrapped(detail, left + 24, 625 + lines * 16, 12, 370, 3 - lines, out _);
            return selectedLegible && noticeLegible && detailLegible && navLegible && actionLegible;
        }

        // Confirmation text shares a bounded three-line area with optional detail.
        // A truncated or unsupported warning prevents execution acknowledgement.
        private bool DrawWrapped(string text, float x, float y, float size, float width, int maximumLines, out int linesUsed)
        {
            linesUsed = 0; if (string.IsNullOrEmpty(text)) return true;
            if (maximumLines < 1) return false;
            var scale = size / MenuRaster.GlyphFont; var used = 0f; var line = 0; var legible = true;
            foreach (var element in GlyphBudget.Elements(text))
            {
                var glyph = GetGlyph(element, out var exact); legible &= exact;
                if (used + glyph.Advance * scale > width)
                {
                    line++; used = 0;
                    if (line >= maximumLines) { linesUsed = maximumLines; return false; }
                }
                if (glyph.Advance * scale > width) { linesUsed = line + 1; return false; }
                glyph.Sprite.Position = new PointF(x + used - 2 * scale, y + line * 17);
                glyph.Sprite.Size = new SizeF(MenuRaster.GlyphSize * scale, MenuRaster.GlyphSize * scale);
                glyph.Sprite.Color = Color.LightSteelBlue; glyph.Sprite.ScaledDraw(); used += glyph.Advance * scale;
            }
            linesUsed = line + 1; return legible;
        }

        private void DrawSlider(float x, float y, float fraction, bool enabled)
        {
            var color = enabled ? Color.White : Color.Gray;
            sliderTrack.Position = new PointF(x, y); sliderTrack.Color = color; sliderTrack.ScaledDraw();
            if (fraction > 0) { sliderFill.Position = new PointF(x, y); sliderFill.Size = new SizeF(300 * fraction, 4); sliderFill.Color = color; sliderFill.ScaledDraw(); }
            sliderThumb.Position = new PointF(x + 300 * fraction - 5, y - 3); sliderThumb.Color = color; sliderThumb.ScaledDraw();
        }

        private static CustomSprite FixedSprite(string root, string name, byte[] bytes, SizeF size)
        {
            var path = Path.Combine(root, name); EnsureFile(path, bytes); return new CustomSprite(path, size, new PointF());
        }

        private bool DrawText(string text, float x, float y, float size, float width, Color color)
        {
            var scale = size / MenuRaster.GlyphFont; var used = 0f; var legible = true;
            foreach (var element in GlyphBudget.Elements(text))
            {
                var glyph = GetGlyph(element, out var exact); legible &= exact;
                if (used + glyph.Advance * scale > width) return false;
                glyph.Sprite.Position = new PointF(x + used - 2 * scale, y);
                glyph.Sprite.Size = new SizeF(MenuRaster.GlyphSize * scale, MenuRaster.GlyphSize * scale);
                glyph.Sprite.Color = color; glyph.Sprite.ScaledDraw(); used += glyph.Advance * scale;
            }
            return legible;
        }

        private Glyph GetGlyph(string text, out bool exact)
        {
            exact = !unsupported.Contains(text) && budget.Admit(text); var key = exact ? text : GlyphBudget.Fallback;
            if (sprites.TryGetValue(key, out var existing)) return existing;
            byte[] bytes; float advance;
            try { bytes = MenuRaster.Glyph(key, out advance); }
            catch (InvalidDataException) when (key != GlyphBudget.Fallback) { unsupported.Add(key); exact = false; return GetGlyph(GlyphBudget.Fallback, out _); }
            var path = Path.Combine(directory, GlyphBudget.FileKey(key)); EnsureFile(path, bytes);
            var glyph = new Glyph(new CustomSprite(path, new SizeF(MenuRaster.GlyphSize, MenuRaster.GlyphSize), new PointF()), advance);
            sprites.Add(key, glyph); return glyph;
        }
        private static void EnsureFile(string path, byte[] bytes)
        {
            BridgeCatalog.RejectLinks(path);
            if (File.Exists(path))
            {
                if (new FileInfo(path).Length != bytes.Length || !File.ReadAllBytes(path).SequenceEqual(bytes))
                    throw new InvalidDataException("现有菜单纹理与本版本不一致；未覆盖现有文件。");
                return;
            }
            using (var stream = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.Read)) stream.Write(bytes, 0, bytes.Length);
        }
    }
}
