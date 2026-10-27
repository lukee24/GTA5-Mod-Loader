using System;
using GTA;

namespace Gems.GameAssistant
{
    public sealed class GtaPlayerMotionPort : IPlayerMotionPort
    {
        private readonly Func<bool> eligible;
        private PlayerIdentity? last;
        private long epoch;
        public GtaPlayerMotionPort(Func<bool> eligible) { this.eligible = eligible; }
        public void ForgetSession() { last = null; unchecked { epoch++; } }
        public bool TrySession(out PlayerMotionSession session)
        {
            session = default;
            try
            {
                if (!eligible()) { ForgetSession(); return false; }
                var player = Game.Player; var ped = player.Character;
                if (ped == null || !ped.Exists() || ped.IsDead) { ForgetSession(); return false; }
                var actor = new PlayerIdentity(player.Handle, ped.Handle, ped.Model.Hash, ped.MemoryAddress.ToInt64());
                if (actor.Address == 0) { ForgetSession(); return false; }
                if (!eligible()) { ForgetSession(); return false; }
                if (last.HasValue && !last.Value.Equals(actor)) ForgetSession();
                last = actor; session = new PlayerMotionSession(actor, epoch); return true;
            }
            catch { ForgetSession(); throw; }
        }
        private Player Require(PlayerMotionSession expected)
        {
            try
            {
                if (!TrySession(out var current) || !current.Equals(expected))
                    throw new InvalidOperationException("玩家移动请求的资格或连续会话已变化。");
                var player = Game.Player; var ped = player.Character;
                if (ped == null || !ped.Exists() || ped.IsDead) throw new InvalidOperationException("提交前玩家实体不可用。");
                var actor = new PlayerIdentity(player.Handle, ped.Handle, ped.Model.Hash, ped.MemoryAddress.ToInt64());
                if (actor.Address == 0 || !actor.Equals(expected.Actor) || !eligible())
                    throw new InvalidOperationException("提交前玩家或资格已变化。");
                // The final eligibility callback can itself observe a new actor; do not retain its predecessor.
                player = Game.Player; ped = player.Character;
                if (ped == null || !ped.Exists() || ped.IsDead) throw new InvalidOperationException("最终目标玩家不可用。");
                actor = new PlayerIdentity(player.Handle, ped.Handle, ped.Model.Hash, ped.MemoryAddress.ToInt64());
                if (actor.Address == 0 || !actor.Equals(expected.Actor) || epoch != expected.Epoch)
                    throw new InvalidOperationException("最终玩家身份或会话已变化。");
                return player;
            }
            catch { ForgetSession(); throw; }
        }
        private void Submit(PlayerMotionSession session, Action<Player> request)
        { try { request(Require(session)); } catch { ForgetSession(); throw; } }
        public void Run(PlayerMotionSession session, float multiplier)
        { PlayerMotionRules.Multiplier(multiplier); Submit(session, p => p.SetRunSpeedMultThisFrame(multiplier)); }
        public void Swim(PlayerMotionSession session, float multiplier)
        { PlayerMotionRules.Multiplier(multiplier); Submit(session, p => p.SetSwimSpeedMultThisFrame(multiplier)); }
        public void Jump(PlayerMotionSession session) => Submit(session, p => p.SetSuperJumpThisFrame());
    }
}
