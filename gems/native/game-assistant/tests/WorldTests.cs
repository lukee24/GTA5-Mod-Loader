using Gems.GameAssistant;

// Exercises the production controller through its real boundary interface. The fake port
// records requests and failures only; it does not emulate GTA physics or prove game effects.
public static class WorldTests
{
    private static readonly PlayerIdentity Actor = new(0, 101, 201, 301);
    private static readonly WorldSession Session = new(Actor, "Enhanced-test-build");

    public static void Run(Action<bool, string> check)
    {
        void Check(bool condition, string name) => check(condition, "世界控制：" + name);
        Contracts(Check);
        GuardAndDensity(Check);
        TimeAndRequests(Check);
        InvalidDrafts(Check);
        FreezeAndRestore(Check);
        ManagedCleanup(Check);
        PersistentEvidence(Check);
    }

    private static void PersistentEvidence(Action<bool, string> check)
    {
        var port = new FakePort(); var controller = new WorldController(port);
        controller.Execute("time-pause"); controller.Suspend();
        check(controller.View.GlobalRequestCount == 0 && !controller.View.PreviousSessionPending,
            "只有未提交确认时不虚构全局写入或未恢复状态");

        foreach (var request in new[] {
            ("time-day", "set-time"), ("time-pause", "pause-clock"), ("time-resume", "pause-clock"),
            ("speed-apply", "time-scale"), ("gravity-apply", "gravity"),
            ("police-ignore-on", "police-ignore"), ("police-dispatch-off", "police-dispatch"),
            ("weather:Clear", "set-weather") })
        {
            port = new FakePort { FailAfter = operation => operation == request.Item2 };
            controller = new WorldController(port);
            Denied(() => controller.Execute(request.Item1));
            if (controller.View.GlobalRequestCount == 0) Denied(() => controller.Execute(request.Item1));
            check(controller.View.GlobalRequestCount == 1 && port.Count(request.Item2) == 1,
                "全局 setter 写后异常仍记录已尝试请求：" + request.Item1);
            controller.Suspend();
            check(controller.View.PreviousSessionPending && controller.View.GlobalRequestCount == 1,
                "中断后持续保留一次性设置未自动恢复标记：" + request.Item1);
            port.FailAfter = null; port.CurrentSession = new WorldSession(Actor, "next-session");
            controller.Execute("weather-read"); controller.Execute("time-hour", 1); controller.Abort();
            check(controller.View.PreviousSessionPending && controller.View.GlobalRequestCount == 1,
                "新会话操作与 Abort 不抹除旧会话待核对标记：" + request.Item1);
        }

        port = new FakePort(); controller = new WorldController(port);
        var first = Entity(951); port.Entities.Add(first.Identity, first);
        controller.Execute("entities-preview-freeze"); controller.Execute("entities-apply-freeze"); controller.Suspend();
        check(controller.View.InterruptedFrozenCount == 1 && controller.View.FrozenCount == 1 && controller.View.PreviousSessionPending,
            "守卫中断冻结对象同时保留累计数量和持久待核对标记");
        port.CurrentSession = new WorldSession(Actor, "second-session");
        var second = Entity(952); port.Entities.Add(second.Identity, second);
        controller.Execute("entities-preview-freeze"); controller.Execute("entities-apply-freeze"); controller.Suspend();
        check(controller.View.InterruptedFrozenCount == 2 && controller.View.FrozenCount == 2 && controller.View.PreviousSessionPending,
            "后续会话发生新冻结中断时累计遗留数量不覆盖第一次记录");
        controller.Execute("entities-restore"); controller.Execute("weather-read");
        check(controller.View.InterruptedFrozenCount == 2 && controller.View.FrozenCount == 2 && controller.View.PreviousSessionPending,
            "无法证明连续性的旧冻结不假装恢复，也不会被新反馈覆盖");

        port = new FakePort(); controller = new WorldController(port);
        controller.View.GlobalRequestCount = int.MaxValue;
        controller.Execute("time-day"); controller.Suspend();
        check(controller.View.GlobalRequestCount == int.MaxValue && controller.View.PreviousSessionPending,
            "全局请求计数达到上限时饱和，不溢出为负或清掉待核对状态");
    }

