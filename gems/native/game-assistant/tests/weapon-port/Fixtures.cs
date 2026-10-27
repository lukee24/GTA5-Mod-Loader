using Gems.GameAssistant;

namespace WeaponPortFixtures
{
    public sealed class Fixture
    {
        public readonly GTA.Ped Ped; public readonly GTA.Player Player; public readonly GtaWeaponPort Port;
        public WeaponSession Session; public bool Allowed = true; public int EligibilityCalls; public Func<bool>? EligibilityOverride;
        public Fixture()
        {
            GTA.Runtime.Clear(); GTA.Runtime.Definitions.Clear(); GTA.Runtime.Peds.Clear(); GTA.Runtime.DefinitionOverride = null;
            GTA.Runtime.Definitions.Add((uint)GTA.WeaponHash.Unarmed, new GTA.Definition { Hash = (uint)GTA.WeaponHash.Unarmed, Slot = 0, AmmoType = 0 });
            GTA.Runtime.Definitions.Add((uint)GTA.WeaponHash.Pistol, new GTA.Definition { Hash = (uint)GTA.WeaponHash.Pistol, Slot = 1, AmmoType = 11 });
            GTA.Runtime.Definitions.Add((uint)GTA.WeaponHash.Target, new GTA.Definition { Hash = (uint)GTA.WeaponHash.Target, Slot = 2, AmmoType = 22 });
            GTA.Runtime.Definitions.Add((uint)GTA.WeaponHash.Other, new GTA.Definition { Hash = (uint)GTA.WeaponHash.Other, Slot = 3, AmmoType = 33 });
            Ped = new GTA.Ped(10); Ped.Items.Add((uint)GTA.WeaponHash.Unarmed, new GTA.Item { Hash = (uint)GTA.WeaponHash.Unarmed });
            Player = new GTA.Player { CharacterValue = Ped }; GTA.Runtime.PlayerValue = Player;
            Port = new GtaWeaponPort(() => { EligibilityCalls++; return EligibilityOverride?.Invoke() ?? Allowed; });
            if (!Port.TrySession(out Session)) throw new Exception("Fixture session unavailable"); Clear();
        }
        public void Clear() { GTA.Runtime.Clear(); EligibilityCalls = 0; }
        public GTA.Item Add(uint hash, int amount = 10)
        {
            var item = new GTA.Item { Hash = hash, Ammo = amount, Clip = Math.Min(amount, 5) }; Ped.Items.Add(hash, item); Ped.Pools[GTA.Runtime.Def(hash).AmmoType] = amount; return item;
        }
    }
    public sealed class Journal : IWeaponJournal
    {
        public Action? OnBegin;
        public readonly List<string> Events = new(); public int UnconfirmedCount => 0;
        public void Verify() { Events.Add("verify"); }
        public string Begin(string action, WeaponSnapshot before, uint hash, int amount, string sourceToken) { Events.Add("begin:" + action); OnBegin?.Invoke(); return "fixture-id"; }
        public void Finish(string id, string state, WeaponSnapshot? after, string detail) { Events.Add("finish:" + state); }
    }
}
