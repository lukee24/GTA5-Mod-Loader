using GTA;
using Gems.GameAssistant;
using WeaponPortFixtures;

var passed = 0; var cases = 0; var failures = new List<string>();
const uint Target = (uint)WeaponHash.Target, Pistol = (uint)WeaponHash.Pistol, Other = (uint)WeaponHash.Other, Unarmed = (uint)WeaponHash.Unarmed;
void Check(bool condition, string message) { if (!condition) throw new Exception(message); passed++; }
void Reject(Action action, string message) { try { action(); } catch (Exception e) when (e is InvalidOperationException || e is ArgumentException || e is IOException) { passed++; return; } throw new Exception("Accepted: " + message); }
void Case(string name, Action body) { cases++; try { body(); Console.WriteLine("PASS " + name); } catch (Exception error) { failures.Add(name + ": " + error); Console.WriteLine("FAIL " + name + ": " + error.Message); } }
void NoWrite(string message) => Check(Runtime.Writes.Count == 0, message);
WeaponChoice Choice(uint hash = Target) => new() { Hash = hash, Name = "fixture", SourceToken = "runtime-fixture", SourceAllowed = true };

Case("every entry point rejects ineligible host before GTA access", () =>
{
    var f = new Fixture(); f.Add(Target); var before = f.Port.Read(f.Session, Target);
    foreach (var call in new Action[] { () => f.Port.Definitions(f.Session), () => f.Port.Read(f.Session), () => f.Port.AssetLoaded(f.Session, Target), () => f.Port.RequestAsset(f.Session, Target), () => f.Port.ReleaseAsset(f.Session, Target), () => f.Port.GiveZero(f.Session, before, Target), () => f.Port.AddAmmo(f.Session, before, Target, 1), () => f.Port.RemoveOwned(f.Session, before, Target) })
    { f.Clear(); f.Allowed = false; Reject(call, "ineligible operation"); Check(Runtime.Reads.Count == 0 && Runtime.Writes.Count == 0, "ineligible entry accesses no GTA boundary"); }
});
Case("actual production read enumerates complete fixture fields and definitions", () =>
{
    var f = new Fixture(); var item = f.Add(Pistol, 15); item.Tint = 1; item.Components.Add(new WeaponComponent { HashValue = WeaponComponentHash.Second, ActiveValue = true }); item.Components.Add(new WeaponComponent { HashValue = WeaponComponentHash.First });
    var snapshot = f.Port.Read(f.Session, Target); var state = snapshot.Find(Pistol)!;
    Check(snapshot.Items.Length == 2 && snapshot.Current == Unarmed, "full inventory and current weapon");
    Check(state.Ammo == 15 && state.PoolAmmo == 15 && state.ClipKnown && state.Clip == 5 && state.MaxAmmo == 1000 && state.Tint == 1, "ammo, pool, clip, max and tint preserved");
    Check(state.Components == "0000000b:False/0000000c:True", "all component hashes and activity sorted");
    Check(snapshot.ProbeHash == Target && snapshot.ProbeAmmoType == 22 && snapshot.ProbePoolAmmo == 0, "empty target pool probe");
    var definitions = f.Port.Definitions(f.Session); Check(definitions.Length == 3 && definitions.All(d => d.Valid) && definitions.Single(d => d.Hash == Target).AmmoType == 22, "actual definition routes and unarmed exclusion"); NoWrite("all inventory reads are read-only");
});
Case("invalid inventory and definitions are rejected, never trusted empty", () =>
{
    foreach (var values in new[] { Array.Empty<uint>(), new[] { Unarmed, Unarmed }, new[] { 0u }, Enumerable.Range(1, 513).Select(i => (uint)i).ToArray(), new[] { Unarmed, Target } })
    { var f = new Fixture(); f.Ped.HashOverride = values; Reject(() => f.Port.Read(f.Session), "invalid inventory enumeration"); NoWrite("invalid inventory does not write"); }
    var missingCurrent = new Fixture(); missingCurrent.Ped.CurrentValue = Target; Reject(() => missingCurrent.Port.Read(missingCurrent.Session), "current missing");
    foreach (var values in new[] { Array.Empty<WeaponHash>(), new[] { WeaponHash.Pistol, WeaponHash.Pistol }, Enumerable.Range(0, 4097).Select(i => (WeaponHash)i).ToArray() })
    { var f = new Fixture(); Runtime.DefinitionOverride = values; Reject(() => f.Port.Definitions(f.Session), "invalid definitions"); NoWrite("invalid definitions do not write"); }
});
Case("invalid ammo, native success flags and component bounds stop read", () =>
{
    foreach (var change in new Action<Fixture, Item>[] { (f,w) => w.Ammo = -1, (f,w) => w.Ammo = 1000001, (f,w) => f.Ped.Pools[22] = -1, (f,w) => w.MaxAmmo = 1000001, (f,w) => w.MaxKnown = false, (f,w) => w.Clip = -1, (f,w) => w.CountOverride = -1, (f,w) => w.CountOverride = 513, (f,w) => w.Components.Add(new WeaponComponent { HashValue = WeaponComponentHash.Invalid }) })
    { var f = new Fixture(); var item = f.Add(Target); change(f, item); Reject(() => f.Port.Read(f.Session), "invalid captured property"); NoWrite("invalid state does not write"); }
    var unknown = new Fixture(); unknown.Add(Target).ClipKnown = false; Check(!unknown.Port.Read(unknown.Session).Find(Target)!.ClipKnown, "failed clip read is explicit unknown, not a claimed zero reading");
});
Case("all previewed fields are rechecked before a write", () =>
{
    foreach (var change in new Action<Fixture, Item>[] { (f,w) => w.Ammo++, (f,w) => f.Ped.Pools[22]++, (f,w) => w.Clip++, (f,w) => w.Tint++, (f,w) => w.MaxAmmo--, (f,w) => w.Components.Add(new WeaponComponent { HashValue = WeaponComponentHash.First, ActiveValue = true }), (f,w) => f.Ped.CurrentValue = Target, (f,w) => f.Add(Pistol) })
    { var f = new Fixture(); var item = f.Add(Target); var before = f.Port.Read(f.Session, Target); change(f, item); f.Clear(); Reject(() => f.Port.AddAmmo(f.Session, before, Target, 1), "preview field changed"); NoWrite("stale preview never writes"); }
});
Case("actor changes, zero address and eligibility loss revoke permission", () =>
{
    foreach (var change in new Action<Fixture>[] { f => f.Player.HandleValue++, f => f.Ped.HandleValue++, f => f.Ped.ModelValue++, f => f.Ped.AddressValue += 1, f => f.Ped.AddressValue = IntPtr.Zero, f => f.Ped.DeadValue = true, f => f.Ped.ExistsValue = false, f => f.Player.CharacterValue = null })
    { var f = new Fixture(); change(f); f.Clear(); Reject(() => f.Port.RequestAsset(f.Session, Target), "actor changed"); NoWrite("actor change prevents asset request"); }
    var same = new Fixture(); same.Allowed = false; Reject(() => same.Port.RequestAsset(same.Session, Target), "eligibility denied"); same.Allowed = true;
    Check(same.Port.TrySession(out var next) && next.Epoch > same.Session.Epoch, "same actor gets new epoch after denied access"); Reject(() => same.Port.RequestAsset(same.Session, Target), "old epoch never revives"); NoWrite("old permission not used");
});
Case("last eligibility callback and final Character capture cannot retarget", () =>
{
    var f = new Fixture(); f.EligibilityOverride = () => { if (f.EligibilityCalls == 3) f.Ped.ModelValue++; return true; };
    Reject(() => f.Port.RequestAsset(f.Session, Target), "last callback actor changed"); NoWrite("changed callback actor does not request asset");
    f = new Fixture(); var characterReads = 0; var original = f.Ped;
    Runtime.OnRead = member => { if (member == "Player.Character" && ++characterReads == 3) f.Player.CharacterValue = new Ped(99); };
    f.Port.RequestAsset(f.Session, Target);
    Check(characterReads == 2 && f.Player.CharacterValue == original, "final validated Ped is captured, not fetched a third time");
    Check(Runtime.Writes.Count == 1 && Runtime.Writes[0].Method == "RequestAsset", "single explicitly requested asset call");
});
Case("typed grant and remove plus named ammo native route exact parameters", () =>
{
    var f = new Fixture(); var before = f.Port.Read(f.Session, Target); f.Clear(); f.Port.GiveZero(f.Session, before, Target);
    Check(Runtime.Writes.SequenceEqual(new[] { new Write("Give", f.Ped.HandleValue, Target, 0, false, false) }), "zero ammo, no equip, no ammo-loaded flags");
    var granted = f.Port.Read(f.Session, Target); f.Clear(); f.Port.AddAmmo(f.Session, granted, Target, 7);
    Check(Runtime.Writes.SequenceEqual(new[] { new Write("ADD_AMMO_TO_PED", f.Ped.HandleValue, Target, 7) }), "addition uses named native and exact amount");
    var filled = f.Port.Read(f.Session, Target); f.Clear(); f.Port.RemoveOwned(f.Session, filled, Target);
    Check(Runtime.Writes.SequenceEqual(new[] { new Write("Remove", f.Ped.HandleValue, Target) }), "removes only selected owned candidate"); Check(f.Ped.Items.Keys.SequenceEqual(new[] { Unarmed }) && f.Ped.Pools[22] == 7, "unarmed preserved and residual pool not erased");
});
Case("write exceptions revoke the session and never replay automatically", () =>
{
    foreach (var after in new[] { false, true }) foreach (var action in new[] { "give", "ammo", "remove" })
    {
        var f = new Fixture(); if (action != "give") f.Add(Target); var before = f.Port.Read(f.Session, Target); f.Clear();
        Action call = action == "give" ? () => f.Port.GiveZero(f.Session, before, Target) : action == "ammo" ? () => f.Port.AddAmmo(f.Session, before, Target, 1) : () => f.Port.RemoveOwned(f.Session, before, Target);
        Action<Write> fail = _ => throw new IOException("injected write failure"); if (after) Runtime.AfterWrite = fail; else Runtime.BeforeWrite = fail;
        Reject(call, "write failure observable"); Check(Runtime.Writes.Count == (after ? 1 : 0), "partial write count accurately retained"); f.Clear();
        Check(f.Port.TrySession(out var next) && next.Epoch > before.Session.Epoch, "write exception revokes epoch"); Reject(call, "old write token refused after recovery"); NoWrite("failed request never replayed with old permission");
    }
});
Case("real controller and port grant, journal ordering and conditional remove", () =>
{
    var f = new Fixture(); var journal = new Journal(); var controller = new WeaponController(f.Port, journal, (_, _) => { }); var now = DateTime.UtcNow;
    controller.Refresh(); Check(controller.ReadValid, "refresh reads fixture inventory"); f.Clear(); controller.Execute("grant", Choice(), 0, now); NoWrite("preview does not request or write");
    controller.Execute("grant", Choice(), 0, now); Check(Runtime.Writes.Count == 1 && Runtime.Writes[0].Method == "RequestAsset", "confirmation requests asset only");
    Runtime.BeforeWrite = write => { if (write.Method == "Give") Check(journal.Events.Contains("begin:grant"), "durable intent starts before write boundary"); };
    controller.Tick(now); Check(controller.Owned.Count == 1 && controller.Owned[0].Confirmed && controller.ReadValid, "grant readback establishes conditional local ownership");
    Check(journal.Events.Contains("finish:observed-not-game-tested"), "journal does not claim gameplay tested");
    f.Clear(); controller.Execute("remove", Choice(), 0, now); NoWrite("remove first click is preview"); controller.Execute("remove", Choice(), 0, now);
    Check(Runtime.Writes.Count == 1 && Runtime.Writes[0].Method == "Remove" && controller.Owned[0].Removed, "second confirmation removes only unchanged owned target");
});
Case("controller rejects occupied slots, existing pools and sharing for grant", () =>
{
    foreach (var conflict in new[] { "already", "slot", "pool", "shared" })
    {
        var f = new Fixture();
        if (conflict == "already") f.Add(Target);
        if (conflict == "slot") { f.Add(Other); Runtime.Def(Other).Slot = 2; }
        if (conflict == "pool") f.Ped.Pools[22] = 1;
        if (conflict == "shared") { Runtime.Def(Other).AmmoType = 22; f.Add(Other, 0); }
        var controller = new WeaponController(f.Port, new Journal(), (_, _) => { }); f.Clear(); controller.Execute("grant", Choice(), 0, DateTime.UtcNow); controller.Execute("grant", Choice(), 0, DateTime.UtcNow);
        Check(controller.Confirmation == "" && !controller.Pending, "grant conflict denied: " + conflict); NoWrite("grant conflict has no asset or inventory write: " + conflict);
    }
});
Case("shared ammo uses every member cap and pool agreement", () =>
{
    foreach (var mismatch in new[] { "cap", "pool" })
    {
        var f = new Fixture(); f.Add(Target, 15); Runtime.Def(Other).AmmoType = 22; var other = f.Add(Other, 15);
        var reads = 0;
        Action<string> mismatchingPool = member => { if (member == "Native.GET_PED_AMMO_BY_TYPE") f.Ped.Pools[22] = ++reads % 3 == 2 ? 14 : 15; };
        if (mismatch == "cap") other.MaxAmmo = 20; else Runtime.OnRead = mismatchingPool;
        var before = f.Port.Read(f.Session, Target); f.Clear(); Reject(() => f.Port.AddAmmo(f.Session, before, Target, 10), "shared cap/pool mismatch " + mismatch); NoWrite("port rejects unsafe shared addition " + mismatch);
        reads = 0; if (mismatch == "pool") Runtime.OnRead = mismatchingPool;
        var controller = new WeaponController(f.Port, new Journal(), (_, _) => { }); controller.Execute("ammo", Choice(), 10, DateTime.UtcNow); controller.Execute("ammo", Choice(), 10, DateTime.UtcNow);
        Check(controller.Confirmation == "", "controller also denies shared boundary " + mismatch); NoWrite("controller shared boundary no writes " + mismatch);
    }
    var valid = new Fixture(); valid.Add(Target, 15); Runtime.Def(Other).AmmoType = 22; valid.Add(Other, 15).MaxAmmo = 20;
    var c = new WeaponController(valid.Port, new Journal(), (_, _) => { }); c.Execute("ammo", Choice(), 5, DateTime.UtcNow); valid.Clear(); c.Execute("ammo", Choice(), 5, DateTime.UtcNow);
    Check(Runtime.Writes.Count == 1 && Runtime.Writes[0].Method == "ADD_AMMO_TO_PED" && valid.Ped.Items[Target].Ammo == 20 && valid.Ped.Items[Other].Ammo == 20, "exact shared minimum headroom accepted and both members read back");
});
Case("resource wait, timeout and interrupted epoch never mutate inventory", () =>
{
    foreach (var end in new[] { "timeout", "cancel", "eligibility" })
    {
        var f = new Fixture(); Runtime.Def(Target).Loaded = false; var c = new WeaponController(f.Port, new Journal(), (_, _) => { }); var now = DateTime.UtcNow;
        c.Execute("grant", Choice(), 0, now); c.Execute("grant", Choice(), 0, now); f.Clear(); c.Tick(now.AddSeconds(1)); Check(c.Pending && Runtime.Writes.Count == 0, "asset wait does not block or grant");
        if (end == "timeout") c.Tick(now.AddSeconds(6)); else if (end == "cancel") c.Cancel("test cancel"); else { f.Allowed = false; c.Tick(now.AddSeconds(2)); }
        Check(!c.Pending && Runtime.Writes.All(w => w.Method == "ReleaseAsset") && !f.Ped.Items.ContainsKey(Target), "wait termination no grant: " + end);
        f.Allowed = true; Runtime.Def(Target).Loaded = true; f.Clear(); c.Tick(now.AddSeconds(7)); NoWrite("terminated request does not auto resume: " + end);
    }
});

Case("resource loss during durable intent cannot reach grant", () =>
{
    var f = new Fixture(); var journal = new Journal { OnBegin = () => Runtime.Def(Target).Loaded = false };
    var controller = new WeaponController(f.Port, journal, (_, _) => { }); var now = DateTime.UtcNow;
    controller.Execute("grant", Choice(), 0, now); controller.Execute("grant", Choice(), 0, now); f.Clear(); controller.Tick(now);
    Check(Runtime.Writes.All(w => w.Method == "ReleaseAsset") && !f.Ped.Items.ContainsKey(Target), "resource unload after initial readiness check submits no Give");
    Check(controller.Owned.All(o => !o.Confirmed), "lost asset grants no confirmed ownership");
});
Console.WriteLine($"WEAPON PORT: {passed} assertions; {cases} cases; {failures.Count} failures. Production source with injected GTA boundaries, no game PASS.");
foreach (var failure in failures) Console.WriteLine(failure);
Environment.ExitCode = failures.Count == 0 ? 0 : 1;
