using Gems.GameAssistant;
using GTA;

var passed = 0; var failed = new List<string>();
void Check(bool condition, string name) { if (!condition) throw new Exception(name); passed++; Console.WriteLine("通过：" + name); }
void Case(string name, Action action) { try { action(); } catch (Exception error) { failed.Add(name + ": " + error.Message); Console.WriteLine("失败：" + name + ": " + error.Message); } }
void Reject(Action action, string name)
{
    var rejected = false;
    try { action(); } catch (InvalidOperationException) { rejected = true; } catch (ArgumentException) { rejected = true; }
    Check(rejected, name);
}
void NoWrites(string name) => Check(Runtime.Writes.Count == 0, name);

Case("guard-first", () => {
    var f = new Fixture { Allowed = false };
    Check(!f.Port.TrySession(out _) && Runtime.Reads.Count == 0, "守卫拒绝发生在任何 GTA 读取之前");
    var calls = new Action[] { () => f.Port.ReadTime(f.Session), () => f.Port.SetTime(f.Session, TimeSpan.FromHours(12)),
        () => f.Port.PauseClock(f.Session, true), () => f.Port.SetPedDensity(f.Session, 0.5f), () => f.Port.SetTrafficDensity(f.Session, 0.5f),
        () => f.Port.SetTimeScale(f.Session, 0.5f), () => f.Port.SetGravity(f.Session, 9.8f), () => f.Port.SetPoliceIgnore(f.Session, true),
        () => f.Port.SetPoliceDispatch(f.Session, true), () => f.Port.ReadWeather(f.Session), () => f.Port.SetWeather(f.Session, "Clear"),
        () => f.Port.Nearby(f.Session, 10, 128), () => f.Port.ReadEntity(f.Session, default), () => f.Port.SetFrozen(f.Session, default, false, true),
        () => f.Port.TrackCreated(f.Session, Fixture.Vehicle(20, true)), () => f.Port.DeleteManaged(f.Session, default) };
    for (var i = 0; i < calls.Length; i++) { Reject(calls[i], "所有真实端口入口受守卫保护 " + i); Check(Runtime.Reads.Count == 0 && Runtime.Writes.Count == 0, "守卫拒绝零 GTA 访问 " + i); }
});

Case("invalid-session", () => {
    foreach (var mutate in new Action<Fixture>[] {
        f => Game.PlayerValue.HandleValue++, f => f.Player.HandleValue++, f => f.Player.ModelValue = new Model(999),
        f => f.Player.AddressValue = new IntPtr(99999), f => Game.VersionValue = new Version(9, 9),
        f => f.Player.DeadValue = true, f => f.Player.ExistsValue = false, f => f.Player.AddressValue = IntPtr.Zero })
    {
        var f = new Fixture(); mutate(f); Reject(() => f.Port.SetTimeScale(f.Session, 0.5f), "身份、版本或死亡变化拒绝旧会话"); NoWrites("旧会话未写世界状态");
    }
});

Case("valid-world-contracts", () => {
    var f = new Fixture();
    Check(f.Port.ReadTime(f.Session) == new TimeSpan(6, 7, 8), "时刻从真实接线的 Chrono 三分量读取");
    Check(Runtime.Reads.Count(key => key.StartsWith("Clock.")) == 3, "只读小时分钟秒三个属性");
    f.Clear(); f.Port.SetTime(f.Session, new TimeSpan(17, 23, 11));
    Check(Runtime.Writes.SequenceEqual(new[] { "Native.SET_CLOCK_TIME(17,23,11)" }), "调时仅一次命名 SET_CLOCK_TIME 调用");
    f.Port.PauseClock(f.Session, true); Check(GTA.Chrono.GameClock.PausedValue, "暂停请求写 Chrono.IsPaused");
    f.Port.SetPedDensity(f.Session, 0); f.Port.SetTrafficDensity(f.Session, 1); Check(World.PedDensityValue == 0 && World.TrafficDensityValue == 1, "0与1密度映射到逐帧 typed API");
    f.Port.SetTimeScale(f.Session, 0.1f); Check(Game.TimeScaleValue == 0.1f, "世界速度下限0.1可提交");
    f.Port.SetTimeScale(f.Session, 1); Check(Game.TimeScaleValue == 1, "世界速度上限1可提交");
    foreach (var gravity in WorldOptions.Gravity) { f.Port.SetGravity(f.Session, gravity); Check(World.GravityValue == gravity, "重力精确预设接线 " + gravity); }
    f.Port.SetPoliceIgnore(f.Session, true); f.Port.SetPoliceDispatch(f.Session, false);
    Check(Game.PlayerValue.WantedValue.IgnoreValue && !Game.PlayerValue.WantedValue.DispatchValue, "警方调用 Wanted typed setter");
    foreach (var weather in WorldOptions.Weather) { f.Port.SetWeather(f.Session, weather.Id); Check(World.WeatherValue.ToString() == weather.Id, "天气候选准确映射 " + weather.Id); }
    World.NextWeatherValue = Weather.Raining; Check(f.Port.ReadWeather(f.Session) == "前 Halloween / 后 Raining", "天气读回只标注前后值");
    f.Clear(); f.Port.Log("test", "detail"); Check(f.Logs.Contains("test:detail") && Runtime.Reads.Count == 0 && Runtime.Writes.Count == 0, "日志端口不访问游戏");
});