    private static void GuardAndDensity(Action<bool, string> check)
    {
        var blocked = new FakePort { Allowed = false };
        var controller = new WorldController(blocked);
        Denied(controller.Tick);
        foreach (var key in new[] { "time-hour", "time-minute", "time-apply", "time-day", "time-night", "time-pause", "time-resume", "time-previous",
            "density-ped", "density-traffic", "speed-scale", "speed-apply", "gravity-choice", "gravity-apply", "police-ignore-on", "police-ignore-off",
            "police-dispatch-on", "police-dispatch-off", "weather:Clear", "weather-read", "entities-preview-freeze", "entities-apply-freeze",
            "entities-restore", "entities-preview-clean", "entities-clean" })
        {
            Denied(() => controller.Execute(key));
            Denied(() => controller.Execute(key));
        }
        controller.Suspend();
        controller.Abort();
        check(blocked.Calls.Count == 0 && blocked.Mutations.Count == 0,
            "初始故事守卫拒绝时 Tick、所有动作、Suspend、Abort 均不调用游戏端口");

        var port = new FakePort();
        controller = new WorldController(port);
        controller.Tick();
        controller.Execute("density-ped", -1);
        controller.Execute("density-traffic", -1);
        controller.Tick();
        check(port.Count("ped-density") == 0 && port.Count("traffic-density") == 0,
            "修改密度草稿但未开启时不发送逐帧请求");
        controller.Execute("density-ped");
        controller.Execute("density-traffic");
        port.Mutations.Clear();
        controller.Tick();
        check(port.Count("ped-density") == 1 && port.Count("traffic-density") == 1,
            "开启的每种密度每个允许 Tick 最多请求一次");
        check((float)port.Last("ped-density")! == controller.View.PedPercent / 100f &&
            (float)port.Last("traffic-density")! == controller.View.TrafficPercent / 100f,
            "密度请求采用界面实际倍率");
        controller.Execute("density-ped");
        controller.Execute("density-traffic");
        port.Mutations.Clear();
        controller.Tick();
        check(port.Count("ped-density") == 0 && port.Count("traffic-density") == 0,
            "关闭密度只停止请求，不写默认一倍冒充恢复");

        controller.Execute("density-ped");
        controller.Execute("density-traffic");
        port.Allowed = false;
        port.Calls.Clear();
        port.Mutations.Clear();
        Denied(controller.Tick);
        check(port.Calls.Count == 0 && !controller.View.PedActive && !controller.View.TrafficActive,
            "守卫失效立即停用两个逐帧请求且不进行恢复写入");
        port.Allowed = true;
        controller.Tick();
        check(port.Mutations.Count == 0, "守卫恢复不自动重启旧密度请求");

        controller.Execute("density-ped");
        controller.Execute("density-traffic");
        port.CurrentSession = new WorldSession(Actor, "other-build");
        port.Mutations.Clear();
        controller.Tick();
        check(port.Mutations.Count == 0 && !controller.View.PedActive && !controller.View.TrafficActive,
            "同一角色但游戏版本变化也停止旧持续请求");
        controller.Execute("density-ped");
        controller.Suspend();
        port.Mutations.Clear();
        controller.Tick();
        check(port.Mutations.Count == 0 && !controller.View.PedActive, "显式 Suspend 停止持续请求");

        port = new FakePort();
        controller = new WorldController(port);
        controller.Tick();
        controller.Execute("density-ped");
        port.OnCall = operation => { if (operation == "ped-density") port.Allowed = false; };
        Denied(controller.Tick);
        check(port.Count("ped-density") == 0, "Tick 与写入边界间守卫失效时不实际写入密度");
        check(!controller.View.PedActive && !controller.View.TrafficActive,
            "控制器捕获密度边界异常后先停止请求再向调用方报告");

        port = new FakePort(); controller = new WorldController(port);
        controller.Execute("density-ped"); controller.Execute("density-traffic");
        port.FailBefore = operation => operation == "traffic-density";
        Denied(controller.Tick);
        check(port.Count("ped-density") == 1 && port.Count("traffic-density") == 0 &&
            !controller.View.PedActive && !controller.View.TrafficActive,
            "同帧交通请求失败时承认行人请求已发送并停止后续两个持续请求");
        port.FailBefore = null; controller.Tick();
        check(port.Count("ped-density") == 1 && port.Count("traffic-density") == 0,
            "部分逐帧失败后下一帧不自行恢复请求");
    }

    private static void InvalidDrafts(Action<bool, string> check)
    {
        foreach (var damage in new Action<WorldView>[] {
            view => view.Hour = -1, view => view.Hour = 24, view => view.Minute = -1, view => view.Minute = 60,
            view => view.PedPercent = -1, view => view.PedPercent = 101,
            view => view.TrafficPercent = -1, view => view.TrafficPercent = 101,
            view => view.SpeedPercent = 0, view => view.SpeedPercent = 101,
            view => view.GravityIndex = -1, view => view.GravityIndex = 4 })
        {
            var port = new FakePort(); var controller = new WorldController(port);
            damage(controller.View);
            var rejected = false;
            try { controller.Execute("time-apply"); } catch (ArgumentOutOfRangeException) { rejected = true; }
            check(rejected && port.Calls.Count == 0 && port.Mutations.Count == 0,
                "公开视图中的非法草稿在任何读取写入前拒绝");
            controller.View.PedActive = controller.View.TrafficActive = true;
            rejected = false;
            try { controller.Tick(); } catch (ArgumentOutOfRangeException) { rejected = true; }
            check(rejected && port.Mutations.Count == 0 && !controller.View.PedActive && !controller.View.TrafficActive,
                "Tick 遇非法草稿停止两种密度请求并保持零写入");
        }
    }

    private static void Denied(Action action)
    {
        try { action(); }
        catch (InvalidOperationException) { }
        catch (IOException) { }
    }

