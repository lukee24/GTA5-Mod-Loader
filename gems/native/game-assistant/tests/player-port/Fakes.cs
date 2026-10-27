using Gems.GameAssistant;

namespace GTA
{
    public readonly record struct MotionWrite(string Method, int Player, int Ped, float? Value);
    public static class Runtime
    {
        public static readonly List<string> Reads = new();
        public static readonly List<MotionWrite> Writes = new();
        public static Action<string>? OnRead;
        public static Action<MotionWrite>? BeforeWrite;
        public static Action<MotionWrite>? AfterWrite;
        public static void Read(string member) { Reads.Add(member); OnRead?.Invoke(member); }
        public static void Write(MotionWrite write) { BeforeWrite?.Invoke(write); Writes.Add(write); AfterWrite?.Invoke(write); }
        public static void Reset() { Reads.Clear(); Writes.Clear(); OnRead = null; BeforeWrite = null; AfterWrite = null; }
    }
    public static class Game
    {
        public static Player PlayerValue = new();
        public static Player Player { get { Runtime.Read("Game.Player"); return PlayerValue; } }
    }
    public sealed class Player
    {
        public int HandleValue = 7;
        public Ped? CharacterValue = new();
        public int Handle { get { Runtime.Read("Player.Handle"); return HandleValue; } }
        public Ped? Character { get { Runtime.Read("Player.Character"); return CharacterValue; } }
        public void SetRunSpeedMultThisFrame(float value) => Runtime.Write(new MotionWrite(nameof(SetRunSpeedMultThisFrame), HandleValue, CharacterValue?.HandleValue ?? 0, value));
        public void SetSwimSpeedMultThisFrame(float value) => Runtime.Write(new MotionWrite(nameof(SetSwimSpeedMultThisFrame), HandleValue, CharacterValue?.HandleValue ?? 0, value));
        public void SetSuperJumpThisFrame() => Runtime.Write(new MotionWrite(nameof(SetSuperJumpThisFrame), HandleValue, CharacterValue?.HandleValue ?? 0, null));
    }
    public sealed class Ped
    {
        public int HandleValue = 17;
        public int ModelValue = 27;
        public IntPtr AddressValue = new(37000);
        public bool ExistsValue = true, DeadValue;
        public int Handle { get { Runtime.Read("Ped.Handle"); return HandleValue; } }
        public Model Model { get { Runtime.Read("Ped.Model"); return new Model(ModelValue); } }
        public IntPtr MemoryAddress { get { Runtime.Read("Ped.MemoryAddress"); return AddressValue; } }
        public bool IsDead { get { Runtime.Read("Ped.IsDead"); return DeadValue; } }
        public bool Exists() { Runtime.Read("Ped.Exists"); return ExistsValue; }
    }
    public readonly struct Model
    {
        private readonly int value;
        public Model(int value) { this.value = value; }
        public int Hash { get { Runtime.Read("Model.Hash"); return value; } }
    }
}

internal sealed class Fixture
{
    public bool Allowed = true;
    public int EligibilityCalls;
    public Func<bool>? EligibilityOverride;
    public readonly GtaPlayerMotionPort Port;
    public readonly GTA.Player Player;
    public readonly GTA.Ped Ped;
    public PlayerMotionSession Session;
    public Fixture(bool establish = true)
    {
        GTA.Runtime.Reset(); Player = new GTA.Player(); Ped = Player.CharacterValue!; GTA.Game.PlayerValue = Player;
        Port = new GtaPlayerMotionPort(() => { EligibilityCalls++; return EligibilityOverride?.Invoke() ?? Allowed; });
        if (establish && !Port.TrySession(out Session)) throw new Exception("Fixture could not establish session.");
        Clear();
    }
    public void Clear() { GTA.Runtime.Reset(); EligibilityCalls = 0; }
}