Case("range-validation", () => {
    var f = new Fixture();
    foreach (var value in new[] { 0f, -0.1f, float.NaN, float.PositiveInfinity, float.NegativeInfinity, 1.01f }) Reject(() => f.Port.SetTimeScale(f.Session, value), "速度拒绝0/非有限/越界 " + value);
    foreach (var value in new[] { -0.01f, float.NaN, float.PositiveInfinity, 1.01f })
    { Reject(() => f.Port.SetPedDensity(f.Session, value), "行人密度非法 " + value); Reject(() => f.Port.SetTrafficDensity(f.Session, value), "交通密度非法 " + value); }
    foreach (var value in new[] { -1f, 1f, float.NaN, float.PositiveInfinity }) Reject(() => f.Port.SetGravity(f.Session, value), "重力拒绝非预设 " + value);
    foreach (var value in new[] { TimeSpan.FromTicks(-1), TimeSpan.FromDays(1), TimeSpan.FromDays(3), TimeSpan.FromTicks(1) }) Reject(() => f.Port.SetTime(f.Session, value), "时刻拒绝越日/负值/非整秒 " + value);
    foreach (var value in new[] { "Unknown", "clear", "0", "HeavyRain", "../Clear" }) Reject(() => f.Port.SetWeather(f.Session, value), "拒绝未列出的天气 " + value);
    foreach (var radius in new[] { -1f, 10.01f, float.NaN, float.PositiveInfinity }) Reject(() => f.Port.Nearby(f.Session, radius, 32), "扫描半径非法 " + radius);
    foreach (var limit in new[] { 0, 129, -1 }) Reject(() => f.Port.Nearby(f.Session, 10, limit), "扫描数量非法 " + limit);
    Check(Runtime.Reads.Count == 0 && Runtime.Writes.Count == 0, "非法参数均在任何 GTA 访问前拒绝");
});

Case("untracked-ownership", () => {
    var f = new Fixture(); var external = Fixture.Vehicle(20, true); f.Observe(external);
    Reject(() => f.Port.DeleteManaged(f.Session, Fixture.Id(external)), "外部共享 SHVDN 所有权不能授予删除权限"); NoWrites("外部共享所有权对象零写入");
    f.Clear(); var ambient = Fixture.Vehicle(21); Reject(() => f.Port.TrackCreated(f.Session, ambient), "非 SHVDN 创建对象不能登记"); NoWrites("错误登记没有修改实体");
    f.Clear(); var own = Fixture.Vehicle(22, true); var identity = f.Port.TrackCreated(f.Session, own); f.Port.DeleteManaged(f.Session, identity);
    Check(!own.ExistsValue && Runtime.Writes.SequenceEqual(new[] { "Native.DELETE_ENTITY("+own.HandleValue+")" }), "仅 TrackCreated 记录允许命名DELETE且不经夺归属包装器");
    f.Clear(); Reject(() => f.Port.DeleteManaged(f.Session, identity), "成功删除后撤销重复删除权限"); NoWrites("重复删除未写游戏");
});

