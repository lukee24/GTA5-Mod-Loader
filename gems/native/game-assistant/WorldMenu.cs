using System;
using System.Globalization;
using System.Linq;

namespace Gems.GameAssistant
{
    public static class WorldMenu
    {
        public static MenuRow[] Build(int page, WorldView view)
        {
            if (view == null) throw new ArgumentNullException(nameof(view));
            var back = new MenuRow("world-back", "返回世界与时间");
            switch (page)
            {
                case 1: return new[] {
                    new MenuRow("time-hour", "小时草稿（调值）", Number(view.Hour) + " / 23"),
                    new MenuRow("time-minute", "分钟草稿（调值）", Number(view.Minute) + " / 59"),
                    new MenuRow("time-apply", "提交时间草稿", "一次性"),
                    new MenuRow("time-day", "设为正午", "12:00"), new MenuRow("time-night", "设为夜晚", "22:00"),
                    new MenuRow("time-pause", "请求冻结时钟", view.PauseRequested ? "已请求" : "未请求"),
                    new MenuRow("time-resume", "请求解除时钟暂停"),
                    new MenuRow("time-previous", "重设本次调整前时刻", view.HasPreviousTime ? "一次性" : "无记录", view.HasPreviousTime), back };
                case 2: return new[] {
                    new MenuRow("density-ped", "行人密度（调值）", Number(view.PedPercent) + "% · " + (view.PedActive ? "请求中" : "已停止")),
                    new MenuRow("density-traffic", "交通密度（调值）", Number(view.TrafficPercent) + "% · " + (view.TrafficActive ? "请求中" : "已停止")),
                    new MenuRow("speed-scale", "世界速度草稿（调值）", Number(view.SpeedPercent) + "% · 待提交"),
                    new MenuRow("speed-apply", "提交世界速度", "一次性"),
                    new MenuRow("gravity-choice", "重力草稿（调值）", GravityLabel(view.GravityIndex)),
                    new MenuRow("gravity-apply", "提交重力", "一次性"), back };
                case 3: return new[] {
                    new MenuRow("police-ignore-on", "请求警察忽略玩家", "一次性"),
                    new MenuRow("police-ignore-off", "请求警察关注玩家", "一次性"),
                    new MenuRow("police-dispatch-on", "请求启用警察出勤", "一次性"),
                    new MenuRow("police-dispatch-off", "请求停用警察出勤", "一次性"), back };
                case 4: return WorldOptions.Weather.Select(choice => new MenuRow("weather:" + choice.Id, choice.Name, "SDK候选 · 未实测"))
                    .Concat(new[] { new MenuRow("weather-read", "读取天气记录", "不等于画面效果"), back }).ToArray();
                case 5: return new[] {
                    new MenuRow("entities-preview-freeze", "预览附近可冻结对象"),
                    new MenuRow("entities-apply-freeze", "确认冻结预览对象", view.PlanKind == "freeze" ? Number(view.PlanCount) + " 个" : "需先预览", view.PlanKind == "freeze" && view.PlanCount > 0),
                    new MenuRow("entities-restore", "恢复本助手冻结对象", Number(view.FrozenCount) + " 个", view.FrozenCount > 0),
                    new MenuRow("entities-preview-clean", "预览助手创建对象", Number(view.ManagedCount) + " 个记录"),
                    new MenuRow("entities-clean", "确认清理预览对象", view.PlanKind == "clean" ? Number(view.PlanCount) + " 个" : "需先预览", view.PlanKind == "clean" && view.PlanCount > 0),
                    new MenuRow("entities-interrupted", "中断遗留冻结", Number(view.InterruptedFrozenCount) + " 个", false),
                    new MenuRow("entities-unconfirmed", "身份失效未确认", Number(view.UnconfirmedFrozenCount) + " 个", false), back };
                default: return new[] {
                    new MenuRow("world-page:1", "时间与冻结请求"), new MenuRow("world-page:2", "密度、速度与重力"),
                    new MenuRow("world-page:3", "警察行为请求", "一次性"), new MenuRow("world-page:4", "天气候选卡片", "未实测"),
                    new MenuRow("world-page:5", "附近实体与安全清理"), new MenuRow("world-effects", "世界效果：未实测", "", false) }
                    .Concat(view.PreviousSessionPending || view.UnconfirmedFrozenCount > 0
                        ? new[] { new MenuRow("world-session-warning", "世界仍有未确认状态", "", false) } : Array.Empty<MenuRow>()).ToArray();
            }
        }

        private static string Number(int value) => value.ToString(CultureInfo.InvariantCulture);
        private static string GravityLabel(int index) => index >= 0 && index < WorldOptions.Gravity.Length
            ? WorldOptions.Gravity[index].ToString("0.0", CultureInfo.InvariantCulture) : "无效草稿";

        // Only a validated numeric row gets a slider. Its value remains part of the
        // exact render acknowledgement; the sprite never substitutes for hidden text.
        public static bool TrySlider(MenuRow row, out float fraction)
        {
            fraction = 0; int minimum, maximum;
            switch (row.Key)
            {
                case "time-hour": minimum = 0; maximum = 23; break;
                case "time-minute": minimum = 0; maximum = 59; break;
                case "density-ped": case "density-traffic": minimum = 0; maximum = 100; break;
                case "speed-scale": minimum = 10; maximum = 100; break;
                default: return false;
            }
            var separator = row.Value.IndexOfAny(new[] { ' ', '%' });
            var text = separator < 0 ? row.Value : row.Value.Substring(0, separator);
            if (!int.TryParse(text, NumberStyles.None, CultureInfo.InvariantCulture, out var number) || number < minimum || number > maximum) return false;
            fraction = (number - minimum) / (float)(maximum - minimum); return true;
        }
        public static WeatherChoice? WeatherCard(MenuRow row) => WorldOptions.Weather.FirstOrDefault(choice => row.Key == "weather:" + choice.Id);

        public static string BuiltInText => string.Join("", Enumerable.Range(0, 6).SelectMany(page =>
            new[] { new WorldView(), new WorldView { Hour = 23, Minute = 59, PedActive = true, TrafficActive = true,
                PauseRequested = true, HasPreviousTime = true, FrozenCount = 1, ManagedCount = 1, PlanCount = 1, PlanKind = "freeze" },
                new WorldView { PlanKind = "clean", PlanCount = 1, GravityIndex = -1, PreviousSessionPending = true, InterruptedFrozenCount = 2, UnconfirmedFrozenCount = 1 } }
                .SelectMany(view => Build(page, view)))
            .SelectMany(row => GlyphBudget.Elements(row.Label + row.Value)).Distinct());
    }
}