    private static void TimeAndRequests(Action<bool, string> check)
    {
        var port = new FakePort();
        var controller = new WorldController(port);
        foreach (var key in new[] { "time-hour", "time-minute", "density-ped", "density-traffic", "speed-scale", "gravity-choice" })
        foreach (var delta in new[] { int.MinValue, -2, 2, int.MaxValue })
        {
            var rejected = false;
            try { controller.Execute(key, delta); } catch (ArgumentOutOfRangeException) { rejected = true; }
            check(rejected && port.Mutations.Count == 0, "拒绝越界步长防止乘法溢出：" + key + " / " + delta);
        }
        for (var step = 0; step < 65; step++) { controller.Execute("time-hour", 1); controller.Execute("time-minute", 1); }
        check(controller.View.Hour == 23 && controller.View.Minute == 59 && port.Mutations.Count == 0,
            "时分草稿重复正步长夹紧且不写游戏");
        controller.Execute("time-apply");
        check(port.Count("set-time") == 1 && port.Time == new TimeSpan(23, 59, 0),
            "时分确认只提交一个完整时刻且秒清零");
        check(controller.View.HasPreviousTime && port.Calls.Count(item => item == "read-time") == 2,
            "调时前后分别读取，建立真实旧时刻记录");
        controller.Execute("time-day");
        check(port.Time == new TimeSpan(12, 0, 0), "白天预设准确请求中午十二点");
        controller.Execute("time-night");
        check(port.Time == new TimeSpan(22, 0, 0), "夜晚预设准确请求二十二点");
        var writes = port.Count("set-time");
        controller.Execute("time-previous");
        check(port.Count("set-time") == writes, "重设旧时刻的首次点击仅确认");
        controller.Execute("time-previous");
        check(port.Count("set-time") == writes + 1 && port.Time == new TimeSpan(12, 30, 15),
            "重设保留第一次调整前时刻与秒，不冒充时间倒流");
        for (var step = 0; step < 65; step++) { controller.Execute("time-hour", -1); controller.Execute("time-minute", -1); }
        check(controller.View.Hour == 0 && controller.View.Minute == 0, "时分草稿重复负步长夹紧至零");
        controller.Suspend();
        controller.Execute("time-previous");
        controller.Execute("time-previous");
        check(!controller.View.HasPreviousTime && port.Count("set-time") == writes + 1,
            "会话中断清除旧时刻快照，不能在新会话重放");

        foreach (var invalid in new[] { TimeSpan.FromTicks(-1), TimeSpan.FromDays(1), TimeSpan.FromDays(2), TimeSpan.FromTicks(1) })
        {
            port = new FakePort { Time = invalid };
            controller = new WorldController(port);
            Denied(() => controller.Execute("time-day"));
            check(port.Count("set-time") == 0 && !controller.View.HasPreviousTime,
                "无效读取不写入也不创建旧时刻快照：" + invalid.Ticks);
        }
        port = new FakePort { FailBefore = operation => operation == "read-time" };
        controller = new WorldController(port);
        Denied(() => controller.Execute("time-apply"));
        check(port.Mutations.Count == 0 && !controller.View.HasPreviousTime, "读取旧时刻失败时不触发调时");
        port = new FakePort(); controller = new WorldController(port);
        var reads = 0;
        port.OnCall = operation => { if (operation == "read-time" && ++reads == 2) port.Time = TimeSpan.FromDays(1); };
        Denied(() => controller.Execute("time-day"));
        check(port.Count("set-time") == 1 && controller.View.HasPreviousTime && !controller.View.Notice.Contains("请求完成"),
            "调时写入后非法读回保留旧记录且不显示请求完成");
        port = new FakePort { FailAfter = operation => operation == "set-time" };
        controller = new WorldController(port);
        Denied(() => controller.Execute("time-night"));
        check(port.Time == new TimeSpan(22, 0, 0) && controller.View.HasPreviousTime,
            "调时写后异常保留第一次旧时刻");
        port.FailAfter = null;
        controller.Execute("time-previous"); controller.Execute("time-previous");
        check(port.Time == new TimeSpan(12, 30, 15), "调时写后异常可通过明确重设动作恢复记录时刻");

        port = new FakePort(); controller = new WorldController(port);
        controller.Execute("time-pause");
        check(port.Count("pause-clock") == 0, "冻结时钟先确认未知原状态提示");
        controller.Execute("time-pause");
        check(port.Paused && port.Count("pause-clock") == 1 && controller.View.PauseRequested,
            "冻结时钟确认后仅发送一次 true");
        controller.Abort();
        check(port.Paused && port.Count("pause-clock") == 1, "退出不凭默认值解除未知外部时钟暂停");
        controller.Execute("time-resume"); controller.Execute("time-resume");
        check(!port.Paused && port.Count("pause-clock") == 2, "解除暂停是再次确认的独立主动请求");

        port = new FakePort(); controller = new WorldController(port);
        for (var step = 0; step < 15; step++) { controller.Execute("density-ped", 1); controller.Execute("density-traffic", -1); }
        check(controller.View.PedPercent == 100 && controller.View.TrafficPercent == 0,
            "密度重复步长保持零至百分之一百边界");
        for (var step = 0; step < 15; step++) controller.Execute("speed-scale", -1);
        check(controller.View.SpeedPercent == 10, "世界速度重复减速夹紧至百分之十");
        controller.Execute("speed-apply");
        check(port.Count("time-scale") == 0, "世界速度首次点击仅确认");
        controller.Execute("speed-apply");
        check((float)port.Last("time-scale")! == 0.1f, "确认后的世界速度准确请求零点一");
        for (var step = 0; step < 15; step++) controller.Execute("speed-scale", 1);
        check(controller.View.SpeedPercent == 100, "世界速度重复加速夹紧至百分之一百");
        for (var index = 0; index < 4; index++)
        {
            controller.Execute("gravity-apply"); controller.Execute("gravity-apply");
            check((float)port.Last("gravity")! == WorldOptions.Gravity[index], "重力确认请求准确预设 " + index);
            controller.Execute("gravity-choice", 1);
        }
        check(controller.View.GravityIndex == 0, "四个重力预设循环回首项");

        foreach (var key in new[] { "police-ignore-on", "police-ignore-off", "police-dispatch-on", "police-dispatch-off" })
        {
            var operation = key.StartsWith("police-ignore-") ? "police-ignore" : "police-dispatch";
            var before = port.Count(operation);
            controller.Execute(key);
            check(port.Count(operation) == before, "警方设置首次点击仅确认：" + key);
            controller.Execute(key);
            check(port.Count(operation) == before + 1 && (bool)port.Last(operation)! == key.EndsWith("-on"),
                "警方设置准确一次布尔请求：" + key);
        }
        foreach (var weather in WorldOptions.Weather)
        {
            var before = port.Count("set-weather");
            controller.Execute("weather:" + weather.Id);
            check(port.Count("set-weather") == before, "天气候选首次点击仅确认：" + weather.Id);
            controller.Execute("weather:" + weather.Id);
            check(port.Count("set-weather") == before + 1 && (string)port.Last("set-weather")! == weather.Id,
                "天气候选准确接线：" + weather.Id);
        }
        foreach (var invalid in new[] { "weather:Unknown", "weather:HeavyRain", "weather:clear", "weather:", "police-unknown", "unknown" })
        {
            var before = port.Mutations.Count;
            var rejected = false;
            try { controller.Execute(invalid); } catch (ArgumentException) { rejected = true; }
            check(rejected && port.Mutations.Count == before, "非法动作无写入：" + invalid);
        }

        var clock = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        port = new FakePort(); controller = new WorldController(port, () => clock);
        controller.Execute("weather:Clear"); clock = clock.AddSeconds(11); controller.Execute("weather:Clear");
        check(port.Count("set-weather") == 0, "过期确认不能执行天气请求");
        controller.Execute("weather:Clear");
        check(port.Count("set-weather") == 1, "过期后重新确认可执行一次");
        controller.Execute("weather:Raining");
        port.CurrentSession = new WorldSession(new PlayerIdentity(0, 102, 201, 302), Session.Build);
        controller.Execute("weather:Raining");
        check(port.Count("set-weather") == 1, "角色身份变化丢弃旧天气确认");
        controller.Execute("weather:Raining");
        check(port.Count("set-weather") == 2, "新角色需要重新确认才执行天气请求");
    }

