using System;
using System.Collections.Generic;

namespace Gems.GameAssistant
{
    public readonly struct WorldSession : IEquatable<WorldSession>
    {
        public readonly PlayerIdentity Actor;
        public readonly string Build;
        public readonly long Continuity;
        public WorldSession(PlayerIdentity actor, string build, long continuity = 0) { Actor = actor; Build = build; Continuity = continuity; }
        public bool Equals(WorldSession other) => Actor.Equals(other.Actor) && Build == other.Build && Continuity == other.Continuity;
    }
    public sealed class WorldView
    {
        public int Hour = 12, Minute, PedPercent = 100, TrafficPercent = 100, SpeedPercent = 100, GravityIndex;
        public bool PedActive, TrafficActive, PauseRequested, HasPreviousTime;
        public int FrozenCount, ManagedCount, PlanCount;
        public int InterruptedFrozenCount, GlobalRequestCount;
        public int UnconfirmedFrozenCount;
        public bool PreviousSessionPending;
        public string Build = "未读取", Clock = "未读取", Weather = "未读取", PlanKind = "", Notice = "开发测试 · 游戏效果未实测";
    }
    public sealed class WeatherChoice
    {
        public readonly string Id, Name, Icon;
        public WeatherChoice(string id, string name, string icon) { Id = id; Name = name; Icon = icon; }
    }
    public static class WorldOptions
    {
        // SDK-declared candidates, not a per-build supported-weather claim.
        public static readonly WeatherChoice[] Weather = {
            new WeatherChoice("ExtraSunny", "艳阳", "sun"), new WeatherChoice("Clear", "晴天", "sun"),
            new WeatherChoice("Clouds", "多云", "cloud"), new WeatherChoice("Overcast", "阴天", "cloud"),
            new WeatherChoice("Raining", "雨", "rain"), new WeatherChoice("ThunderStorm", "雷暴", "thunder"),
            new WeatherChoice("Foggy", "雾", "fog"), new WeatherChoice("Smog", "烟霾", "fog"),
            new WeatherChoice("Snowing", "雪", "snow"), new WeatherChoice("Blizzard", "暴风雪", "snow"),
            new WeatherChoice("Snowlight", "小雪", "snow"), new WeatherChoice("Clearing", "雨后转晴", "sun"),
            new WeatherChoice("Neutral", "中性天气", "cloud"), new WeatherChoice("Christmas", "节日雪", "snow"),
            new WeatherChoice("Halloween", "万圣节天气", "cloud") };
        public static readonly float[] Gravity = { 9.8f, 2.4f, 0.1f, 0f };
        public static bool Finite(float value) => !float.IsNaN(value) && !float.IsInfinity(value);
    }
    public sealed class WorldEntity
    {
        public readonly PlayerIdentity Identity;
        public readonly string Kind;
        public readonly bool Frozen, OwnedByScript, Persistent, Occupied, Attached, IsPlayer, IsPlayerVehicle;
        public readonly float Distance, Speed;
        public WorldEntity(PlayerIdentity identity, string kind, bool frozen, bool ownedByScript, bool persistent,
            bool occupied, bool attached, bool isPlayer, bool isPlayerVehicle, float distance, float speed)
        { Identity = identity; Kind = kind; Frozen = frozen; OwnedByScript = ownedByScript; Persistent = persistent;
          Occupied = occupied; Attached = attached; IsPlayer = isPlayer; IsPlayerVehicle = isPlayerVehicle; Distance = distance; Speed = speed; }
    }
    // The production adapter rechecks the story guard and session before each real operation.
    // No global-memory state getter is required for one-time requests.
    public interface IWorldPort
    {
        bool TrySession(out WorldSession session);
        TimeSpan ReadTime(WorldSession session);
        void SetTime(WorldSession session, TimeSpan value);
        void PauseClock(WorldSession session, bool paused);
        void SetPedDensity(WorldSession session, float value);
        void SetTrafficDensity(WorldSession session, float value);
        void SetTimeScale(WorldSession session, float value);
        void SetGravity(WorldSession session, float value);
        void SetPoliceIgnore(WorldSession session, bool value);
        void SetPoliceDispatch(WorldSession session, bool value);
        string ReadWeather(WorldSession session);
        void SetWeather(WorldSession session, string candidate);
        IReadOnlyList<WorldEntity> Nearby(WorldSession session, float radius, int limit);
        WorldEntity? ReadEntity(WorldSession session, PlayerIdentity identity);
        void SetFrozen(WorldSession session, PlayerIdentity identity, bool expected, bool desired);
        void DeleteManaged(WorldSession session, PlayerIdentity identity);
        void Log(string operation, string details);
    }
}
