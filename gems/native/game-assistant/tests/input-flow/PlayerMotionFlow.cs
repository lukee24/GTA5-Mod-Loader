using Gems.GameAssistant;
using GTA;
using System.Reflection;
using System.Windows.Forms;

public static class PlayerMotionFlow
{
    public static void Run(Action<bool, string> check)
    {
        var script = new GemsAssistantScript(); var number = 1000;
        T Field<T>(string key) => (T)typeof(GemsAssistantScript).GetField(key, BindingFlags.NonPublic | BindingFlags.Instance)!.GetValue(script)!;
        void Frame(string[]? keys = null, string[]? buttons = null, bool pad = false)
        {
            keys ??= Array.Empty<string>(); Game.Held = keys.Select(k => (Keys)Enum.Parse(typeof(Keys), k)).ToHashSet();
            GtaInputPort.Frame = new InputFrame { Number = ++number, Keys = keys, Buttons = buttons ?? Array.Empty<string>(), Gamepad = pad }; script.RaiseTick();
        }
        void Press(string token)
        { Frame(); var key = (Keys)Enum.Parse(typeof(Keys), token); script.RaiseDown(key); Frame(new[] { token }); script.RaiseUp(key); Frame(); }
        void Pad(string token) { Frame(pad: true); Frame(buttons: new[] { token }, pad: true); Frame(pad: true); }
        void Open() { Frame(); if (!Field<bool>("opened")) Press("F5"); check(Field<bool>("opened"), "移动真实菜单可打开"); }
        void Select(string key, bool pad = false)
        {
            var rows = ChinesePanel.Rows; var index = Array.FindIndex(rows, r => r.Key == key); check(index >= 0, "移动真实行存在 " + key);
            var viewport = Field<MenuViewport>("viewport"); viewport.Reset(rows.Length); viewport.Move(index); Frame(pad: pad);
        }
        var motion = Field<PlayerMotionController>("motion"); Game.Allowed = true; Game.IsPaused = false; GtaInputPort.Focused = true; GtaInputPort.AfterRead = null; Game.DuringMotion = null;
        Frame(); Open(); Game.MotionCalls.Clear(); var vehicleCalls = VehicleController.Calls.Count;
        Select("player-run"); Press("Add"); check(motion.RunMultiplier == 1.05f && !motion.RunEnabled && Game.MotionCalls.Count == 0, "键盘真实玩家行调值不自动提交");
        Press("Return"); check(motion.RunEnabled && Game.MotionCalls.Contains("run:1.050"), "键盘真实确认通过typed跑步接口");
        check(VehicleController.Calls.Count == vehicleCalls, "玩家调值未调用车辆速度");
        Press("F5"); var count = Game.MotionCalls.Count; Frame(); check(!Field<bool>("opened") && motion.RunEnabled && Game.MotionCalls.Count > count, "F5仅隐藏菜单且持续跑步请求");
        Open(); Select("player-swim", true); Pad("FrontendRight"); Pad("FrontendAccept"); check(motion.SwimEnabled && motion.SwimMultiplier == 1.05f && Game.MotionCalls.Contains("swim:1.050"), "逻辑手柄真实游泳行调值并启用");
        Select("player-motion-stop", true); Pad("FrontendAccept"); count = Game.MotionCalls.Count; Frame(); check(!motion.AnyEnabled && Game.MotionCalls.Count == count, "手柄明确停止所有移动请求且不写1.0");
        foreach (var failure in new[] { "inner-guard", "focus-loss", "pause", "jump-throws", "actor-after-input" })
        {
            Open(); Select("jump"); Press("Return"); check(motion.JumpEnabled, "真实菜单为旧失败准备跳跃 " + failure);
            Game.MotionCalls.Clear(); var originalModel = Game.Player.Character.Model;
            if (failure == "jump-throws") Game.DuringMotion = value => { if (value == "jump") throw new IOException("jump fixture"); };
            else GtaInputPort.AfterRead = () => {
                if (failure == "inner-guard") Game.Allowed = false;
                if (failure == "focus-loss") GtaInputPort.Focused = false;
                if (failure == "pause") Game.IsPaused = true;
                if (failure == "actor-after-input") Game.Player.Character.Model = new Model(997);
            };
            Frame(); check(!motion.AnyEnabled, "真实脚本撤销旧失败请求 " + failure);
            check(Game.MotionCalls.Count == (failure == "jump-throws" ? 1 : 0), "拒绝后零提交或明确失败调用 " + failure);
            GtaInputPort.AfterRead = null; Game.DuringMotion = null; Game.Allowed = true; GtaInputPort.Focused = true; Game.IsPaused = false; Game.Player.Character.Model = originalModel;
            count = Game.MotionCalls.Count; Frame(); Frame(); check(!motion.AnyEnabled && Game.MotionCalls.Count == count, "同actor恢复不续用旧跳跃 " + failure);
        }
        Open(); Select("player-run"); Press("Return"); Select("player-swim"); Press("Return"); Select("jump"); Press("Return");
        Game.MotionCalls.Clear(); Game.DuringMotion = value => { if (value.StartsWith("swim:")) throw new IOException("partial swimmer"); }; Frame();
        check(Game.MotionCalls.SequenceEqual(new[] { "run:1.050", "swim:1.050" }) && !motion.AnyEnabled, "真实部分帧提交后停止且跳跃不再执行");
        check(motion.LastResult.Contains("本帧已返回 跑步") && motion.LastResult.Contains("失败调用可能已生效") && motion.LastResult.Contains("未回滚"), "真实部分提交信息诚实保留不确定性");
        Game.DuringMotion = null; count = Game.MotionCalls.Count; Frame(); check(Game.MotionCalls.Count == count, "部分失败后下一帧不重试");
        Open(); Select("player-run"); Press("Return"); script.RaiseAbort(); count = Game.MotionCalls.Count; Frame(); check(!motion.AnyEnabled && Game.MotionCalls.Count == count, "脚本退出停止移动请求且不恢复未知倍率");
    }
}