    private static void FreezeAndRestore(Action<bool, string> check)
    {
        var port = new FakePort();
        var first = Entity(); port.Entities.Add(first.Identity, first);
        var controller = new WorldController(port);
        controller.Execute("entities-preview-freeze");
        check(controller.View.PlanKind == "freeze" && controller.View.PlanCount == 1 && port.Mutations.Count == 0,
            "冻结预览只读并报告实际候选数");
        var later = Entity(502); port.Entities.Add(later.Identity, later);
        controller.Execute("entities-apply-freeze");
        check(port.Count("set-frozen") == 1 && port.Entities[first.Identity].Frozen && !port.Entities[later.Identity].Frozen,
            "冻结只处理预览目标，不抓取后续出现的附近实体");
        check(controller.View.FrozenCount == 1 && controller.View.PlanCount == 0,
            "冻结读回后保留单个恢复记录并消费计划");
        controller.Execute("entities-restore");
        check(!port.Entities[first.Identity].Frozen && port.Count("set-frozen") == 2 && controller.View.FrozenCount == 0,
            "同身份安全目标可条件恢复原未冻结状态");
        controller.Execute("entities-restore");
        check(port.Count("set-frozen") == 2, "再次恢复不重复写已处理实体");

        var excluded = new[] {
            Entity(510, frozen: true), Entity(511, owned: true), Entity(512, persistent: true),
            Entity(513, occupied: true), Entity(514, attached: true), Entity(515, player: true),
            Entity(516, playerVehicle: true), Entity(517, distance: 10.01f), Entity(518, distance: -1),
            Entity(519, distance: float.NaN), Entity(520, speed: 0.51f), Entity(521, speed: -1),
            Entity(522, speed: float.PositiveInfinity), Entity(523, kind: "prop"),
            Copy(Entity(524), identity: new PlayerIdentity(0, 524, 601, 0)) };
        foreach (var entity in excluded)
        {
            port = new FakePort { NearbyOverride = new[] { entity } };
            port.Entities.Add(entity.Identity, entity);
            controller = new WorldController(port);
            controller.Execute("entities-preview-freeze");
            Denied(() => controller.Execute("entities-apply-freeze"));
            controller.Execute("entities-restore");
            check(controller.View.PlanCount == 0 && port.Count("set-frozen") == 0,
                "冻结与恢复均排除不安全样本 " + entity.Identity.PedHandle);
        }
        var boundary = Entity(530, distance: 10, speed: 0.5f, kind: "ped");
        port = new FakePort(); port.Entities.Add(boundary.Identity, boundary); controller = new WorldController(port);
        controller.Execute("entities-preview-freeze"); controller.Execute("entities-apply-freeze");
        check(port.Count("set-frozen") == 1, "普通行人在十米与零点五米每秒边界可进入限定冻结");

        port = new FakePort(); controller = new WorldController(port);
        var many = Enumerable.Range(600, 40).Select(handle => Entity(handle)).ToArray();
        foreach (var entity in many) port.Entities.Add(entity.Identity, entity);
        port.NearbyOverride = many.Concat(new[] { many[0], many[0] }).ToArray();
        controller.Execute("entities-preview-freeze"); controller.Execute("entities-apply-freeze");
        check(port.Count("set-frozen") == 32 && port.Mutations.Select(item => item.Entity).Distinct().Count() == 32,
            "冻结计划最多三十二个唯一目标，重复身份不会重复写入");
        controller.Execute("entities-preview-freeze");
        check(controller.View.PlanCount == 0 && controller.View.FrozenCount == 32,
            "未恢复的冻结记录累计达到三十二后不能靠新预览绕过上限");
        controller.Execute("entities-restore"); controller.Execute("entities-preview-freeze");
        check(controller.View.FrozenCount == 0 && controller.View.PlanCount == 32,
            "已确认恢复的冻结记录释放累计名额");

        port = new FakePort(); first = Entity(); port.Entities.Add(first.Identity, first); controller = new WorldController(port);
        controller.Execute("entities-preview-freeze");
        port.Entities[first.Identity] = Copy(first, identity: new PlayerIdentity(0, first.Identity.PedHandle, 601, 99999));
        controller.Execute("entities-apply-freeze");
        check(port.Count("set-frozen") == 0, "预览后相同 handle 的新内存地址不能沿用旧计划");

        port = new FakePort(); port.Entities.Add(first.Identity, first); controller = new WorldController(port);
        controller.Execute("entities-preview-freeze"); controller.Execute("entities-apply-freeze");
        port.Entities[first.Identity] = Copy(first, frozen: false);
        var before = port.Count("set-frozen");
        controller.Execute("entities-restore");
        check(port.Count("set-frozen") == before && controller.View.FrozenCount == 0,
            "外部已解除冻结时不再写入，不强制覆盖外部状态");

        foreach (var lostIdentity in new[] { "missing", "address", "model" })
        {
            port = new FakePort(); port.Entities.Add(first.Identity, first); controller = new WorldController(port);
            controller.Execute("entities-preview-freeze"); controller.Execute("entities-apply-freeze");
            if (lostIdentity == "missing") port.Entities.Remove(first.Identity);
            else port.Entities[first.Identity] = Copy(port.Entities[first.Identity], identity:
                new PlayerIdentity(first.Identity.PlayerHandle, first.Identity.PedHandle,
                    lostIdentity == "model" ? 999 : first.Identity.ModelHash,
                    lostIdentity == "address" ? 99999 : first.Identity.Address));
            controller.Execute("entities-restore");
            check(port.Count("set-frozen") == 1 && controller.View.UnconfirmedFrozenCount == 1 && controller.View.FrozenCount == 1,
                "恢复时身份失效累计未确认，不能当成成功归零：" + lostIdentity);
            controller.Execute("entities-restore");
            check(controller.View.UnconfirmedFrozenCount == 1 && controller.View.FrozenCount == 1 && port.Count("set-frozen") == 1,
                "再次恢复既不重复累计也不写入复用身份：" + lostIdentity);
            controller.Suspend(); controller.Execute("weather-read");
            check(controller.View.UnconfirmedFrozenCount == 1 && controller.View.FrozenCount == 1 && controller.View.PreviousSessionPending,
                "下一会话的新反馈保留身份失效的待核对状态：" + lostIdentity);
        }

        foreach (var change in new Func<WorldEntity, WorldEntity>[] {
            item => Copy(item, occupied: true), item => Copy(item, owned: true), item => Copy(item, persistent: true),
            item => Copy(item, attached: true), item => Copy(item, playerVehicle: true), item => Copy(item, distance: 11) })
        {
            port = new FakePort(); port.Entities.Add(first.Identity, first); controller = new WorldController(port);
            controller.Execute("entities-preview-freeze"); controller.Execute("entities-apply-freeze");
            port.Entities[first.Identity] = change(port.Entities[first.Identity]);
            controller.Execute("entities-restore");
            check(port.Count("set-frozen") == 1 && controller.View.FrozenCount == 1,
                "恢复前出现占用、归属或安全范围变化时保留未恢复记录");
        }

        foreach (var after in new[] { false, true })
        {
            port = new FakePort(); port.Entities.Add(first.Identity, first); controller = new WorldController(port);
            if (after) port.FailAfter = operation => operation == "set-frozen";
            else port.FailBefore = operation => operation == "set-frozen";
            controller.Execute("entities-preview-freeze");
            var result = controller.Execute("entities-apply-freeze");
            check(controller.View.FrozenCount == 1 && result.Contains("失败/未确认 1"),
                (after ? "写后" : "写前") + "异常保留冻结记录且不报告完成");
            port.FailBefore = null; port.FailAfter = null;
            controller.Execute("entities-restore");
            check(!port.Entities[first.Identity].Frozen && controller.View.FrozenCount == 0,
                (after ? "写后" : "写前") + "异常可安全重新核对并恢复");
        }

        port = new FakePort(); port.Entities.Add(first.Identity, first); controller = new WorldController(port);
        var reads = 0;
        port.OnCall = operation => { if (operation == "read-entity" && ++reads == 2) port.Entities[first.Identity] = first; };
        controller.Execute("entities-preview-freeze");
        var mismatch = controller.Execute("entities-apply-freeze");
        check(port.Count("set-frozen") == 1 && controller.View.FrozenCount == 1 && mismatch.Contains("读回 0") && mismatch.Contains("失败/未确认 1"),
            "冻结请求发出但读回不符时保留未确认记录且不声称冻结成功");
        port.OnCall = null; controller.Execute("entities-restore");
        check(port.Count("set-frozen") == 1 && controller.View.FrozenCount == 0,
            "冻结读回不符后再次读取已为原值时核销，不重复写入");

        port = new FakePort(); port.Entities.Add(first.Identity, first); port.Entities.Add(later.Identity, later);
        var attempts = 0;
        port.FailBefore = operation => operation == "set-frozen" && ++attempts == 2;
        controller = new WorldController(port);
        controller.Execute("entities-preview-freeze");
        var partial = controller.Execute("entities-apply-freeze");
        check(port.Count("set-frozen") == 1 && partial.Contains("读回 1") && partial.Contains("失败/未确认 1"),
            "第二个冻结失败时精确报告第一个成功与失败计数");
        port.FailBefore = null;
        controller.Abort();
        check(!port.Entities[first.Identity].Frozen && controller.View.FrozenCount == 0,
            "同会话 Abort 恢复已成功冻结的目标并核销未写入目标");

        port = new FakePort(); port.Entities.Add(first.Identity, first); controller = new WorldController(port);
        controller.Execute("entities-preview-freeze"); controller.Execute("entities-apply-freeze");
        port.Allowed = false; port.Calls.Clear(); controller.Abort();
        check(port.Calls.Count == 0 && controller.View.FrozenCount == 1 && port.Entities[first.Identity].Frozen,
            "守卫拒绝的 Abort 不越权解冻，保留明确遗留数量");
        port.Allowed = true; controller.Execute("entities-restore");
        check(port.Count("set-frozen") == 1 && controller.View.FrozenCount == 1,
            "失去会话连续性后不重新取得旧实体恢复权");

        var clock = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        port = new FakePort(); port.Entities.Add(first.Identity, first); controller = new WorldController(port, () => clock);
        controller.Execute("entities-preview-freeze"); clock = clock.AddSeconds(11);
        Denied(() => controller.Execute("entities-apply-freeze"));
        check(port.Count("set-frozen") == 0 && controller.View.PlanCount == 0, "过期冻结计划不执行并清除");
    }

