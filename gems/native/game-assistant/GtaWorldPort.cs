using System;
using System.Collections.Generic;
using System.Linq;
using GTA;
using GTA.Chrono;
using GTA.Native;

namespace Gems.GameAssistant
{
    internal sealed class GtaWorldPort : IWorldPort
    {
        private readonly Func<bool> allowed;
        private readonly Action<string, string> log;
        private readonly SpawnQuota? spawnQuota;
        private readonly Dictionary<PlayerIdentity,string> creationReservations=new Dictionary<PlayerIdentity,string>();
        private readonly Dictionary<PlayerIdentity, Entity> observed = new Dictionary<PlayerIdentity, Entity>();
        private readonly Dictionary<PlayerIdentity, Entity> created = new Dictionary<PlayerIdentity, Entity>();
        private readonly Dictionary<PlayerIdentity, Entity> frozen = new Dictionary<PlayerIdentity, Entity>();
        private WorldSession? last;
        private long continuity;
        public GtaWorldPort(Func<bool> allowed, Action<string, string> log,SpawnQuota? spawnQuota=null) { this.allowed = allowed; this.log = log;this.spawnQuota=spawnQuota; }
        private static PlayerIdentity Id(Entity entity) => new PlayerIdentity(0, entity.Handle, entity.Model.Hash, entity.MemoryAddress.ToInt64());
        public bool TrySession(out WorldSession session)
        {
            session = default;
            if (!allowed()) { Forget(); return false; }
            var player = Game.Player; var ped = player.Character;
            if (ped == null || !ped.Exists() || ped.IsDead || ped.MemoryAddress == IntPtr.Zero) { Forget(); return false; }
            var actor = new PlayerIdentity(player.Handle, ped.Handle, ped.Model.Hash, ped.MemoryAddress.ToInt64()); var build = Game.FileVersion.ToString();
            session = new WorldSession(actor, build, continuity);
            if (last.HasValue && !last.Value.Equals(session)) { Forget(); session = new WorldSession(actor, build, continuity); }
            last = session; return true;
        }
        private void Forget() { last = null; observed.Clear(); created.Clear(); frozen.Clear(); continuity = checked(continuity + 1); }
        public void ForgetSession() => Forget(); // Local bookkeeping only; safe after guard denial.
        private void Require(WorldSession expected)
        {
            if (!TrySession(out var current) || !current.Equals(expected)) throw new InvalidOperationException("世界操作前故事模式或角色身份已变化。");
        }
        public TimeSpan ReadTime(WorldSession session) { Require(session); return new TimeSpan(GameClock.Hour, GameClock.Minute, GameClock.Second); }
        public void SetTime(WorldSession session, TimeSpan value)
        {
            if (value < TimeSpan.Zero || value >= TimeSpan.FromDays(1) || value.Ticks % TimeSpan.TicksPerSecond != 0) throw new ArgumentOutOfRangeException(nameof(value));
            // Existing named Native contract, also used by the pinned SDK's typed setter.
            // Avoid three separate writes from GameClock.TimeOfDay's component setters.
            Require(session); Function.Call(Hash.SET_CLOCK_TIME, value.Hours, value.Minutes, value.Seconds);
        }
        public void PauseClock(WorldSession session, bool paused) { Require(session); GameClock.IsPaused = paused; }
        private static void Range(float value, float min, float max)
        { if (!WorldOptions.Finite(value) || value < min || value > max) throw new ArgumentOutOfRangeException(nameof(value)); }
        public void SetPedDensity(WorldSession session, float value) { Range(value, 0, 1); Require(session); World.SetAmbientPedDensityMultiplierThisFrame(value); }
        public void SetTrafficDensity(WorldSession session, float value) { Range(value, 0, 1); Require(session); World.SetAmbientVehicleDensityMultiplierThisFrame(value); }
        public void SetTimeScale(WorldSession session, float value) { Range(value, 0.1f, 1); Require(session); Game.TimeScale = value; }
        public void SetGravity(WorldSession session, float value)
        { if (!WorldOptions.Gravity.Contains(value)) throw new ArgumentOutOfRangeException(nameof(value)); Require(session); World.GravityLevel = value; }
        public void SetPoliceIgnore(WorldSession session, bool value) { Require(session); Game.Player.Wanted.SetPoliceIgnorePlayer(value); }
        public void SetPoliceDispatch(WorldSession session, bool value) { Require(session); Game.Player.Wanted.DispatchesCopsForPlayer = value; }
        public string ReadWeather(WorldSession session) { Require(session); return "前 " + World.Weather + " / 后 " + World.NextWeather; }
        public void SetWeather(WorldSession session, string candidate)
        {
            if (!WorldOptions.Weather.Any(choice => choice.Id == candidate) || !Enum.TryParse<Weather>(candidate, out var weather) || weather == Weather.Unknown)
                throw new ArgumentException("未知天气候选。");
            Require(session); World.Weather = weather;
        }
        private WorldEntity? Snapshot(WorldSession session, Entity entity, PlayerIdentity expected)
        {
            Require(session);
            if (!entity.Exists() || entity.MemoryAddress == IntPtr.Zero || !Id(entity).Equals(expected)) return null;
            var ped = Game.Player.Character;
            var currentVehicle = ped.CurrentVehicle;
            var vehicle = entity as Vehicle;
            var targetPed = entity as Ped;
            var kind = vehicle != null ? "vehicle" : targetPed != null ? "ped" : "unsupported";
            if (entity.IsInAir || entity.IsInWater) kind = "unsupported";
            return new WorldEntity(expected, kind, entity.IsPositionFrozen, entity.IsOwnedByAnyScript, entity.IsPersistent,
                vehicle != null && vehicle.Occupants.Length != 0, entity.IsAttached(), targetPed != null && targetPed.IsPlayer,
                currentVehicle != null && currentVehicle.Exists() && Id(currentVehicle).Equals(expected),
                (entity.Position - ped.Position).Length(), entity.Speed);
        }
        public IReadOnlyList<WorldEntity> Nearby(WorldSession session, float radius, int limit)
        {
            Range(radius, 0, 10); if (limit < 1 || limit > 128) throw new ArgumentOutOfRangeException(nameof(limit));
            Require(session); var point = Game.Player.Character.Position;
            var found = World.GetNearbyEntities(point, radius); var result = new List<WorldEntity>();
            // Rebuild observations without losing explicitly created objects.
            observed.Clear(); foreach (var pair in created) observed[pair.Key] = pair.Value; foreach (var pair in frozen) observed[pair.Key] = pair.Value;
            foreach (var entity in found.Take(limit))
            {
                Require(session); if (!entity.Exists() || entity.MemoryAddress == IntPtr.Zero) continue;
                var identity = Id(entity); var item = Snapshot(session, entity, identity);
                if (item != null) { observed[identity] = entity; result.Add(item); }
            }
            return result;
        }
        public WorldEntity? ReadEntity(WorldSession session, PlayerIdentity identity)
        {
            Require(session);
            if (!observed.TryGetValue(identity, out var entity)) return null;
            var result = Snapshot(session, entity, identity);
            // A missing or recycled target revokes authority; it never grants authority to the new entity.
            if (result == null) { observed.Remove(identity); created.Remove(identity); frozen.Remove(identity); }
            return result;
        }
        private static bool Safe(WorldEntity item, bool own)
        {
            return WorldOptions.Finite(item.Distance) && item.Distance >= 0 && item.Distance <= 10 && WorldOptions.Finite(item.Speed) && item.Speed >= 0 && item.Speed <= 0.5f &&
                !item.IsPlayer && !item.IsPlayerVehicle && !item.Occupied && !item.Attached &&
                (own ? item.Kind == "vehicle" && item.OwnedByScript && item.Persistent : (item.Kind == "vehicle" || item.Kind == "ped") && !item.OwnedByScript && !item.Persistent);
        }
        public void SetFrozen(WorldSession session, PlayerIdentity identity, bool expected, bool desired)
        {
            var item = ReadEntity(session, identity);
            if (item == null || !Safe(item, false) || item.Frozen != expected) throw new InvalidOperationException("实体已变化或不再满足冻结边界。");
            if (desired && !frozen.ContainsKey(identity) && frozen.Count >= 32) throw new InvalidOperationException("本实例冻结记录已达32个上限。");
            var entity = observed[identity];
            var final = Snapshot(session, entity, identity);
            if (final == null || !Safe(final, false) || final.Frozen != expected || !entity.Exists() || !Id(entity).Equals(identity)) throw new InvalidOperationException("冻结写入前目标或乘员已变化。");
            if (desired) frozen[identity] = entity;
            entity.IsPositionFrozen = desired;
            if (!desired && !entity.IsPositionFrozen) frozen.Remove(identity);
        }
        // Called only for the actual object just returned by GEMS' CreateVehicle call.
        // A matching model, shared SHVDN owner or imported identity cannot populate this dictionary.
        public PlayerIdentity TrackCreated(WorldSession session, Vehicle vehicle,string reservation="")
        {
            Require(session); if (created.Count >= 16 || !vehicle.Exists() || vehicle.MemoryAddress == IntPtr.Zero || !vehicle.IsOwnedByShvdnScript)
                throw new InvalidOperationException("无法登记本实例临时车辆。");
            var identity = Id(vehicle); created[identity] = vehicle; observed[identity] = vehicle;if(reservation.Length!=0)creationReservations[identity]=reservation; return identity;
        }
        public void DeleteManaged(WorldSession session, PlayerIdentity identity)
        {
            Require(session);
            if (!created.TryGetValue(identity, out var entity)) throw new InvalidOperationException("此对象不在本实例创建记录中，拒绝清理。");
            var item = Snapshot(session, entity, identity);
            if (item == null || !Safe(item, true) || item.Frozen || !entity.IsOwnedByShvdnScript) throw new InvalidOperationException("清理前实体归属、乘员或安全条件已变化。");
            var final = Snapshot(session, entity, identity);
            if (final == null || !Safe(final, true) || final.Frozen || !entity.IsOwnedByShvdnScript || !entity.Exists() || !Id(entity).Equals(identity)) throw new InvalidOperationException("清理前实体身份或乘员变化。");
            // Delete only this still-owned receipt. The SDK Entity.Delete wrapper first takes ownership.
            using(var handle=new OutputArgument(entity.Handle)){Function.Call(Hash.DELETE_ENTITY,handle);}
            if (!entity.Exists()) { created.Remove(identity); observed.Remove(identity);if(creationReservations.TryGetValue(identity,out var reservation)){spawnQuota?.ConfirmDeleted(reservation,0);creationReservations.Remove(identity);} }
        }
        public void Log(string operation, string details) => log(operation, details);
    }
}
