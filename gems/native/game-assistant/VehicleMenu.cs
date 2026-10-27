using System.Linq;

namespace Gems.GameAssistant
{
    public static class VehicleMenu
    {
        public static MenuRow[] Build(int page, bool valid, bool engine, bool invincible, float speedKmh, bool favorite, string confirmation)
        {
            if (page == 1) return new[] { new MenuRow("paint-primary", "主车身颜色", "输入6位HEX"), new MenuRow("paint-secondary", "副车身颜色", "输入6位HEX"), new MenuRow("vehicle-back", "返回当前车辆") };
            if (page == 2) return new[] { new MenuRow("windows-down", "降下汽车全部车窗", "请求"), new MenuRow("windows-up", "升起汽车前后四窗", "请求"), new MenuRow("vehicle-back", "返回当前车辆") };
            if (page == 3) return new[] { new MenuRow("lights", confirmation == "lights" ? "确认强制主灯设置" : "强制主灯开关", "不自动恢复"), new MenuRow("interior", "车内灯开关", "条件恢复"), new MenuRow("vehicle-back", "返回当前车辆") };
            MenuRow Row(string key, string label, string value = "") => new MenuRow(key, confirmation == key ? "确认：" + label : label, valid ? value : "请进入车辆", valid);
            return new[] {
                Row("repair", "修复当前车辆"), Row("clean", "清洗当前车辆"), Row("upright", "停稳平地翻正"),
                Row("performance", "性能槽最高档", "一次性"), Row("paint-menu", "更换主/副车身颜色"), Row("plate", "更换车牌", "一次性"),
                Row("engine", "引擎开关", engine ? "开" : "关"), Row("vehicle-invincible", "车辆无敌", invincible ? "开" : "关"),
                Row("doors-open", "打开完好车门"), Row("doors-close", "关闭完好车门"), Row("windows-menu", "车窗控制"), Row("lights-menu", "灯光控制"),
                Row("tires", "修复爆胎"), Row("suspension", "悬挂改装下一档", "一次性"),
                Row("speed", "速度：执行停止 / 调值5", VehicleRules.Finite(speedKmh) ? speedKmh.ToString("F1") + "km/h" : "读回无效"),
                Row("favorite", "收藏当前车型", favorite ? "已收藏" : "未收藏"), new MenuRow("restore-vehicle", "恢复本助手车辆开关") };
        }
        public static string BuiltInText => string.Join("", Enumerable.Range(0, 4)
            .SelectMany(page => new[] { true, false }.SelectMany(valid => new[] { "", "performance", "suspension", "lights" }
                .SelectMany(confirmation => Build(page, valid, valid, valid, 0, valid, confirmation))))
            .SelectMany(row => GlyphBudget.Elements(row.Label + row.Value)).Distinct());
    }
}