    private static void ManagedCleanup(Action<bool, string> check)
    {
        var port = new FakePort(); var owned = Entity(801, owned: true, persistent: true);
        var foreign = Entity(802, owned: true, persistent: true);
        port.Entities.Add(owned.Identity, owned); port.Entities.Add(foreign.Identity, foreign);
        var controller = new WorldController(port);
        controller.RegisterManaged(Session, owned.Identity);
        controller.Execute("entities-preview-clean");
        check(controller.View.PlanCount == 1 && controller.View.ManagedCount == 1,
            "清理只从本实例显式登记账本预览，不认领其他 SHVDN 对象");
        controller.Execute("entities-clean");
        check(port.Count("delete") == 0, "清理预览后仍需第二次明确删除确认");
        controller.Execute("entities-clean");
        check(port.Count("delete") == 1 && !port.Entities.ContainsKey(owned.Identity) && port.Entities.ContainsKey(foreign.Identity),
            "清理删除自有样本并保留同类外部脚本车辆");
        check(controller.View.ManagedCount == 0, "删除确认读回消失后才核销账本");

        port = new FakePort(); port.Entities.Add(owned.Identity, owned); controller = new WorldController(port);
        controller.RegisterManaged(Session, owned.Identity);
        port.FailAfter = operation => { if (operation == "delete") port.Entities[owned.Identity] = owned; return false; };
        controller.Execute("entities-preview-clean"); controller.Execute("entities-clean");
        var unconfirmed = controller.Execute("entities-clean");
        check(port.Count("delete") == 1 && controller.View.ManagedCount == 1 && unconfirmed.Contains("已消失 0") && unconfirmed.Contains("失败/未确认 1"),
            "删除调用返回但实体仍存在时不能核销账本或宣称删除完成");

        foreach (var change in new Func<WorldEntity, WorldEntity>[] {
            item => Copy(item, occupied: true), item => Copy(item, owned: false), item => Copy(item, persistent: false),
            item => Copy(item, frozen: true), item => Copy(item, playerVehicle: true), item => Copy(item, attached: true),
            item => Copy(item, kind: "ped"), item => Copy(item, speed: 1),
            item => Copy(item, identity: new PlayerIdentity(0, item.Identity.PedHandle, 602, item.Identity.Address)) })
        {
            port = new FakePort(); port.Entities.Add(owned.Identity, owned); controller = new WorldController(port);
            controller.RegisterManaged(Session, owned.Identity); controller.Execute("entities-preview-clean");
            port.Entities[owned.Identity] = change(owned);
            controller.Execute("entities-clean"); controller.Execute("entities-clean");
            check(port.Count("delete") == 0 && controller.View.ManagedCount == 1,
                "确认前实体占用、归属或完整身份变化时不删除且保留账本");
        }

        port = new FakePort(); port.Entities.Add(owned.Identity, owned); port.Entities.Add(foreign.Identity, foreign);
        controller = new WorldController(port);
        controller.RegisterManaged(Session, owned.Identity); controller.RegisterManaged(Session, foreign.Identity);
        var deletes = 0; port.FailBefore = operation => operation == "delete" && ++deletes == 2;
        controller.Execute("entities-preview-clean"); controller.Execute("entities-clean");
        var partial = controller.Execute("entities-clean");
        check(port.Count("delete") == 1 && controller.View.ManagedCount == 1 && partial.Contains("已消失 1") && partial.Contains("失败/未确认 1"),
            "部分删除失败保留剩余账本并明确报告真实完成数量");
        port.FailBefore = null;
        controller.Execute("entities-preview-clean"); controller.Execute("entities-clean"); controller.Execute("entities-clean");
        check(port.Count("delete") == 2 && controller.View.ManagedCount == 0, "部分删除失败可重新预览确认完成剩余目标");

        port = new FakePort { FailAfter = operation => operation == "delete" };
        port.Entities.Add(owned.Identity, owned); controller = new WorldController(port);
        controller.RegisterManaged(Session, owned.Identity);
        controller.Execute("entities-preview-clean"); controller.Execute("entities-clean");
        partial = controller.Execute("entities-clean");
        check(port.Count("delete") == 1 && controller.View.ManagedCount == 1 && partial.Contains("失败/未确认 1"),
            "删除写后异常不把未读回的结果宣称为成功");
        port.FailAfter = null;
        controller.Execute("entities-preview-clean");
        check(controller.View.ManagedCount == 0 && controller.View.PlanCount == 0 && port.Count("delete") == 1,
            "删除写后异常通过新预览确认消失后释放旧账本，不再次删除");

        port = new FakePort(); controller = new WorldController(port);
        controller.RegisterManaged(Session, owned.Identity);
        controller.Execute("entities-preview-clean");
        check(controller.View.ManagedCount == 0 && controller.View.PlanCount == 0,
            "外部已删除的托管实体经重新读取后释放有限账本名额");

        port = new FakePort(); port.Entities.Add(owned.Identity, Copy(owned, frozen: true)); controller = new WorldController(port);
        controller.RegisterManaged(Session, owned.Identity); controller.Execute("entities-preview-clean");
        check(controller.View.ManagedCount == 1 && controller.View.PlanCount == 0 && port.Mutations.Count == 0,
            "当前已冻结的托管实体不计入可清理预览，仍保留归属记录");

        port = new FakePort(); port.Entities.Add(owned.Identity, owned); controller = new WorldController(port);
        controller.RegisterManaged(Session, owned.Identity); controller.Execute("entities-preview-clean"); controller.Execute("entities-clean");
        port.CurrentSession = new WorldSession(Actor, "new-build");
        Denied(() => controller.Execute("entities-clean"));
        check(port.Count("delete") == 0 && controller.View.ManagedCount == 0 && controller.View.PlanCount == 0,
            "会话版本变化清除旧账本与清理确认，不删除旧实体");
        var rejected = false;
        try { controller.RegisterManaged(Session, owned.Identity); } catch (InvalidOperationException) { rejected = true; }
        check(rejected && controller.View.ManagedCount == 0, "旧会话创建回调不能向新实例登记实体");

        port = new FakePort(); controller = new WorldController(port);
        for (var handle = 900; handle < 916; handle++) controller.RegisterManaged(Session, Entity(handle).Identity);
        rejected = false;
        try { controller.RegisterManaged(Session, Entity(916).Identity); } catch (InvalidOperationException) { rejected = true; }
        check(rejected && controller.View.ManagedCount == 16, "本实例托管账本上限十六且超限不遗忘旧记录");
    }

