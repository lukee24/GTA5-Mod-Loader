// A controlled offline API port for compiling and exercising the REAL adapter.
// These types are not the SHVDNE SDK and cannot establish game compatibility.
namespace GTA
{
    public static class Runtime
    {
        public static readonly List<string> Reads = new();public static readonly Dictionary<int,Entity> Handles=new();
        public static readonly List<string> Writes = new();
        public static Action<string>? Before;
        public static T Read<T>(string key, Func<T> value) { Reads.Add(key); Before?.Invoke(key); return value(); }
        public static void Write(string key, Action action) { Writes.Add(key); Before?.Invoke(key); action(); }
        public static void Clear() { Reads.Clear(); Writes.Clear(); Before = null; }
    }
    public readonly struct Vector3
    {
        public readonly float X, Y, Z;
        public Vector3(float x, float y, float z) { X = x; Y = y; Z = z; }
        public static Vector3 operator -(Vector3 left, Vector3 right) => new(left.X - right.X, left.Y - right.Y, left.Z - right.Z);
        public float Length() => (float)Math.Sqrt(X * X + Y * Y + Z * Z);
    }
    public readonly struct Model { public readonly int Hash; public Model(int hash) { Hash = hash; } }
    public class Entity
    {
        public int HandleValue; public Model ModelValue; public IntPtr AddressValue;
        public bool ExistsValue = true, FrozenValue, OwnedValue, ShvdnOwnedValue, PersistentValue, AttachedValue, AirValue, WaterValue;
        public float SpeedValue; public Vector3 PositionValue;
        public bool ThrowAfterFreeze;
        public int Handle => Runtime.Read(Key("Handle"), () => {Runtime.Handles[HandleValue]=this;return HandleValue;});
        public Model Model => Runtime.Read(Key("Model"), () => ModelValue);
        public IntPtr MemoryAddress => Runtime.Read(Key("Address"), () => AddressValue);
        public bool Exists() => Runtime.Read(Key("Exists"), () => ExistsValue);
        public bool IsPositionFrozen { get => Runtime.Read(Key("Frozen"), () => FrozenValue); set => Runtime.Write(Key("Freeze=" + value), () => { FrozenValue = value; if (ThrowAfterFreeze) throw new InvalidOperationException("injected setter failure"); }); }
        public bool IsOwnedByAnyScript => Runtime.Read(Key("Owned"), () => OwnedValue);
        public bool IsOwnedByShvdnScript => Runtime.Read(Key("ShvdnOwned"), () => ShvdnOwnedValue);
        public bool IsPersistent => Runtime.Read(Key("Persistent"), () => PersistentValue);
        public bool IsAttached() => Runtime.Read(Key("Attached"), () => AttachedValue);
        public bool IsInAir => Runtime.Read(Key("Air"), () => AirValue);
        public bool IsInWater => Runtime.Read(Key("Water"), () => WaterValue);
        public Vector3 Position => Runtime.Read(Key("Position"), () => PositionValue);
        public float Speed => Runtime.Read(Key("Speed"), () => SpeedValue);
        public void Delete() => throw new InvalidOperationException("SDK wrapper taking ownership must not be used");
        public string Key(string member) => "Entity[" + HandleValue + "]." + member;
    }
    public sealed class Ped : Entity
    {
        public bool DeadValue, PlayerValue; public Vehicle? VehicleValue;
        public bool IsDead => Runtime.Read(Key("Dead"), () => DeadValue);
        public bool IsPlayer => Runtime.Read(Key("Player"), () => PlayerValue);
        public Vehicle? CurrentVehicle => Runtime.Read(Key("CurrentVehicle"), () => VehicleValue);
    }
    public sealed class Vehicle : Entity
    {
        public Ped[] OccupantsValue = Array.Empty<Ped>();
        public Ped[] Occupants => Runtime.Read(Key("Occupants"), () => OccupantsValue);
    }
    public sealed class Wanted
    {
        public bool IgnoreValue, DispatchValue;
        public void SetPoliceIgnorePlayer(bool value) => Runtime.Write("Wanted.Ignore=" + value, () => IgnoreValue = value);
        public bool DispatchesCopsForPlayer { set => Runtime.Write("Wanted.Dispatch=" + value, () => DispatchValue = value); }
    }
    public sealed class Player
    {
        public int HandleValue = 1; public Ped CharacterValue = null!; public Wanted WantedValue = new();
        public int Handle => Runtime.Read("Player.Handle", () => HandleValue);
        public Ped Character => Runtime.Read("Player.Character", () => CharacterValue);
        public Wanted Wanted => Runtime.Read("Player.Wanted", () => WantedValue);
    }
    public static class Game
    {
        public static Player PlayerValue = null!; public static Version VersionValue = new(1, 0, 1013, 33); public static float TimeScaleValue = 1;
        public static Player Player => Runtime.Read("Game.Player", () => PlayerValue);
        public static Version FileVersion => Runtime.Read("Game.FileVersion", () => VersionValue);
        public static float TimeScale { set => Runtime.Write("Game.TimeScale=" + value, () => TimeScaleValue = value); }
    }
    public enum Weather { ExtraSunny, Clear, Clouds, Overcast, Raining, ThunderStorm, Foggy, Smog, Snowing, Blizzard, Snowlight, Clearing, Neutral, Christmas, Halloween, Unknown }
    public static class World
    {
        public static Entity[] Entities = Array.Empty<Entity>(); public static Weather WeatherValue = Weather.Clear, NextWeatherValue = Weather.Clouds;
        public static float GravityValue = 9.8f, PedDensityValue = 1, TrafficDensityValue = 1;
        public static Weather Weather { get => Runtime.Read("World.Weather", () => WeatherValue); set => Runtime.Write("World.Weather=" + value, () => WeatherValue = value); }
        public static Weather NextWeather => Runtime.Read("World.NextWeather", () => NextWeatherValue);
        public static float GravityLevel { set => Runtime.Write("World.Gravity=" + value, () => GravityValue = value); }
        public static void SetAmbientPedDensityMultiplierThisFrame(float value) => Runtime.Write("World.PedDensity=" + value, () => PedDensityValue = value);
        public static void SetAmbientVehicleDensityMultiplierThisFrame(float value) => Runtime.Write("World.TrafficDensity=" + value, () => TrafficDensityValue = value);
        public static Entity[] GetNearbyEntities(Vector3 point, float radius) => Runtime.Read("World.Nearby", () => Entities);
    }
}
namespace GTA.Chrono
{
    public static class GameClock
    {
        public static int HourValue = 6, MinuteValue = 7, SecondValue = 8; public static bool PausedValue;
        public static int Hour => GTA.Runtime.Read("Clock.Hour", () => HourValue);
        public static int Minute => GTA.Runtime.Read("Clock.Minute", () => MinuteValue);
        public static int Second => GTA.Runtime.Read("Clock.Second", () => SecondValue);
        public static bool IsPaused { set => GTA.Runtime.Write("Clock.Paused=" + value, () => PausedValue = value); }
    }
}
namespace GTA.Native
{
    public enum Hash { SET_CLOCK_TIME, DELETE_ENTITY }
    public sealed class OutputArgument:IDisposable{public readonly int Value;public OutputArgument(int value){Value=value;}public void Dispose(){}}
    public static class Function
    {
        public static void Call(Hash hash,OutputArgument handle){if(hash!=Hash.DELETE_ENTITY)throw new Exception("Unexpected named native");var e=GTA.Runtime.Handles[handle.Value];GTA.Runtime.Write("Native.DELETE_ENTITY("+handle.Value+")",()=>e.ExistsValue=false); }
        public static void Call(Hash hash, params int[] values) => GTA.Runtime.Write("Native." + hash + "(" + string.Join(",", values) + ")", () => {
            if (hash != Hash.SET_CLOCK_TIME || values.Length != 3) throw new ArgumentException("Unexpected native contract");
            GTA.Chrono.GameClock.HourValue = values[0]; GTA.Chrono.GameClock.MinuteValue = values[1]; GTA.Chrono.GameClock.SecondValue = values[2];
        });
    }
}
