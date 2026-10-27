using Gems.GameAssistant;

namespace GTA
{
    public enum WeaponHash : uint { Unarmed = 0xa2719263, Pistol = 0x1b06d571, Target = 0xabcdef01, Other = 0xabcdef02 }
    public enum WeaponTint { Normal = 0, Green = 1 }
    public enum WeaponAttachmentPoint { Clip = 1, GunRoot = 2 }
    public enum WeaponComponentHash : uint { First = 11, Second = 12, Invalid = 0xffffffff }
    public sealed record Write(string Method, int Ped, uint Hash, int Amount = 0, bool Equip = false, bool Loaded = false, uint Component = 0, bool? Desired = null);
    public sealed class Definition
    {
        public uint Hash; public int Slot; public uint AmmoType; public string Name = "Fixture";
        public bool Valid = true, AssetValid = true, Loaded = true;
    }
    public sealed class Item
    {
        public uint Hash; public int Ammo, Clip, MaxAmmo = 1000, Tint, TintCount = 8; public bool ClipKnown = true, MaxKnown = true;
        public List<WeaponComponent> Components = new(); public int? CountOverride;
    }
    public static class Runtime
    {
        public static Player PlayerValue = null!;
        public static readonly Dictionary<uint, Definition> Definitions = new();
        public static readonly Dictionary<int, Ped> Peds = new();
        public static readonly List<string> Reads = new(); public static readonly List<Write> Writes = new();
        public static Action<string>? OnRead; public static Action<Write>? BeforeWrite, AfterWrite;
        public static WeaponHash[]? DefinitionOverride;
        public static WeaponComponentHash[]? ComponentOverride;
        public static readonly Dictionary<(uint, uint), bool> Compatibility = new();
        public static T Read<T>(string name, Func<T> value) { Reads.Add(name); OnRead?.Invoke(name); return value(); }
        public static void Submit(Write write, Action mutate) { BeforeWrite?.Invoke(write); Writes.Add(write); mutate(); AfterWrite?.Invoke(write); }
        public static Definition Def(uint hash) => Definitions.TryGetValue(hash, out var d) ? d : new Definition { Hash = hash, Valid = false, AssetValid = false };
        public static void Clear() { Reads.Clear(); Writes.Clear(); OnRead = null; BeforeWrite = AfterWrite = null; }
    }
    public sealed class WeaponCollection
    {
        private readonly Ped ped; public WeaponCollection(Ped ped) { this.ped = ped; }
        public WeaponHash[] GetAllWeaponHashes() => Runtime.Read("Inventory.Hashes", () => (ped.HashOverride ?? ped.Items.Keys.ToArray()).Select(h => (WeaponHash)h).ToArray());
        public bool HasWeapon(WeaponHash hash) => Runtime.Read("Inventory.Has:" + (uint)hash, () => ped.Items.ContainsKey((uint)hash));
        public bool IsWeaponValid(WeaponHash hash) => Runtime.Read("Inventory.Valid:" + (uint)hash, () => Runtime.Def((uint)hash).Valid);
        public Weapon Current => Runtime.Read("Inventory.Current", () => new Weapon(ped, ped.Items.TryGetValue(ped.CurrentValue, out var item) ? item : new Item { Hash = ped.CurrentValue }));
        public Weapon? this[WeaponHash hash] => Runtime.Read("Inventory.Item:" + (uint)hash, () => ped.Items.TryGetValue((uint)hash, out var item) ? new Weapon(ped, item) : null);
        public bool TryGetWeaponHashBySlotHash(int slot, out WeaponHash hash)
        {
            var match = Runtime.Read("Inventory.Slot", () => ped.Items.Keys.FirstOrDefault(h => Runtime.Def(h).Slot == slot)); hash = (WeaponHash)match; return match != 0;
        }
        public Weapon Give(WeaponHash hash, int ammo, bool equip, bool loaded)
        {
            Runtime.Submit(new Write("Give", ped.HandleValue, (uint)hash, ammo, equip, loaded), () => { ped.Items[(uint)hash] = new Item { Hash = (uint)hash, Ammo = ammo }; ped.Pools[Runtime.Def((uint)hash).AmmoType] = ammo; });
            return new Weapon(ped, ped.Items[(uint)hash]);
        }
        public void Remove(WeaponHash hash) => Runtime.Submit(new Write("Remove", ped.HandleValue, (uint)hash), () => ped.Items.Remove((uint)hash));
        public void RemoveAll() => Runtime.Submit(new Write("RemoveAll", ped.HandleValue, 0), () => { foreach (var h in ped.Items.Keys.Where(h => h != (uint)WeaponHash.Unarmed).ToArray()) ped.Items.Remove(h); ped.CurrentValue = (uint)WeaponHash.Unarmed; });
    }
    public sealed class Weapon
    {
        private readonly Ped ped; private readonly Item item; public Weapon(Ped ped, Item item) { this.ped = ped; this.item = item; }
        public static WeaponHash[] GetAllWeaponHashesForHumanPeds() => Runtime.Read("Definitions.Hashes", () => Runtime.DefinitionOverride ?? Runtime.Definitions.Keys.Select(h => (WeaponHash)h).ToArray());
        public WeaponHash Hash => Runtime.Read("Weapon.Hash", () => (WeaponHash)item.Hash);
        public int Ammo => Runtime.Read("Weapon.Ammo", () => item.Ammo);
        public int MaxAmmo => Runtime.Read("Weapon.MaxAmmo", () => item.MaxAmmo);
        public WeaponTint Tint { get => Runtime.Read("Weapon.Tint", () => (WeaponTint)item.Tint); set => Runtime.Submit(new Write("Weapon.Tint", ped.HandleValue, item.Hash, (int)value), () => item.Tint = (int)value); }
        public int TintCount => Runtime.Read("Weapon.TintCount", () => item.TintCount);
        public bool InfiniteAmmo { set => Runtime.Submit(new Write("InfiniteAmmo", ped.HandleValue, item.Hash, Desired: value), () => { }); }
        public bool InfiniteAmmoClip { set => Runtime.Submit(new Write("InfiniteAmmoClip", ped.HandleValue, 0, Desired: value), () => { }); }
        public WeaponComponents Components => new(ped, item);
    }
    public sealed class WeaponComponents
    {
        private readonly Item item; private readonly Ped ped; public WeaponComponents(Ped ped, Item item) { this.ped = ped; this.item = item; }
        public int Count => Runtime.Read("Components.Count", () => item.CountOverride ?? item.Components.Count);
        public WeaponComponent this[int index] => Runtime.Read("Components.Item", () => item.Components[index].Bind(ped, item));
        public WeaponComponent this[WeaponComponentHash hash] => Runtime.Read("Components.HashItem", () => (item.Components.FirstOrDefault(c => c.HashValue == hash) ?? new WeaponComponent { HashValue = WeaponComponentHash.Invalid }).Bind(ped,item));
    }
    public sealed class WeaponComponent
    {
        public WeaponComponentHash HashValue; public bool ActiveValue, EnabledValue; public int LiveryValue; public WeaponAttachmentPoint AttachmentValue = WeaponAttachmentPoint.Clip;
        private Ped ped = null!; private Item item = null!;
        public WeaponComponent Bind(Ped target, Item weapon) { ped = target; item = weapon; return this; }
        public static WeaponComponentHash[] GetAllHashes() => Runtime.Read("Component.Global", () => Runtime.ComponentOverride ?? Runtime.Peds.Values.SelectMany(p => p.Items.Values).SelectMany(i => i.Components).Select(c => c.HashValue).Distinct().ToArray());
        public WeaponComponentHash ComponentHash => Runtime.Read("Component.Hash", () => HashValue);
        public WeaponAttachmentPoint AttachmentPoint => Runtime.Read("Component.Attachment", () => AttachmentValue);
        public bool Active { get => Runtime.Read("Component.Active", () => ActiveValue); set => Runtime.Submit(new Write("Component.Active", ped.HandleValue, item.Hash, Component: (uint)HashValue, Desired: value), () => ActiveValue = value); }
    }
    public readonly struct WeaponAsset
    {
        private readonly uint hash; public WeaponAsset(uint hash) { this.hash = hash; } public WeaponAsset(WeaponHash hash) { this.hash = (uint)hash; }
        public string HumanName { get { var h = hash; return Runtime.Read("Asset.Name", () => Runtime.Def(h).Name); } }
        public int SlotHash { get { var h = hash; return Runtime.Read("Asset.Slot", () => Runtime.Def(h).Slot); } }
        public bool IsValidAsWeaponHash { get { var h = hash; return Runtime.Read("Asset.Valid", () => Runtime.Def(h).AssetValid); } }
        public bool IsLoaded { get { var h = hash; return Runtime.Read("Asset.Loaded", () => Runtime.Def(h).Loaded); } }
        public void Request() => Runtime.Submit(new Write("RequestAsset", 0, hash), () => { });
        public void MarkAsNoLongerNeeded() => Runtime.Submit(new Write("ReleaseAsset", 0, hash), () => { });
    }
}
namespace GTA.Native
{
    public static class WeaponNative
    {
        public static T Call<T>(Hash hash, params object[] args)
        {
            return GTA.Runtime.Read("Native." + hash, () =>
            {
                if (hash == Hash.DOES_WEAPON_TAKE_WEAPON_COMPONENT)
                {
                    var weaponHash = (uint)args[0]; var componentHash = (uint)args[1];
                    return (T)(object)(GTA.Runtime.Compatibility.TryGetValue((weaponHash, componentHash), out var compatible) ? compatible : GTA.Runtime.Peds.Values.Any(p => p.Items.TryGetValue(weaponHash, out var w) && w.Components.Any(c => (uint)c.HashValue == componentHash)));
                }
                var ped = GTA.Runtime.Peds[(int)args[0]]; var target = (uint)args[1];
                object result;
                switch (hash)
                {
                    case Hash.GET_PED_AMMO_TYPE_FROM_WEAPON: result = GTA.Runtime.Def(target).AmmoType; break;
                    case Hash.GET_PED_AMMO_BY_TYPE: result = ped.Pools.GetValueOrDefault(target); break;
                    case Hash.GET_AMMO_IN_CLIP: var clip = ped.Items[target]; ((OutputArgument)args[2]).Value = clip.Clip; result = clip.ClipKnown; break;
                    case Hash.GET_MAX_AMMO: var max = ped.Items[target]; ((OutputArgument)args[2]).Value = max.MaxAmmo; result = max.MaxKnown; break;
                    case Hash.IS_PED_WEAPON_COMPONENT_ACTIVE: result = ped.Items[target].Components.Single(c => (uint)c.HashValue == (uint)args[2]).EnabledValue; break;
                    case Hash.GET_PED_WEAPON_COMPONENT_TINT_INDEX: result = ped.Items[target].Components.Single(c => (uint)c.HashValue == (uint)args[2]).LiveryValue; break;
                    default: throw new InvalidOperationException("Unexpected read native " + hash);
                }
                return (T)result;
            });
        }
        public static void Call(Hash hash, params object[] args)
        {
            if (hash != Hash.ADD_AMMO_TO_PED) throw new InvalidOperationException("Unexpected write native " + hash);
            var ped = GTA.Runtime.Peds[(int)args[0]]; var target = (uint)args[1]; var amount = (int)args[2];
            GTA.Runtime.Submit(new GTA.Write("ADD_AMMO_TO_PED", ped.HandleValue, target, amount), () =>
            {
                var type = GTA.Runtime.Def(target).AmmoType; ped.Pools[type] = ped.Pools.GetValueOrDefault(type) + amount;
                foreach (var item in ped.Items.Values.Where(i => GTA.Runtime.Def(i.Hash).AmmoType == type)) item.Ammo += amount;
            });
        }
    }
}