    private static void Contracts(Action<bool, string> check)
    {
        check(WorldOptions.Weather.Length == 15 && WorldOptions.Weather.Select(item => item.Id).Distinct().Count() == 15,
            "天气候选来自固定 SDK 的十五项枚举，标识唯一");
        check(!WorldOptions.Weather.Any(item => item.Id is "Unknown" or "HeavyRain"),
            "不把未知天气或不存在的暴雨枚举宣称为候选");
        check(WorldOptions.Gravity.SequenceEqual(new[] { 9.8f, 2.4f, 0.1f, 0f }), "重力候选保持 SDK 参考数值");
        check(!WorldOptions.Finite(float.NaN) && !WorldOptions.Finite(float.PositiveInfinity) && !WorldOptions.Finite(float.NegativeInfinity),
            "有限数验证拒绝所有非有限值");
        check(Session.Equals(new WorldSession(Actor, Session.Build)) && !Session.Equals(new WorldSession(Actor, "another-build")),
            "世界会话包含游戏版本身份");
        check(!Session.Equals(new WorldSession(new PlayerIdentity(0, 102, 201, 301), Session.Build)),
            "世界会话包含完整角色身份");
    }

    private sealed record Mutation(string Operation, object? Value = null, PlayerIdentity? Entity = null);