Case("managed-budget-and-forget", () => {
    var f = new Fixture();
    for (var i = 0; i < 16; i++) f.Port.TrackCreated(f.Session, Fixture.Vehicle(30 + i, true));
    Reject(() => f.Port.TrackCreated(f.Session, Fixture.Vehicle(46, true)), "本实例创建记录最多16辆");
    f.Clear(); f.Allowed = false; f.Port.ForgetSession();
    Check(Runtime.Reads.Count == 0 && Runtime.Writes.Count == 0 && f.Guards == 0, "ForgetSession仅清本地记录且无需触发守卫");
    f.Allowed = true; Check(f.Port.TrySession(out var resumed), "遗忘后可建立新会话");
    Reject(() => f.Port.DeleteManaged(resumed, Fixture.Id(Fixture.Vehicle(30, true))), "遗忘不会把旧对象重新认作助手创建"); NoWrites("遗忘及旧记录删除拒绝均零写入");
});

Case("freeze-rescan-and-restore", () => {
    var f = new Fixture(); var target = Fixture.Vehicle(70); f.Observe(target); var id = Fixture.Id(target);
    f.Port.SetFrozen(f.Session, id, false, true); Check(target.FrozenValue, "附近普通车辆可请求冻结");
    World.Entities = Array.Empty<Entity>(); f.Port.Nearby(f.Session, 10, 128);
    Check(f.Port.ReadEntity(f.Session, id)?.Frozen == true, "空结果再次扫描不丢已冻结恢复对象");
    f.Port.SetFrozen(f.Session, id, true, false); Check(!target.FrozenValue, "重复扫描后可条件恢复");
    f.Port.Nearby(f.Session, 10, 128); Check(f.Port.ReadEntity(f.Session, id) == null, "恢复后普通对象不被永久保留");
});

Case("freeze-budget", () => {
    var f = new Fixture(); var targets = Enumerable.Range(100, 33).Select(i => Fixture.Vehicle(i)).ToArray(); f.Observe(targets);
    for (var i = 0; i < 32; i++) f.Port.SetFrozen(f.Session, Fixture.Id(targets[i]), false, true);
    Check(targets.Take(32).All(entity => entity.FrozenValue), "32个冻结记录均成功写入"); f.Clear();
    Reject(() => f.Port.SetFrozen(f.Session, Fixture.Id(targets[32]), false, true), "第33个冻结请求被预算拒绝"); NoWrites("预算拒绝前未写第33实体");
    f.Port.SetFrozen(f.Session, Fixture.Id(targets[0]), true, false); f.Port.SetFrozen(f.Session, Fixture.Id(targets[32]), false, true);
    Check(!targets[0].FrozenValue && targets[32].FrozenValue, "恢复释放预算后允许下一实体");
});

Case("external-changes", () => {
    foreach (var mutate in new Action<Vehicle>[] { v => v.FrozenValue = true, v => v.OwnedValue = true, v => v.PersistentValue = true,
        v => v.OccupantsValue = new[] { new Ped() }, v => v.AttachedValue = true, v => v.SpeedValue = 0.6f,
        v => v.SpeedValue = float.NaN, v => v.PositionValue = new Vector3(11, 0, 0), v => v.AirValue = true, v => v.WaterValue = true })
    {
        var f = new Fixture(); var target = Fixture.Vehicle(140); f.Observe(target); mutate(target);
        Reject(() => f.Port.SetFrozen(f.Session, Fixture.Id(target), false, true), "冻结前重新读取外部状态变化"); NoWrites("外部状态变化零冻结写入");
    }
    var f2 = new Fixture(); var own = Fixture.Vehicle(141, true); var id = f2.Port.TrackCreated(f2.Session, own); own.OccupantsValue = new[] { f2.Player }; f2.Clear();
    Reject(() => f2.Port.DeleteManaged(f2.Session, id), "清理前重新读取新乘员"); NoWrites("有乘员车辆不清理");
});

Case("identity-recycling", () => {
    var f = new Fixture(); var target = Fixture.Vehicle(150, true); var id = f.Port.TrackCreated(f.Session, target);
    target.AddressValue = new IntPtr(999999); Check(f.Port.ReadEntity(f.Session, id) == null, "地址复用导致快照失效");
    target.AddressValue = new IntPtr(id.Address); f.Clear();
    Reject(() => f.Port.DeleteManaged(f.Session, id), "目标失效后即使地址再相同也不恢复旧删除权限"); NoWrites("身份复用未写实体");
});

