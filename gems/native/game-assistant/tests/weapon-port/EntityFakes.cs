namespace GTA
{
    public static class Game { public static Player Player => Runtime.Read("Game.Player", () => Runtime.PlayerValue); }
    public sealed class Player
    {
        public int HandleValue = 1; public Ped? CharacterValue;
        public int Handle => Runtime.Read("Player.Handle", () => HandleValue);
        public Ped Character => Runtime.Read("Player.Character", () => CharacterValue!);
    }
    public readonly struct Model { public readonly int Hash; public Model(int hash) { Hash = hash; } }
    public sealed class Ped
    {
        public int HandleValue, ModelValue = 100; public IntPtr AddressValue = (IntPtr)123456; public bool ExistsValue = true, DeadValue;
        public readonly Dictionary<uint, Item> Items = new(); public readonly Dictionary<uint, int> Pools = new();
        public uint CurrentValue = (uint)WeaponHash.Unarmed; public uint[]? HashOverride;
        public Ped(int handle) { HandleValue = handle; Weapons = new WeaponCollection(this); Runtime.Peds[handle] = this; }
        public int Handle => Runtime.Read("Ped.Handle", () => HandleValue);
        public Model Model => Runtime.Read("Ped.Model", () => new Model(ModelValue));
        public IntPtr MemoryAddress => Runtime.Read("Ped.MemoryAddress", () => AddressValue);
        public bool Exists() => Runtime.Read("Ped.Exists", () => ExistsValue);
        public bool IsDead => Runtime.Read("Ped.IsDead", () => DeadValue);
        public WeaponCollection Weapons { get; }
    }
}