    private sealed class FakePort : IWorldPort
    {
        public bool Allowed = true;
        public WorldSession CurrentSession = Session;
        public TimeSpan Time = new(12, 30, 15);
        public string Weather = "Clear";
        public bool Paused;
        public int SessionReads;
        public readonly List<string> Calls = new();
        public readonly List<Mutation> Mutations = new();
        public readonly List<string> Logs = new();
        public readonly Dictionary<PlayerIdentity, WorldEntity> Entities = new();
        public IReadOnlyList<WorldEntity>? NearbyOverride;
        public Func<string, bool>? FailBefore;
        public Func<string, bool>? FailAfter;
        public Action<string>? OnCall;

        public bool TrySession(out WorldSession session)
        {
            SessionReads++;
            session = CurrentSession;
            return Allowed;
        }

        private void Begin(string operation, WorldSession session)
        {
            Calls.Add(operation);
            OnCall?.Invoke(operation);
            if (!Allowed || !session.Equals(CurrentSession)) throw new InvalidOperationException("fake boundary denied changed guard/session");
            if (FailBefore?.Invoke(operation) == true) throw new IOException("injected before " + operation);
        }

        private void Written(Mutation mutation)
        {
            Mutations.Add(mutation);
            if (FailAfter?.Invoke(mutation.Operation) == true) throw new IOException("injected after " + mutation.Operation);
        }

