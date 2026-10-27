using System;
using Gems.GameAssistant;

// Offline numeric policy only. Passing these checks does not validate vehicle physics in GTA.
public static class VehicleTests
{
    public static int Run(Action<bool, string> check)
    {
        var passed = 0;
        void Check(bool condition, string name) { check(condition, "车辆规则：" + name); passed++; }
        void Reject(Action action, string name)
        {
            try { action(); }
            catch (ArgumentOutOfRangeException) { Check(true, name); return; }
            Check(false, name);
        }
        bool Close(float left, float right) => Math.Abs(left - right) <= 0.00001f;
        bool Reposition(float speed = 0, float height = 0, float groundDelta = 0, float terrainVariation = 0, bool occupied = false, bool car = true)
            => VehicleRules.CanReposition(car, speed, height, groundDelta, terrainVariation, occupied);

        Check(VehicleRules.Finite(0) && VehicleRules.Finite(float.Epsilon) && VehicleRules.Finite(float.MinValue) && VehicleRules.Finite(float.MaxValue), "有限数判定不误拒绝极值");
        Check(!VehicleRules.Finite(float.NaN) && !VehicleRules.Finite(float.PositiveInfinity) && !VehicleRules.Finite(float.NegativeInfinity), "拒绝 NaN 和正负 Infinity");
        Check(Reposition(), "汽车停稳在平地且周围无障碍时允许翻正");
        Check(!Reposition(car: false), "非汽车拒绝翻正");
        Check(!Reposition(occupied: true), "存在邻近车辆或行人时拒绝翻正");
        Check(Reposition(speed: 0.5f) && !Reposition(speed: 0.500001f), "停稳速度阈值包含 0.5m/s 且拒绝略超值");
        Check(!Reposition(speed: -float.Epsilon), "拒绝负速度");
        Check(Reposition(height: 2f) && !Reposition(height: 2.000001f), "离地高度阈值包含 2m 且拒绝略超值");
        Check(!Reposition(height: -float.Epsilon), "拒绝负离地高度");
        Check(Reposition(groundDelta: 2f) && Reposition(groundDelta: -2f), "地面差值允许正负 2m 边界");
        Check(!Reposition(groundDelta: 2.000001f) && !Reposition(groundDelta: -2.000001f), "地面差值超过任一边界均拒绝");
        Check(Reposition(terrainVariation: 0.5f) && !Reposition(terrainVariation: 0.500001f), "地形起伏阈值包含 0.5m 且拒绝略超值");
        Check(!Reposition(terrainVariation: -float.Epsilon), "拒绝负地形起伏");
        Check(Reposition(0.5f, 2f, -2f, 0.5f), "所有合法边界同时出现仍满足规则");
        foreach (var invalid in new[] { float.NaN, float.PositiveInfinity, float.NegativeInfinity })
        {
            Check(!Reposition(speed: invalid), "速度 " + invalid + " 拒绝翻正");
            Check(!Reposition(height: invalid), "离地高度 " + invalid + " 拒绝翻正");
            Check(!Reposition(groundDelta: invalid), "地面差值 " + invalid + " 拒绝翻正");
            Check(!Reposition(terrainVariation: invalid), "地形起伏 " + invalid + " 拒绝翻正");
        }
        Check(!Reposition(float.MaxValue, float.MaxValue, float.MaxValue, float.MaxValue), "有限但超大输入不能绕过翻正阈值");

        const float maximum = 30f / 3.6f;
        const float increment = 5f / 3.6f;
        Check(Close(VehicleRules.SpeedRequest(0, 1), increment), "从静止加速一步为 5km/h");
        Check(Close(VehicleRules.SpeedRequest(increment, 1), 10f / 3.6f), "正步长增加 5km/h");
        Check(Close(VehicleRules.SpeedRequest(10f / 3.6f, -1), increment), "负步长降低 5km/h");
        Check(VehicleRules.SpeedRequest(0, -1) == 0 && VehicleRules.SpeedRequest(increment / 2, -1) == 0, "减速不能产生倒车负速度");
        Check(VehicleRules.SpeedRequest(maximum, 1) == maximum, "正步长在 30km/h 上限夹紧");
        Check(VehicleRules.SpeedRequest(maximum - increment / 2, 1) == maximum, "跨越 30km/h 的请求夹紧到上限");
        Check(Close(VehicleRules.SpeedRequest(maximum, -1), 25f / 3.6f), "30km/h 边界允许减速至 25km/h");
        Check(VehicleRules.SpeedRequest(maximum, 0) == 0 && VehicleRules.SpeedRequest(0, 0) == 0, "零步长表示停止且允许合法速度边界");
        foreach (var speed in new[] { 0, float.Epsilon, increment / 2, increment, maximum - 0.000001f, maximum })
        {
            foreach (var step in new[] { -1, 0, 1 })
            {
                var requested = VehicleRules.SpeedRequest(speed, step);
                Check(VehicleRules.Finite(requested) && requested >= 0 && requested <= maximum, "合法速度与 step=" + step + " 的结果保持有限且在上限内");
            }
        }
        foreach (var speed in new[] { -float.Epsilon, -1f, maximum + 0.000001f, float.MinValue, float.MaxValue, float.NaN, float.PositiveInfinity, float.NegativeInfinity })
        {
            foreach (var step in new[] { -1, 0, 1 })
                Reject(() => VehicleRules.SpeedRequest(speed, step), "拒绝非法当前速度 " + speed + "，即使 step=" + step);
        }
        foreach (var step in new[] { -2, 2, int.MinValue, int.MaxValue })
            Reject(() => VehicleRules.SpeedRequest(0, step), "拒绝超范围步长 " + step);
        Check(VehicleRules.SpeedRequest(-0f, -1) == 0, "IEEE 负零按零速处理且结果不越界");

        var confirmation = new ActionConfirmation();
        var identity = new PlayerIdentity(0, 101, 202, 303);
        var other = new PlayerIdentity(0, 102, 202, 304);
        var now = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        Check(!confirmation.Confirm("performance", identity, now) && confirmation.Key == "performance", "一次性设置首次操作仅记录确认");
        Check(confirmation.Confirm("performance", identity, now.AddSeconds(10)) && confirmation.Key == "", "同车同操作在 10 秒边界可确认且消费凭据");
        Check(!confirmation.Confirm("performance", identity, now.AddSeconds(11)), "已消费凭据不能重复执行");
        Check(!confirmation.Confirm("suspension", identity, now.AddSeconds(12)) && confirmation.Key == "suspension", "切换操作需要重新确认");
        Check(!confirmation.Confirm("suspension", other, now.AddSeconds(13)), "切车不能沿用旧车的确认");
        confirmation.Reconcile(false, other, now.AddSeconds(14));
        Check(confirmation.Key == "" && !confirmation.Confirm("suspension", other, now.AddSeconds(15)), "守卫拒绝撤销确认");
        confirmation.Reconcile(true, identity, now.AddSeconds(16));
        Check(confirmation.Key == "", "角色车辆身份变化撤销确认");
        confirmation.Confirm("performance", identity, now);
        confirmation.Reconcile(true, identity, now.AddSeconds(10).AddTicks(1));
        Check(confirmation.Key == "", "超过 10 秒即撤销确认");
        confirmation.Confirm("performance", identity, now);
        Check(!confirmation.Confirm("performance", identity, now.AddSeconds(11)), "未校准的过期确认同样不能执行");
        confirmation.Clear();
        Check(confirmation.Key == "", "退出菜单可显式取消一次性设置确认");
        return passed;
    }
}
