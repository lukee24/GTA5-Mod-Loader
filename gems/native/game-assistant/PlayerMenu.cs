namespace Gems.GameAssistant
{
    public static class PlayerMenu
    {
        public static MenuRow[] Build(bool invincible, int wanted, bool visible, bool coordinates, PlayerMotionController motion)
            => new[] {
                new MenuRow("invincible", "无敌模式", invincible ? "开" : "关"),
                new MenuRow("health", "恢复生命"), new MenuRow("armor", "恢复护甲"), new MenuRow("clear-wanted", "清除通缉"),
                new MenuRow("wanted", "通缉等级（可调值）", wanted.ToString()),
                new MenuRow("stamina", "无限体力", "接口待验证", false),
                new MenuRow("jump", "超级跳跃持续请求", motion.Value("jump")),
                new MenuRow("player-run", "跑步／冲刺倍率", motion.Value("player-run")),
                new MenuRow("player-swim", "游泳倍率", motion.Value("player-swim")),
                new MenuRow("player-motion-stop", "停止本助手移动请求"),
                new MenuRow("invisible", "隐身模式", visible ? "关" : "开"),
                new MenuRow("character", "故事主角切换", "未实现", false),
                new MenuRow("coordinates", "显示当前坐标", coordinates ? "开" : "关"),
                new MenuRow("restore", "恢复本助手可恢复开关") };
    }
}