        public TimeSpan ReadTime(WorldSession session) { Begin("read-time", session); return Time; }
        public void SetTime(WorldSession session, TimeSpan value)
        { Begin("set-time", session); Time = value; Written(new Mutation("set-time", value)); }
        public void PauseClock(WorldSession session, bool paused)
        { Begin("pause-clock", session); Paused = paused; Written(new Mutation("pause-clock", paused)); }
        public void SetPedDensity(WorldSession session, float value)
        { Begin("ped-density", session); Written(new Mutation("ped-density", value)); }
        public void SetTrafficDensity(WorldSession session, float value)
        { Begin("traffic-density", session); Written(new Mutation("traffic-density", value)); }
        public void SetTimeScale(WorldSession session, float value)
        { Begin("time-scale", session); Written(new Mutation("time-scale", value)); }
        public void SetGravity(WorldSession session, float value)
        { Begin("gravity", session); Written(new Mutation("gravity", value)); }
        public void SetPoliceIgnore(WorldSession session, bool value)
        { Begin("police-ignore", session); Written(new Mutation("police-ignore", value)); }
        public void SetPoliceDispatch(WorldSession session, bool value)
        { Begin("police-dispatch", session); Written(new Mutation("police-dispatch", value)); }
        public string ReadWeather(WorldSession session) { Begin("read-weather", session); return Weather; }
        public void SetWeather(WorldSession session, string candidate)
        { Begin("set-weather", session); Weather = candidate; Written(new Mutation("set-weather", candidate)); }
        public IReadOnlyList<WorldEntity> Nearby(WorldSession session, float radius, int limit)
        {
            Begin("nearby", session);
            return NearbyOverride ?? Entities.Values.Where(item => item.Distance <= radius).Take(limit).ToArray();
        }
        public WorldEntity? ReadEntity(WorldSession session, PlayerIdentity identity)
        {
            Begin("read-entity", session);
            return Entities.TryGetValue(identity, out var entity) ? entity : null;
        }
        public void SetFrozen(WorldSession session, PlayerIdentity identity, bool expected, bool desired)
        {
            Begin("set-frozen", session);
            if (!Entities.TryGetValue(identity, out var entity) || !entity.Identity.Equals(identity) || entity.Frozen != expected)
                throw new InvalidOperationException("fake boundary denied entity identity/state change");
            Entities[identity] = Copy(entity, frozen: desired);
            Written(new Mutation("set-frozen", desired, identity));
        }
        public void DeleteManaged(WorldSession session, PlayerIdentity identity)
        {
            Begin("delete", session);
            if (!Entities.TryGetValue(identity, out var entity) || !entity.Identity.Equals(identity))
                throw new InvalidOperationException("fake boundary denied entity replacement");
            Entities.Remove(identity);
            Written(new Mutation("delete", null, identity));
        }
        public void Log(string operation, string details) => Logs.Add(operation + ": " + details);
        public int Count(string operation) => Mutations.Count(item => item.Operation == operation);
        public object? Last(string operation) => Mutations.Last(item => item.Operation == operation).Value;
    }

    private static WorldEntity Entity(int handle = 501, bool frozen = false, bool owned = false, bool persistent = false,
        bool occupied = false, bool attached = false, bool player = false, bool playerVehicle = false,
        float distance = 5, float speed = 0, string kind = "vehicle")
        => new(new PlayerIdentity(Actor.PlayerHandle, handle, 601, 1000 + handle), kind, frozen, owned, persistent,
            occupied, attached, player, playerVehicle, distance, speed);

    private static WorldEntity Copy(WorldEntity entity, bool? frozen = null, bool? owned = null, bool? persistent = null,
        bool? occupied = null, bool? attached = null, bool? player = null, bool? playerVehicle = null,
        float? distance = null, float? speed = null, string? kind = null, PlayerIdentity? identity = null)
        => new(identity ?? entity.Identity, kind ?? entity.Kind, frozen ?? entity.Frozen, owned ?? entity.OwnedByScript,
            persistent ?? entity.Persistent, occupied ?? entity.Occupied, attached ?? entity.Attached,
            player ?? entity.IsPlayer, playerVehicle ?? entity.IsPlayerVehicle, distance ?? entity.Distance, speed ?? entity.Speed);
}