Case("partial-freeze", () => {
    var f = new Fixture(); var target = Fixture.Vehicle(160); target.ThrowAfterFreeze = true; f.Observe(target); var id = Fixture.Id(target);
    Reject(() => f.Port.SetFrozen(f.Session, id, false, true), "setter改变后抛错可被报告"); Check(target.FrozenValue, "注入的部分写入确实发生");
    target.ThrowAfterFreeze = false; World.Entities = Array.Empty<Entity>(); f.Port.Nearby(f.Session, 10, 128);
    Check(f.Port.ReadEntity(f.Session, id)?.Frozen == true, "部分写入的恢复记录不被扫描丢弃");
    f.Port.SetFrozen(f.Session, id, true, false); Check(!target.FrozenValue, "部分写入仍可条件恢复");
});

Case("last-guard-denial", () => {
    var f = new Fixture(); var target = Fixture.Vehicle(170); f.Observe(target);
    f.BeforeGuard = count => { if (count == 3) f.Allowed = false; };
    Reject(() => f.Port.SetFrozen(f.Session, Fixture.Id(target), false, true), "冻结写入前最后守卫拒绝"); NoWrites("最后守卫拒绝零实体写入");
    var g = new Fixture(); var own = Fixture.Vehicle(171, true); var id = g.Port.TrackCreated(g.Session, own); g.Clear();
    g.BeforeGuard = count => { if (count == 3) g.Allowed = false; };
    Reject(() => g.Port.DeleteManaged(g.Session, id), "删除写入前最后守卫拒绝"); NoWrites("最后删除守卫拒绝零实体写入");
});

// Change a safety-relevant field after the first snapshot, while the production
// adapter rechecks the story guard. The mutation must not use the stale snapshot.
Case("final-snapshot-freeze", () => {
    var f = new Fixture(); var target = Fixture.Vehicle(180); f.Observe(target);
    f.BeforeGuard = count => { if (count == 3) target.OccupantsValue = new[] { f.Player }; };
    Reject(() => f.Port.SetFrozen(f.Session, Fixture.Id(target), false, true), "最后守卫期间新增乘员仍阻止冻结"); NoWrites("写入前安全状态变化不会使用旧快照");
});
Case("final-snapshot-delete", () => {
    var f = new Fixture(); var target = Fixture.Vehicle(181, true); var id = f.Port.TrackCreated(f.Session, target); f.Clear();
    f.BeforeGuard = count => { if (count == 3) target.OccupantsValue = new[] { f.Player }; };
    Reject(() => f.Port.DeleteManaged(f.Session, id), "最后守卫期间新增乘员仍阻止删除"); NoWrites("删除前安全状态变化不会使用旧快照");
});
Case("final-snapshot-identity-and-state", () => {
    foreach (var mutate in new Action<Vehicle>[] { v => v.AddressValue = new IntPtr(999999), v => v.FrozenValue = true, v => v.OwnedValue = true, v => v.SpeedValue = 1 })
    {
        var f = new Fixture(); var target = Fixture.Vehicle(190); var id = Fixture.Id(target); f.Observe(target);
        f.BeforeGuard = count => { if (count == 3) mutate(target); };
        Reject(() => f.Port.SetFrozen(f.Session, id, false, true), "最后守卫期间身份/冻结/归属/速度变化被重查"); NoWrites("最后阶段变化拒绝前没有冻结写入");
    }
});

