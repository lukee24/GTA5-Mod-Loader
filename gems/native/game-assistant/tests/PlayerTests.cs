using Gems.GameAssistant;
public static class PlayerTests
{
    public static void Run(Action<bool, string> check)
    {
        for (var refused = 0; refused < 5; refused++)
        {
            var calls = 0; var index = -1;
            bool Probe() { calls++; index++; if (index >= refused) throw new Exception("拒绝后继续探测"); return index == refused - 1; }
            var result = StoryGuard.Probe(refused != 0, Probe, Probe, Probe, Probe, () => throw new Exception("拒绝后读取角色"));
            check(!result && calls == refused, "守卫按顺序短路 " + refused);
        }
        check(StoryGuard.Probe(true, () => false, () => false, () => false, () => false, () => true), "完整故事上下文通过纯模型检查");
        foreach (var value in new[] { int.MinValue, -1, 0, 1, 4, 5, 6, int.MaxValue })
            check(PlayerRules.Wanted(value) == Math.Clamp(value, 0, 5), "通缉请求限制0..5 " + value);
        check(PlayerRules.AdjustWanted(int.MaxValue, 1) == 5 && PlayerRules.AdjustWanted(int.MinValue, -1) == 0, "通缉调整极端输入不发生整数溢出");
        foreach (var value in new[] { 0, 100, 200, 65535 }) check(PlayerRules.Armor(value) == value, "护甲采用实际合法上限 " + value);
        foreach (var value in new[] { -1, 65536 }) { try { PlayerRules.Armor(value); throw new Exception("未拒绝护甲上限"); } catch (ArgumentOutOfRangeException) { check(true, "拒绝非法护甲上限 " + value); } }
        var original = new PlayerIdentity(0, 11, 22, 33); var next = new PlayerIdentity(0, 12, 22, 33);
        var request = new FrameRequest();
        check(!request.Allows(true, original), "超级跳跃默认无每帧请求");
        request.Toggle(original); check(request.Allows(true, original), "超级跳跃仅绑定目标生效");
        check(!request.Allows(false, original) && !request.Enabled && !request.Allows(true, original), "守卫拒绝后不自动恢复超级跳跃请求");
        request.Toggle(original); check(!request.Allows(true, next) && !request.Enabled, "角色身份变化停止超级跳跃请求");
        request.Toggle(original); request.Toggle(original); check(!request.Enabled, "再次操作停止超级跳跃请求");
        request.Toggle(original); request.Stop(); check(!request.Allows(true, original), "恢复开关清除每帧请求");
    }
}
