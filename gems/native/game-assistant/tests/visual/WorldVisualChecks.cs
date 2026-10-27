using Gems.GameAssistant;
using System;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Linq;

internal static class WorldVisualChecks
{
    public static int Run(ChinesePanel panel, string root)
    {
        var count = 0;
        void Check(bool condition, string message) { if (!condition) throw new Exception(message); count++; Console.WriteLine("通过：" + message); }
        bool Draw(MenuRow[] rows, MenuViewport viewport)
        {
            GTA.UI.CustomSprite.DrawnSprites.Clear(); GTA.UI.CustomSprite.Graphics.Clear(Color.FromArgb(42, 48, 61));
            return panel.Draw("GEMS · 世界与时间", "SDK候选与请求 · 游戏效果未实测", rows, viewport,
                "密度 Enter启停；其余按所选行执行", "一次性请求不能自动恢复隐藏原状态");
        }
        void Save(string suffix) => GTA.UI.CustomSprite.Canvas.Save(Path.Combine(root, "0.1.80-stage3-ui-" + suffix + ".png"));
        var state = new WorldView { Hour = 18, Minute = 30, PedPercent = 35, TrafficPercent = 70, SpeedPercent = 55,
            PedActive = true, TrafficActive = false, PauseRequested = true, HasPreviousTime = true, FrozenCount = 3, ManagedCount = 7, PlanCount = 2, PlanKind = "freeze" };
        var view = new MenuViewport();
        for (var page = 0; page <= 5; page++)
        {
            var rows = WorldMenu.Build(page, state); view.Reset(rows.Length);
            Check(rows.Select(row => row.Key).Distinct().Count() == rows.Length, "世界子页稳定键无重复 " + page);
            for (var i = 0; i < rows.Length; i++)
            {
                view.Reset(rows.Length); view.Move(i);
                Check(Draw(rows, view), "世界子页实际文本完整显示 " + page + ":" + rows[i].Key);
                var acknowledgement = new MenuAcknowledgement(); acknowledgement.Record(rows[i], true);
                Check(acknowledgement.Allows(rows[i]) == rows[i].Enabled, "世界子页绘制确认保护禁用项 " + page + ":" + rows[i].Key);
            }
            view.Reset(rows.Length); Draw(rows, view); Save("page-" + page);
            if (page == 1 || page == 4) { view.Move(rows.Length - 1); Draw(rows, view); Save("page-" + page + "-last"); }
        }
        var weatherRows = WorldMenu.Build(4, state); view.Reset(weatherRows.Length);
        Check(weatherRows.Length == WorldOptions.Weather.Length + 2 && weatherRows.Take(WorldOptions.Weather.Length).All(row => row.Value == "SDK候选 · 未实测"), "所有天气候选明确未实测");
        Draw(weatherRows, view);
        Check(GTA.UI.CustomSprite.DrawnSprites.Count(path => Path.GetFileName(path).StartsWith("weather-", StringComparison.Ordinal)) == 8, "天气首屏8张实际卡片均绘制固定图标");
        Check(GTA.UI.CustomSprite.DrawnSprites.Any(path => Path.GetFileName(path) == "weather-thunder.png"), "雷暴卡片使用对应闪电图标");
        view.Move(14); Draw(weatherRows, view); Save("weather-snow-last");
        Check(GTA.UI.CustomSprite.DrawnSprites.Any(path => Path.GetFileName(path) == "weather-snow.png") && view.VisibleCount == 8 && GTA.Native.Function.LastMarkerY == 518, "雪天气末页图标与第8槽高亮仍可见");
        var fixedTextures = GTA.UI.CustomSprite.Images.Keys.Where(path => Path.GetFileName(Path.GetDirectoryName(path)) == "world-ui-v1").ToArray();
        Check(fixedTextures.Length == 9, "世界绘制仅6图标及3滑条固定纹理");
        var iconHashes = WorldRaster.IconNames.Select(name => Convert.ToBase64String(WorldRaster.WeatherIcon(name))).ToArray();
        Check(iconHashes.Distinct().Count() == 6, "6种天气图标像素不同");
        foreach (var icon in WorldRaster.IconNames)
        {
            var bytes = WorldRaster.WeatherIcon(icon);
            Check(bytes.SequenceEqual(WorldRaster.WeatherIcon(icon)), "固定图标重复生成字节稳定 " + icon);
            using (var stream = new MemoryStream(bytes)) using (var image = new Bitmap(stream))
                Check(image.Width == 64 && image.Height == 64 && image.GetPixel(32, 32).A > 0 && image.GetPixel(0, 0).A == 0, "天气图标尺寸与透明边缘 " + icon);
        }
        var numericKeys = new[] { "time-hour", "time-minute", "density-ped", "density-traffic", "speed-scale" };
        var minima = new[] { 0, 0, 0, 0, 10 }; var maxima = new[] { 23, 59, 100, 100, 100 };
        for (var i = 0; i < numericKeys.Length; i++)
        {
            var suffix = i < 2 ? " / " + maxima[i] : "% · 待提交";
            Check(WorldMenu.TrySlider(new MenuRow(numericKeys[i], "数值", minima[i] + suffix), out var minimum) && minimum == 0, "滑条下限 " + numericKeys[i]);
            Check(WorldMenu.TrySlider(new MenuRow(numericKeys[i], "数值", maxima[i] + suffix), out var maximum) && maximum == 1, "滑条上限 " + numericKeys[i]);
            Check(!WorldMenu.TrySlider(new MenuRow(numericKeys[i], "数值", (maxima[i] + 1) + suffix), out _) && !WorldMenu.TrySlider(new MenuRow(numericKeys[i], "数值", "NaN"), out _), "滑条拒绝越界和非数字 " + numericKeys[i]);
        }
        Check(!WorldMenu.TrySlider(new MenuRow("not-slider", "数值", "50%"), out _), "普通数值行不会被误当成滑条");
        var culture = CultureInfo.CurrentCulture;
        try { CultureInfo.CurrentCulture = new CultureInfo("ar-SA"); Check(WorldMenu.Build(1, state)[0].Value == "18 / 23" && WorldMenu.TrySlider(WorldMenu.Build(1, state)[0], out _), "不同系统区域下仍用稳定数字绘制滑条"); }
        finally { CultureInfo.CurrentCulture = culture; }
        state.PedPercent = 50; var densityRows = WorldMenu.Build(2, state); view.Reset(densityRows.Length); Draw(densityRows, view);
        Check(GTA.UI.CustomSprite.DrawnSprites.Count(path => Path.GetFileName(path) == "slider-track.png") == 3, "密度与世界速度均绘制滑条");
        // First row: x=ScaledWidth-444+35=871, y=185+25=210.
        Check(GTA.UI.CustomSprite.Canvas.GetPixel(900, 211).ToArgb() == Color.FromArgb(255, 91, 163, 255).ToArgb()
            && GTA.UI.CustomSprite.Canvas.GetPixel(1150, 211).ToArgb() == Color.FromArgb(255, 63, 79, 104).ToArgb(), "50%滑条像素同时包含已填充与未填充区域");
        var acknowledgementBeforeChange = new MenuAcknowledgement(); acknowledgementBeforeChange.Record(densityRows[0], true);
        state.PedPercent = 51;
        Check(!acknowledgementBeforeChange.Allows(WorldMenu.Build(2, state)[0]), "草稿改变后旧帧确认失效");
        state.PedPercent = 0; Draw(WorldMenu.Build(2, state), view); Save("slider-minimum");
        Check(GTA.UI.CustomSprite.Canvas.GetPixel(900, 211).ToArgb() == Color.FromArgb(255, 63, 79, 104).ToArgb(), "0%滑条不残留上帧填充");
        state.PedPercent = 100; Draw(WorldMenu.Build(2, state), view); Save("slider-maximum");
        Check(GTA.UI.CustomSprite.Canvas.GetPixel(1150, 211).ToArgb() == Color.FromArgb(255, 91, 163, 255).ToArgb(), "100%滑条覆盖末端轨道");
        var textureCount = GTA.UI.CustomSprite.Images.Count;
        for (var frame = 0; frame < 1000; frame++)
        {
            state.Hour = frame % 24; state.Minute = frame % 60; state.PedPercent = frame % 101;
            state.TrafficPercent = (frame * 7) % 101; state.SpeedPercent = 10 + frame % 91;
            state.PedActive = frame % 2 == 0; state.TrafficActive = frame % 3 == 0;
            state.PauseRequested = frame % 2 == 0;
            var dynamicRows = WorldMenu.Build(1 + frame % 2, state); view.Reset(dynamicRows.Length);
            if (!Draw(dynamicRows, view)) throw new Exception("动态滑条文本未完整显示：" + frame);
            if (GTA.UI.CustomSprite.Images.Count != textureCount) throw new Exception("动态滑条新增纹理：" + frame);
            count++;
        }
        Check(GTA.UI.CustomSprite.Images.Count == textureCount && textureCount <= GlyphBudget.Maximum + 10, "1000帧数值变化不增加纹理且保持全局预算");
        Save("dynamic-1000");
        weatherRows[0] = new MenuRow(weatherRows[0].Key, weatherRows[0].Label, new string('长', 100)); view.Reset(weatherRows.Length);
        Check(!Draw(weatherRows, view), "天气卡片副标题截断时不授予绘制确认");
        var noPlan = WorldMenu.Build(5, new WorldView());
        Check(!noPlan.Single(row => row.Key == "entities-apply-freeze").Enabled && !noPlan.Single(row => row.Key == "entities-clean").Enabled, "无实体预览时执行按钮禁用");
        state.PlanKind = "clean"; state.PlanCount = 2;
        Check(WorldMenu.Build(5, state).Single(row => row.Key == "entities-clean").Enabled && !WorldMenu.Build(5, state).Single(row => row.Key == "entities-apply-freeze").Enabled, "清理计划不会启用冻结确认");
        var confirmationRows = WorldMenu.Build(3, state); view.Reset(confirmationRows.Length);
        var policeWarning = "再次确认：忽略玩家并停止NPC警车；停车运动不能还原。";
        GTA.UI.CustomSprite.Graphics.Clear(Color.FromArgb(42, 48, 61));
        Check(panel.Draw("GEMS · 世界与时间", "警方一次性设置 · 未实测", confirmationRows, view, policeWarning), "实际警方副作用确认完整换行后才可执行");
        Save("police-confirmation-wrap");
        var cleanWarning = "再次确认删除本实例临时车辆；不可撤销，乘员/任务变化将跳过。";
        confirmationRows = WorldMenu.Build(5, state); view.Reset(confirmationRows.Length); view.Move(4);
        GTA.UI.CustomSprite.Graphics.Clear(Color.FromArgb(42, 48, 61));
        Check(panel.Draw("GEMS · 世界与时间", "临时实体清理 · 未实测", confirmationRows, view, cleanWarning, "计划仅当前会话有效"), "不可撤销清理确认及附加说明完整可见");
        Save("clean-confirmation-wrap");
        Check(!panel.Draw("GEMS", "", confirmationRows, view, new string('长', 200)), "确认提示超过三行时不授予执行确认");
        Check(!panel.Draw("GEMS", "", confirmationRows, view, cleanWarning, new string('长', 100)), "附加说明挤出三行预算时不授予执行确认");
        Check(!panel.Draw("GEMS", "", confirmationRows, view, "确认\n非法字符"), "确认提示非法字符不授予执行确认");
        state.PreviousSessionPending = true; state.InterruptedFrozenCount = 4;
        var interruptedHub = WorldMenu.Build(0, state); var interruptedRow = interruptedHub.Single(row => row.Key == "world-session-warning");
        Check(!interruptedRow.Enabled && interruptedRow.Label == "世界仍有未确认状态" && interruptedHub.Any(row => row.Key == "world-effects" && row.Label == "世界效果：未实测"), "会话中断持久警示与未实测状态同时显示");
        view.Reset(interruptedHub.Length); Draw(interruptedHub, view); Save("interrupted-hub");
        WorldMenu.Build(4, state); // A category change must not consume or erase the persistent state.
        var interruptedEntities = WorldMenu.Build(5, state); var interruptedCount = interruptedEntities.Single(row => row.Key == "entities-interrupted");
        Check(!interruptedCount.Enabled && interruptedCount.Value == "4 个" && WorldMenu.Build(0, state).Single(row => row.Key == "world-session-warning").Label == interruptedRow.Label, "切页后中断遗留数量和警示仍可见");
        view.Reset(interruptedEntities.Length); Draw(interruptedEntities, view); Save("interrupted-entities");
        state.PreviousSessionPending = false; state.UnconfirmedFrozenCount = 2;
        var unconfirmed = WorldMenu.Build(5, state); var unconfirmedRow = unconfirmed.Single(row => row.Key == "entities-unconfirmed");
        Check(!unconfirmedRow.Enabled && unconfirmedRow.Value == "2 个" && WorldMenu.Build(0, state).Any(row => row.Key == "world-session-warning"), "身份失效未确认数量单独保留且触发主菜单警示");
        view.Reset(unconfirmed.Length); view.Move(unconfirmed.Length - 1);
        Check(Draw(unconfirmed, view) && view.VisibleCount == 8, "新增未确认状态仍完整显示可执行返回行");
        Save("unconfirmed-entities");
        Console.WriteLine("Stage3世界菜单：" + count + " 项；包含1000帧数值变化。离线GDI端口，不是游戏实测。");
        return count;
    }
}