// Regression for root's static continuity finding. This links the production
// controller AND adapter; only the external GTA endpoint is substituted.
// No pre-fix execution of this new regression is claimed.
Case("controller-adapter-transient-denial", () => {
    var f = new Fixture(); var controller = new WorldController(f.Port);
    controller.Execute("time-day");
    Check(controller.View.HasPreviousTime && GTA.Chrono.GameClock.HourValue == 12, "组合夹具先建立实际调时前记录");
    var target = Fixture.Vehicle(210); var identity = Fixture.Id(target); World.Entities = new Entity[] { target };
    controller.Execute("entities-preview-freeze"); controller.Execute("entities-apply-freeze");
    Check(target.FrozenValue && controller.View.FrozenCount == 1, "组合夹具先建立实际冻结与恢复记录");
    controller.Execute("density-ped");
    Check(controller.View.PedActive && f.Port.TrySession(out _), "组合夹具启用持续密度请求");
    f.Port.TrySession(out var oldSession);
    f.Clear(); f.BeforeGuard = count => { if (count == 2) f.Allowed = false; };
    Reject(() => controller.Tick(), "控制器 Check 成功后端口 setter 第二次守卫拒绝");
    Check(f.Guards == 2 && !controller.View.PedActive && !controller.View.TrafficActive, "内部守卫失败立即停止本轮持续请求");
    NoWrites("短暂守卫失败没有执行密度或恢复写入");
    f.Allowed = true; f.Clear(); controller.Tick();
    Check(f.Port.TrySession(out var resumed) && resumed.Actor.Equals(oldSession.Actor) && resumed.Build == oldSession.Build
        && resumed.Continuity > oldSession.Continuity && !resumed.Equals(oldSession), "同角色同版本恢复仍建立不同连续性会话");
    Check(!controller.View.HasPreviousTime, "next Tick 丢弃上一次会话调时前记录");
    Check(controller.View.PreviousSessionPending && controller.View.InterruptedFrozenCount == 1 && controller.View.FrozenCount == 1,
        "next Tick 保留中断冻结与未自动恢复警示");
    Check(target.FrozenValue && f.Port.ReadEntity(resumed, identity) == null, "旧冻结仍真实存在但新会话不能重获对象操作权");
    NoWrites("恢复会话不会自动调时解冻或继续密度请求");
    f.Clear(); Reject(() => f.Port.SetTimeScale(oldSession, 0.5f), "旧 WorldSession 在相同角色版本下仍不能写世界速度");
    Reject(() => f.Port.SetTime(oldSession, TimeSpan.FromHours(6)), "旧 WorldSession 不能写旧调时记录");
    Reject(() => f.Port.SetFrozen(oldSession, identity, true, false), "旧 WorldSession 不能恢复旧冻结对象"); NoWrites("旧连续性会话拒绝全部写入");
    controller.Execute("time-previous"); controller.Execute("entities-restore"); controller.Tick();
    Check(!controller.View.HasPreviousTime && controller.View.InterruptedFrozenCount == 1 && controller.View.FrozenCount == 1
        && controller.View.PreviousSessionPending && target.FrozenValue, "再次恢复操作不能清零未恢复状态或复活旧时刻");
    NoWrites("新会话恢复按钮不会重新操作旧会话对象");
});

Case("explicit-forget-continuity", () => {
    var f = new Fixture(); f.Port.ForgetSession(); f.Port.TrySession(out var next);
    Check(next.Actor.Equals(f.Session.Actor) && next.Build == f.Session.Build && next.Continuity > f.Session.Continuity,
        "显式本地遗忘也提升连续性 epoch");
    f.Clear(); Reject(() => f.Port.SetPedDensity(f.Session, 1), "显式遗忘后旧会话无法继续逐帧请求"); NoWrites("显式遗忘旧会话拒绝零写入");
});

Case("shared-quota-lifecycle",()=>{
    var f=new Fixture();var q=new SpawnQuota();var p=new GtaWorldPort(()=>f.Allowed,(_,__)=>{},q);p.TrySession(out var session);var reservation=q.Reserve("vehicle",1);q.Issue(reservation,0);var own=Fixture.Vehicle(231,true);var id=p.TrackCreated(session,own,reservation);q.End(reservation);Check(q.Charged==1,"共享车辆已提交占用额度");p.DeleteManaged(session,id);Check(q.Charged==0,"仅实际车辆消失释放共享额度");
    var lost=q.Reserve("vehicle",1);q.Issue(lost,0);q.End(lost);p.ForgetSession();Check(q.Charged==1,"世界遗忘不释放未知已提交车辆额度");
});
Console.WriteLine("真实 GtaWorldPort 离线接线：通过 " + passed + " 项，失败组 " + failed.Count + "。替代 GTA API，不证明 SDK/runtime/game 兼容性。");
foreach (var error in failed) Console.WriteLine("未通过：" + error);
Environment.ExitCode = failed.Count == 0 ? 0 : 1;
