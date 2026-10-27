using System;
using System.Collections.Generic;
using System.Globalization;

namespace Gems.GameAssistant
{
    public readonly struct PlayerMotionSession : IEquatable<PlayerMotionSession>
    {
        public readonly PlayerIdentity Actor;
        public readonly long Epoch;
        public PlayerMotionSession(PlayerIdentity actor, long epoch) { Actor = actor; Epoch = epoch; }
        public bool Equals(PlayerMotionSession other) => Actor.Equals(other.Actor) && Epoch == other.Epoch;
        public override bool Equals(object? other) => other is PlayerMotionSession session && Equals(session);
        public override int GetHashCode() => Actor.GetHashCode() ^ Epoch.GetHashCode();
    }
    public interface IPlayerMotionPort
    {
        bool TrySession(out PlayerMotionSession session);
        void ForgetSession();
        void Run(PlayerMotionSession session, float multiplier);
        void Swim(PlayerMotionSession session, float multiplier);
        void Jump(PlayerMotionSession session);
    }
    public static class PlayerMotionRules
    {
        public static float Multiplier(float value)
        {
            if (float.IsNaN(value) || float.IsInfinity(value) || value < 0 || value > 1.499f)
                throw new ArgumentOutOfRangeException(nameof(value), "倍率必须为有限数，范围 0..1.499。");
            return value;
        }
    }
    public sealed class PlayerMotionController
    {
        private readonly IPlayerMotionPort port;
        private PlayerMotionSession? target;
        public bool RunEnabled { get; private set; }
        public bool SwimEnabled { get; private set; }
        public bool JumpEnabled { get; private set; }
        public float RunMultiplier { get; private set; } = 1f;
        public float SwimMultiplier { get; private set; } = 1f;
        public bool AnyEnabled => RunEnabled || SwimEnabled || JumpEnabled;
        public string LastResult { get; private set; } = "本助手未请求移动效果；游戏效果未实测。";
        private string? pendingError;
        public string? TakeError() { var result = pendingError; pendingError = null; return result; }
        public PlayerMotionController(IPlayerMotionPort port) { this.port = port; }
        public string Value(string action)
        {
            if (action == "jump") return JumpEnabled ? "请求开" : "请求关";
            var running = action == "player-run";
            if (!running && action != "player-swim") throw new ArgumentException("未知移动动作。");
            return ((running ? RunEnabled : SwimEnabled) ? "请求开 " : "请求关 ") +
                (running ? RunMultiplier : SwimMultiplier).ToString("F3", CultureInfo.InvariantCulture);
        }
        public void SetMultiplier(string action, float value)
        {
            PlayerMotionRules.Multiplier(value);
            if (action == "player-run") RunMultiplier = value;
            else if (action == "player-swim") SwimMultiplier = value;
            else throw new ArgumentException("未知倍率动作。");
            LastResult = "已设置本助手请求倍率；关闭状态不会提交，游戏效果未实测。";
        }
        public string Adjust(string action, int direction)
        {
            var current = action == "player-run" ? RunMultiplier : action == "player-swim" ? SwimMultiplier : throw new ArgumentException("未知倍率动作。");
            var thousandths = (int)Math.Round(current * 1000f);
            SetMultiplier(action, Math.Max(0, Math.Min(1499, thousandths + Math.Sign(direction) * 50)) / 1000f);
            return LastResult;
        }
        public string Toggle(string action)
        {
            if (action != "player-run" && action != "player-swim" && action != "jump") throw new ArgumentException("未知移动动作。");
            if (!port.TrySession(out var session)) { Stop("资格检查拒绝"); return LastResult; }
            if (target.HasValue && !target.Value.Equals(session)) { Stop("玩家或连续会话已变化；请重新启用"); return LastResult; }
            var first = session;
            if (!port.TrySession(out session) || !first.Equals(session)) { Stop("启用前资格或会话变化；请重新启用"); return LastResult; }
            target = session;
            if (action == "player-run") RunEnabled = !RunEnabled;
            else if (action == "player-swim") SwimEnabled = !SwimEnabled;
            else JumpEnabled = !JumpEnabled;
            LastResult = "本助手" + Value(action) + "；仅逐帧请求，游戏效果未实测。";
            return LastResult;
        }
        public void Stop(string reason)
        {
            var active = AnyEnabled;
            RunEnabled = SwimEnabled = JumpEnabled = false; target = null; port.ForgetSession();
            if (active) LastResult = "移动请求停止：" + reason + "；未恢复未知外部倍率。";
        }
        public void Tick()
        {
            if (!AnyEnabled) return;
            var submitted = new List<string>();
            try
            {
                if (!port.TrySession(out var session) || !target.HasValue || !target.Value.Equals(session))
                { Stop("玩家或连续会话资格中断"); return; }
                if (RunEnabled) { port.Run(session, RunMultiplier); submitted.Add("跑步"); }
                if (SwimEnabled) { port.Swim(session, SwimMultiplier); submitted.Add("游泳"); }
                if (JumpEnabled) { port.Jump(session); submitted.Add("跳跃"); }
                LastResult = "本帧已返回：" + string.Join("、", submitted) + "；效果待测。";
            }
            catch (Exception error)
            {
                Stop("提交失败");
                pendingError = error.ToString();
                LastResult = "本帧已返回 " + (submitted.Count == 0 ? "无" : string.Join("、", submitted)) +
                    "；失败调用可能已生效，未回滚。";
            }
        }
    }
}
