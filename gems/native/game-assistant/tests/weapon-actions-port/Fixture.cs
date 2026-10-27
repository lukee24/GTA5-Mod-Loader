using GTA;
using Gems.GameAssistant;

namespace WeaponActionsPortFixtures;
sealed class Fixture
{
    public const uint Target = (uint)WeaponHash.Target, Other = (uint)WeaponHash.Other, Unarmed = (uint)WeaponHash.Unarmed;
    public readonly Ped Ped; public readonly Player Player; public readonly GtaWeaponPort Port;
    public WeaponSession Session; public bool Allowed = true; public int EligibilityCalls; public Func<bool>? EligibilityOverride;
    public Fixture()
    {
        Runtime.Clear(); Runtime.Definitions.Clear(); Runtime.Peds.Clear(); Runtime.DefinitionOverride = null; Runtime.ComponentOverride = null; Runtime.Compatibility.Clear();
        foreach (var d in new[] { new Definition { Hash = Unarmed, Slot = 0 }, new Definition { Hash = Target, Slot = 1, AmmoType = 22 }, new Definition { Hash = Other, Slot = 2, AmmoType = 33 } }) Runtime.Definitions.Add(d.Hash, d);
        Ped = new Ped(10); Ped.Items.Add(Unarmed, new Item { Hash = Unarmed }); Player = new Player { CharacterValue = Ped }; Runtime.PlayerValue = Player;
        Port = new GtaWeaponPort(() => { EligibilityCalls++; return EligibilityOverride?.Invoke() ?? Allowed; });
        Port.WeaponDetailClock = () => 0; // Other cases test exact elapsed-budget boundaries separately.
        if (!Port.TrySession(out Session)) throw new Exception("Fixture unavailable"); ResetReads();
    }
    public Item Add(uint hash = Target)
    {
        var item = new Item { Hash = hash, Ammo = 18, Clip = 5, Tint = 1 }; Ped.Items.Add(hash, item); Ped.Pools[Runtime.Def(hash).AmmoType] = 18; return item;
    }
    public WeaponComponent AddComponent(Item item, WeaponComponentHash hash = WeaponComponentHash.First, bool installed = false)
    {
        var component = new WeaponComponent { HashValue = hash, ActiveValue = installed, EnabledValue = !installed, LiveryValue = 7 }; item.Components.Add(component); return component;
    }
    public void ResetReads() { Runtime.Clear(); EligibilityCalls = 0; }
}
sealed class ActionJournal : IWeaponActionJournal
{
    public int UnconfirmedCount => 0;
    public readonly List<string> Events = new();
    public void Verify() => Events.Add("verify");
    public string BeginAction(string action,string before,string detail) { Events.Add("begin:"+action); return "fixture-action"; }
    public void FinishAction(string id,string state,string? after,string detail) => Events.Add("finish:"+state);
}
