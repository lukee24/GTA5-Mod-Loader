using Gems.GameAssistant;

public static class PlayerMotionTests
{
    private sealed class Port : IPlayerMotionPort
    {
        public PlayerMotionSession Session = new(new PlayerIdentity(1, 2, 3, 4), 1);
        public bool Allowed = true;
        public readonly List<string> Calls = new();
        public Action<string>? After;
        public bool TrySession(out PlayerMotionSession value) { value = Session; return Allowed; }
        public void ForgetSession() => Session = new(Session.Actor, Session.Epoch + 1);
        void Call(string key) { Calls.Add(key); After?.Invoke(key); }
        public void Run(PlayerMotionSession session, float value) => Call("run:" + value.ToString(System.Globalization.CultureInfo.InvariantCulture));
        public void Swim(PlayerMotionSession session, float value) => Call("swim:" + value.ToString(System.Globalization.CultureInfo.InvariantCulture));
        public void Jump(PlayerMotionSession session) => Call("jump");
    }
    public static void Run(Action<bool, string> check)
    {
        var port = new Port(); var controller = new PlayerMotionController(port);
        check(!controller.AnyEnabled, "移动请求默认关闭"); controller.Tick(); check(port.Calls.Count == 0, "关闭状态不提交");
        foreach (var action in new[] { "player-run", "player-swim" })
        {
            foreach (var bad in new[] { float.NaN, float.PositiveInfinity, float.NegativeInfinity, -0.001f, 1.5f, float.MaxValue })
            {
                var before = controller.Value(action);
                try { controller.SetMultiplier(action, bad); throw new Exception("未拒绝非法倍率"); }
                catch (ArgumentOutOfRangeException) { check(controller.Value(action) == before, "非法倍率保留原请求值 " + action + "/" + bad); }
            }
            foreach (var value in new[] { 0f, 1f, 1.499f }) { controller.SetMultiplier(action, value); check(controller.Value(action).EndsWith(value.ToString("F3", System.Globalization.CultureInfo.InvariantCulture)), "实际状态显示合法倍率 " + action + "/" + value); }
            for (var i = 0; i < 40; i++) controller.Adjust(action, 1);
            check(controller.Value(action).EndsWith("1.499"), "连续增加最大值可达 " + action);
            for (var i = 0; i < 40; i++) controller.Adjust(action, -1);
            check(controller.Value(action).EndsWith("0.000"), "连续减少最小值可达 " + action);
        }
        controller.SetMultiplier("player-run", 1.25f); controller.SetMultiplier("player-swim", 1.3f);
        controller.Toggle("player-run"); controller.Toggle("player-swim"); controller.Toggle("jump"); controller.Tick();
        check(port.Calls.SequenceEqual(new[] { "run:1.25", "swim:1.3", "jump" }), "三种实际请求各自路由");
        controller.Toggle("player-run"); port.Calls.Clear(); controller.Tick(); check(port.Calls.SequenceEqual(new[] { "swim:1.3", "jump" }), "独立关闭跑步不停止其他有效请求");
        controller.Stop("测试停止"); port.Calls.Clear(); controller.Tick(); check(port.Calls.Count == 0 && !controller.AnyEnabled, "停止不写默认倍率");
        foreach (var reason in new[] { "guard", "epoch", "actor", "throw" })
        {
            port = new Port(); controller = new PlayerMotionController(port); controller.Toggle("jump");
            if (reason == "guard") port.Allowed = false;
            if (reason == "epoch") port.ForgetSession();
            if (reason == "actor") port.Session = new(new PlayerIdentity(1, 5, 3, 4), 1);
            if (reason == "throw") port.After = _ => throw new IOException("injected");
            controller.Tick(); check(!controller.AnyEnabled, "中断撤销请求 " + reason);
            port.Allowed = true; port.After = null; port.Calls.Clear(); controller.Tick(); check(port.Calls.Count == 0, "资格恢复不自动续用旧请求 " + reason);
        }
        port = new Port(); controller = new PlayerMotionController(port);
        controller.Toggle("player-run"); controller.Toggle("player-swim"); controller.Toggle("jump");
        port.After = key => { if (key.StartsWith("swim:")) throw new IOException("partial"); }; controller.Tick();
        check(port.Calls.Count == 2 && !port.Calls.Contains("jump"), "游泳调用抛错后不提交后续跳跃");
        check(!controller.AnyEnabled && controller.LastResult.Contains("本帧已返回 跑步") && controller.LastResult.Contains("未回滚"), "部分提交明确保留已发生请求并停止");
        var rows = PlayerMenu.Build(true, 3, false, true, controller);
        check(rows.Select(r => r.Key).Distinct().Count() == rows.Length && rows.All(r => r.Key != "speed"), "玩家行键唯一且不复用车辆speed");
        check(rows.Count(r => !r.Enabled) == 2 && rows.Single(r => r.Key == "stamina").Enabled == false && rows.Single(r => r.Key == "character").Enabled == false, "无限体力和完整主角切换保持明确未实现");
    }
}
