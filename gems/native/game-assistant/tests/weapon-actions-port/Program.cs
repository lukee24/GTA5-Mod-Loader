using GTA;
using Gems.GameAssistant;
using WeaponActionsPortFixtures;
using static WeaponActionsPortFixtures.Fixture;

var assertions = 0; var cases = 0; var failures = new List<string>();
void Check(bool condition, string message) { if (!condition) throw new Exception(message); assertions++; }
void Reject(Action action, string message) { try { action(); } catch (Exception e) when (e is InvalidOperationException || e is ArgumentException || e is IOException) { assertions++; return; } throw new Exception("Accepted: " + message); }
void Case(string name, Action body) { cases++; try { body(); Console.WriteLine("PASS " + name); } catch (Exception error) { failures.Add(name + ": " + error); Console.WriteLine("FAIL " + name + ": " + error.Message); } }
void NoWrite(string message) => Check(Runtime.Writes.Count == 0, message);
Action[] Actions(Fixture f, WeaponActionSnapshot before) => new Action[] {
    () => f.Port.Clear(f.Session,before), () => f.Port.InfinitePool(f.Session,before,Target,true), () => f.Port.InfinitePool(f.Session,before,Target,false),
    () => f.Port.InfiniteClip(f.Session,before,true), () => f.Port.InfiniteClip(f.Session,before,false),
    () => f.Port.Component(f.Session,before,Target,11,true), () => f.Port.WeaponTint(f.Session,before,Target,2)
};

Case("actual Observe preserves HAS versus IS, raw livery and optional success flags", () => {
    var f = new Fixture(); var item = f.Add(); f.AddComponent(item, installed:true); item.ClipKnown = item.MaxKnown = false;
    var snapshot = f.Port.Observe(f.Session,Target); var observed = snapshot.Find(Target)!; var c = observed.Find(11)!;
    Check(snapshot.Current == Unarmed && snapshot.Items.Length == 2, "mandatory inventory identity");
    Check(observed.Ammo.Known && observed.Ammo.Value == 18 && observed.Pool.Value == 18 && observed.AmmoType.Value == 22, "ammo fields read actual fixture boundary");
    Check(!observed.Clip.Known && !observed.MaxAmmo.Known && observed.Clip.Reason.Contains("NotSupported"), "native false stays unknown");
    Check(observed.ComponentsKnown && c.Installed && c.Active.Known && !c.Active.Value && c.Compatible, "SDK HAS and separate named IS preserved");
    Check(c.LiveryRaw.Known && c.LiveryRaw.Value == 7 && !c.Livery.Known, "raw observation is not invented usable original colour");
    Check(snapshot.Fingerprint.Length == 64 && Runtime.Reads.Contains("Native.GET_PED_WEAPON_COMPONENT_TINT_INDEX"), "raw read represented in fingerprint");
    NoWrite("observation never mutates");
});
Case("special unsupported diagnostics allow one explicit clear", () => {
    var f = new Fixture(); var item = f.Add(); item.ClipKnown = item.MaxKnown = false; item.TintCount = 0; Runtime.Definitions[Target].AmmoType = 0; item.CountOverride = -1;
    var before = f.Port.Observe(f.Session,Target); var observed = before.Find(Target)!;
    Check(!observed.AmmoType.Known && !observed.Pool.Known && !observed.Tint.Known && !observed.ComponentsKnown, "unsupported fields remain unknown");
    f.ResetReads(); f.Port.Clear(f.Session,before);
    Check(Runtime.Writes.SequenceEqual(new[] { new Write("RemoveAll",10,0) }), "one typed RemoveAll and no selection/ammo/flag write");
    Check(f.Ped.Items.Count == 1 && f.Ped.Items.ContainsKey(Unarmed), "fixture clear retains Unarmed");
    Reject(() => f.Port.Clear(f.Session,before), "old snapshot cannot replay after clear"); Check(Runtime.Writes.Count == 1, "no replay");
});
Case("optional boundary exceptions remain unknown without masking guard failure", () => {
    foreach (var read in new[] { "Weapon.Ammo", "Weapon.Tint", "Weapon.TintCount", "Native.GET_MAX_AMMO", "Native.GET_AMMO_IN_CLIP", "Component.Global", "Native.IS_PED_WEAPON_COMPONENT_ACTIVE", "Native.GET_PED_WEAPON_COMPONENT_TINT_INDEX" }) {
        var f = new Fixture(); var item = f.Add(); f.AddComponent(item,installed:true);
        Runtime.OnRead = name => { if (name == read) throw new NotSupportedException("fixture unsupported"); };
        var snapshot = f.Port.Observe(f.Session,Target); Check(snapshot.Find(Target) != null && snapshot.Session.Equals(f.Session), "optional failure did not invalidate session: " + read); NoWrite("optional read no writes");
    }
    foreach (var guardRead in new[] { "Weapon.Ammo", "Component.Global", "Native.IS_PED_WEAPON_COMPONENT_ACTIVE", "Native.GET_PED_WEAPON_COMPONENT_TINT_INDEX" }) {
        var f = new Fixture(); f.AddComponent(f.Add(),installed:true); var old = f.Session;
        Runtime.OnRead = name => { if (name == guardRead) { f.Allowed = false; throw new NotSupportedException("read plus guard gap"); } };
        Reject(() => f.Port.Observe(old,Target), "guard loss must not become optional unknown"); f.ResetReads(); f.Allowed = true;
        Check(f.Port.TrySession(out var next) && next.Epoch > old.Epoch, "guard loss increments epoch"); Reject(() => f.Port.Observe(old,Target), "old session never resumes"); NoWrite("guard gap no writes");
    }
});
Case("nonnegative raw livery is still not a restoration capability", () => {
    foreach (var raw in new[] { -1, 0, 7, int.MaxValue }) {
        var f = new Fixture(); f.AddComponent(f.Add(),installed:true).LiveryValue = raw; var before = f.Port.Observe(f.Session,Target); var c = before.Find(Target)!.Find(11)!;
        Check(c.LiveryRaw.Known && c.LiveryRaw.Value == raw && !c.Livery.Known, "raw integer retained independently of applicability");
        Reject(() => f.Port.ComponentLivery(f.Session,before,Target,11,Math.Max(0,raw)), "no usable source colour"); NoWrite("never guesses livery supportedness");
    }
    var missing = new Fixture(); missing.AddComponent(missing.Add()); var snapshot = missing.Port.Observe(missing.Session,Target);
    Check(!snapshot.Find(Target)!.Find(11)!.LiveryRaw.Known && !Runtime.Reads.Contains("Native.GET_PED_WEAPON_COMPONENT_TINT_INDEX"), "uninstalled component is not queried for colour");
});
Case("all entrypoints deny ineligible actor before SDK access", () => {
    for (var i = 0; i < 9; i++) {
        var f = new Fixture(); f.AddComponent(f.Add()); var before = f.Port.Observe(f.Session,Target); f.ResetReads(); f.Allowed = false;
        var operations = Actions(f,before).Concat(new Action[] { () => f.Port.Observe(f.Session,Target), () => f.Port.ComponentLivery(f.Session,before,Target,11,0) }).ToArray();
        Reject(operations[i], "guard entry"); Check(Runtime.Reads.Count == 0, "no SDK access while ineligible"); NoWrite("guard no write");
    }
});
Case("invalid mandatory inventory is rejected instead of becoming an empty clear target", () => {
    foreach (var hashes in new[] { Array.Empty<uint>(), new[] { Unarmed, Unarmed }, new[] { 0u }, new[] { Unarmed, Target }, Enumerable.Range(1,513).Select(i => (uint)i).ToArray() }) {
        var f = new Fixture(); f.Ped.HashOverride = hashes; Reject(() => f.Port.Observe(f.Session,Target), "invalid inventory"); NoWrite("invalid identity no write");
    }
    var current = new Fixture(); current.Ped.CurrentValue = Target; Reject(() => current.Port.Observe(current.Session,Target), "current absent"); NoWrite("missing current no write");
    var moving = new Fixture(); moving.Add(); Runtime.OnRead = name => { if (name == "Weapon.Ammo" && !moving.Ped.Items.ContainsKey(Other)) moving.Add(Other); };
    Reject(() => moving.Port.Observe(moving.Session,Target), "hashset changed during optional reads"); NoWrite("moving inventory no write");
});
Case("target detail and shared type fields bind component requests", () => {
    foreach (var change in new Action<Fixture,Item,WeaponComponent>[] {
        (f,w,c) => w.Ammo++, (f,w,c) => w.Clip++, (f,w,c) => w.MaxAmmo--, (f,w,c) => w.ClipKnown=false, (f,w,c) => w.Tint++, (f,w,c) => w.TintCount++,
        (f,w,c) => f.Ped.Pools[22]++, (f,w,c) => Runtime.Definitions[Target].AmmoType=33, (f,w,c) => f.Ped.CurrentValue=Target,
        (f,w,c) => c.ActiveValue=!c.ActiveValue, (f,w,c) => c.EnabledValue=!c.EnabledValue, (f,w,c) => c.LiveryValue++, (f,w,c) => c.AttachmentValue=WeaponAttachmentPoint.GunRoot,
        (f,w,c) => f.Add(Other), (f,w,c) => Runtime.Compatibility[(Target,11)]=false }) {
        var f = new Fixture(); var item = f.Add(); var component = f.AddComponent(item,installed:true); var before = f.Port.Observe(f.Session,Target); change(f,item,component); f.ResetReads();
        Reject(() => f.Port.Component(f.Session,before,Target,11,false), "changed snapshot"); NoWrite("changed observed values do not write");
    }
});
Case("clear and all-ped clip requests ignore optional diagnostic changes", () => {
    foreach(var scope in new[] { "clear", "clip" }) {
        var f=new Fixture(); var item=f.Add(); f.AddComponent(item,installed:true); var before=f.Port.Observe(f.Session,Target); item.Ammo++; item.Tint++; item.Components[0].LiveryValue++; item.ClipKnown=false; item.MaxKnown=false; f.ResetReads();
        if(scope=="clear") f.Port.Clear(f.Session,before); else f.Port.InfiniteClip(f.Session,before,false);
        Check(Runtime.Writes.Count==1,"optional drift does not block explicitly confirmed identity operation");
        Check(!Runtime.Reads.Contains("Weapon.Ammo") && !Runtime.Reads.Contains("Component.Global"),"final identity operation does not rescan diagnostics");
    }
});
Case("four explicit infinite requests have exact independent scopes and no readback claim", () => {
    foreach (var scope in new[] { "pool", "clip" }) foreach (var desired in new[] { false,true }) {
        var f = new Fixture(); f.Add(); var before = f.Port.Observe(f.Session,Target); f.ResetReads();
        if (scope == "pool") f.Port.InfinitePool(f.Session,before,Target,desired); else f.Port.InfiniteClip(f.Session,before,desired);
        Check(Runtime.Writes.Count == 1 && Runtime.Writes[0] == new Write(scope == "pool" ? "InfiniteAmmo" : "InfiniteAmmoClip",10,scope == "pool" ? Target : 0,Desired:desired), "exact scope and true/false typed setter");
        f.Port.Observe(f.Session,Target); Check(Runtime.Writes.Count == 1, "later observation never repeats request");
    }
});
Case("pool requests bind every member's type, including members of a shared pool", () => {
    var f = new Fixture(); f.Add(); f.Add(Other); Runtime.Definitions[Other].AmmoType=22; var before = f.Port.Observe(f.Session,Target); f.ResetReads();
    Runtime.Definitions[Other].AmmoType=33; Reject(() => f.Port.InfinitePool(f.Session,before,Target,true), "member type changed"); NoWrite("changed membership no request");
    f = new Fixture(); f.Add(); f.Add(Other); Runtime.Definitions[Other].AmmoType=0; before=f.Port.Observe(f.Session,Target); f.ResetReads();
    Reject(() => f.Port.InfinitePool(f.Session,before,Target,false), "unknown member type"); NoWrite("unknown membership no disable guess");
    f = new Fixture(); f.Add(); before=f.Port.Observe(f.Session,Target); f.ResetReads(); Reject(() => f.Port.InfinitePool(f.Session,before,Unarmed,true), "Unarmed has no pool"); NoWrite("unarmed no request");
});
Case("component install and remove target only explicit hash and preserve HAS/IS distinction", () => {
    foreach (var installed in new[] { true,false }) {
        var f = new Fixture(); var component = f.AddComponent(f.Add(),installed:!installed); component.EnabledValue=true; var before=f.Port.Observe(f.Session,Target); f.ResetReads();
        f.Port.Component(f.Session,before,Target,11,installed);
        Check(Runtime.Writes.SequenceEqual(new[] { new Write("Component.Active",10,Target,Component:11,Desired:installed) }), "typed component setter targets exact weapon and hash");
        Check(component.ActiveValue==installed && component.EnabledValue, "installed mutated, active is independent observation");
    }
});
Case("component runtime set, cache and compatibility disagreements remain unknown", () => {
    foreach (var change in new Action<Fixture,Item>[] {
        (f,w) => w.CountOverride=513, (f,w) => w.Components.Add(new WeaponComponent { HashValue=WeaponComponentHash.First }),
        (f,w) => w.Components[0].HashValue=WeaponComponentHash.Invalid,
        (f,w) => Runtime.ComponentOverride=Array.Empty<WeaponComponentHash>(),
        (f,w) => Runtime.ComponentOverride=new[] { WeaponComponentHash.First,WeaponComponentHash.First },
        (f,w) => { Runtime.ComponentOverride=new[] { WeaponComponentHash.First,WeaponComponentHash.Second }; Runtime.Compatibility[(Target,12)]=true; }
    }) {
        var f=new Fixture(); var item=f.Add(); f.AddComponent(item); change(f,item); var before=f.Port.Observe(f.Session,Target);
        Check(!before.Find(Target)!.ComponentsKnown, "uncertain definitions stay unknown");
        Reject(() => f.Port.Component(f.Session,before,Target,11,true), "untrusted component definitions"); NoWrite("uncertain component no write");
    }
    var incompatible=new Fixture(); incompatible.AddComponent(incompatible.Add()); Runtime.Compatibility[(Target,11)]=false; var s=incompatible.Port.Observe(incompatible.Session,Target);
    Check(s.Find(Target)!.ComponentsKnown && !s.Find(Target)!.Find(11)!.Compatible, "explicit incompatible component visible");
    Reject(() => incompatible.Port.Component(incompatible.Session,s,Target,11,true), "incompatible component"); NoWrite("incompatible no setter");
});
Case("weapon tint uses actual count and cannot be mistaken for component livery", () => {
    var f=new Fixture(); f.Add(); var before=f.Port.Observe(f.Session,Target); f.ResetReads(); f.Port.WeaponTint(f.Session,before,Target,7);
    Check(Runtime.Writes.SequenceEqual(new[] { new Write("Weapon.Tint",10,Target,7) }), "weapon tint exact typed setter");
    foreach(var tint in new[] { -1,8,int.MaxValue }) { f=new Fixture(); f.Add(); before=f.Port.Observe(f.Session,Target); f.ResetReads(); Reject(() => f.Port.WeaponTint(f.Session,before,Target,tint), "out of actual tint count"); NoWrite("out of range tint no write"); }
});
Case("final eligibility callback cannot retarget any action", () => {
    for(var index=0; index<7; index++) {
        var measure=new Fixture(); measure.AddComponent(measure.Add()); var measured=measure.Port.Observe(measure.Session,Target); measure.ResetReads(); Actions(measure,measured)[index](); var last=measure.EligibilityCalls;
        var f=new Fixture(); f.AddComponent(f.Add()); var before=f.Port.Observe(f.Session,Target); f.ResetReads();
        f.EligibilityOverride=()=> { if(f.EligibilityCalls==last) f.Ped.ModelValue++; return true; };
        Reject(Actions(f,before)[index],"actor changed at final callback"); NoWrite("final actor cannot retarget action "+index);
    }
});
Case("final guard callback cannot expand clear inventory after its hash check", () => {
    var measure=new Fixture(); measure.Add(); var measured=measure.Port.Observe(measure.Session); measure.ResetReads(); measure.Port.Clear(measure.Session,measured); var last=measure.EligibilityCalls;
    var f=new Fixture(); f.Add(); var before=f.Port.Observe(f.Session); f.ResetReads();
    f.EligibilityOverride=()=> { if(f.EligibilityCalls==last) f.Add(Other); return true; };
    Reject(()=>f.Port.Clear(f.Session,before),"inventory appeared during final eligibility check"); NoWrite("unexpected inventory not cleared");
});
Case("last target checks reject changed pool scope, compatibility and tint range", () => {
    foreach(var action in new[] { "pool", "component", "tint" }) {
        var measure=new Fixture(); measure.AddComponent(measure.Add()); measure.Add(Other); var measured=measure.Port.Observe(measure.Session,Target,true); measure.ResetReads();
        if(action=="pool") measure.Port.InfinitePool(measure.Session,measured,Target,true); else if(action=="component") measure.Port.Component(measure.Session,measured,Target,11,true); else measure.Port.WeaponTint(measure.Session,measured,Target,2);
        var last=measure.EligibilityCalls;
        var f=new Fixture(); var item=f.Add(); f.AddComponent(item); f.Add(Other); var before=f.Port.Observe(f.Session,Target,true); f.ResetReads();
        f.EligibilityOverride=()=> { if(f.EligibilityCalls==last) { if(action=="pool") Runtime.Definitions[Other].AmmoType=22; else if(action=="component") Runtime.Compatibility[(Target,11)]=false; else item.TintCount=1; } return true; };
        Action invoke=action=="pool"?()=>f.Port.InfinitePool(f.Session,before,Target,true):action=="component"?()=>f.Port.Component(f.Session,before,Target,11,true):()=>f.Port.WeaponTint(f.Session,before,Target,2);
        Reject(invoke,"scope changed at final guard "+action); NoWrite("final scope change prevents setter "+action);
    }
});
Case("maximum inventory observation scans components only for the selected detail target", () => {
    var f=new Fixture();
    for(var i=0;i<511;i++) {
        var hash=i==0?Target:(uint)(20000+i); Runtime.Definitions[hash]=new Definition { Hash=hash,Slot=i+1,AmmoType=(uint)(10000+i) };
        var item=f.Add(hash); for(var j=1;j<=512;j++) f.AddComponent(item,(WeaponComponentHash)j,true);
    }
    Runtime.ComponentOverride=Enumerable.Range(1,1024).Select(i=>(WeaponComponentHash)i).ToArray(); f.ResetReads();
    var light=f.Port.Observe(f.Session); var lightReads=Runtime.Reads.Count;
    Check(light.Items.Length==512 && light.DetailWeapon==0,"maximum mandatory inventory preserved");
    Check(!Runtime.Reads.Any(r=>r=="Component.Global" || r.StartsWith("Component.") || r=="Native.DOES_WEAPON_TAKE_WEAPON_COMPONENT" || r=="Native.IS_PED_WEAPON_COMPONENT_ACTIVE" || r=="Native.GET_PED_WEAPON_COMPONENT_TINT_INDEX" || r=="Weapon.Tint"),"light observation has no component or tint scan");
    Check(light.Items.Where(i=>i.Hash!=Unarmed).All(i=>!i.ComponentsKnown),"unrequested details remain explicit unknown");
    f.ResetReads(); var deep=f.Port.Observe(f.Session,Target); var deepReads=Runtime.Reads.Count;
    Check(deep.DetailWeapon==Target && deep.Find(Target)!.ComponentsKnown && deep.Find(Target)!.Components.Length==512,"one complete bounded detail target");
    Check(Runtime.Reads.Count(r=>r=="Component.Global")==1 && Runtime.Reads.Count(r=>r=="Native.DOES_WEAPON_TAKE_WEAPON_COMPONENT")==1024,"global list once, compatibility once per definition");
    Check(Runtime.Reads.Count(r=>r=="Native.IS_PED_WEAPON_COMPONENT_ACTIVE")==512 && Runtime.Reads.Count(r=>r=="Native.GET_PED_WEAPON_COMPONENT_TINT_INDEX")==512,"IS and raw colour limited to detail components");
    Check(deep.Items.Where(i=>i.Hash!=Unarmed && i.Hash!=Target).All(i=>!i.ComponentsKnown),"other 510 weapons not scanned for details");
    f.ResetReads(); f.Port.Clear(f.Session,light); var clearReads=Runtime.Reads.Count;
    Check(clearReads<700 && Runtime.Writes.Count==1,"maximum clear final check bounded to inventory identity");
    Console.WriteLine($"BUDGET max inventory=512, global=1024, detail components=512: light boundary reads={lightReads}; detail boundary reads={deepReads}; clear boundary reads={clearReads}; compatibility=1024; global lists=1.");
});
Case("oversized component detail refuses mutation while identity clear remains available", () => {
    var f=new Fixture(); f.AddComponent(f.Add()); Runtime.ComponentOverride=Enumerable.Range(1,1025).Select(i=>(WeaponComponentHash)i).ToArray(); f.ResetReads();
    var before=f.Port.Observe(f.Session,Target); Check(!before.Find(Target)!.ComponentsKnown && before.Find(Target)!.ComponentIssue.Contains("global-definitions-exceed-1024") && before.Find(Target)!.Components.Length==0,"1025 global definitions reject with exact reason and no partial array");
    Check(!Runtime.Reads.Contains("Native.DOES_WEAPON_TAKE_WEAPON_COMPONENT"),"over-budget rejected before compatibility fanout");
    f.Port.Clear(f.Session,before); Check(Runtime.Writes.Count==1 && Runtime.Writes[0].Method=="RemoveAll","optional over-budget detail does not disable clear");
});
Case("75ms budget includes compatibility, HAS, IS and raw reads and never returns partial components", () => {
    foreach(var boundary in new[] { "Native.DOES_WEAPON_TAKE_WEAPON_COMPONENT", "Component.Active", "Native.IS_PED_WEAPON_COMPONENT_ACTIVE", "Native.GET_PED_WEAPON_COMPONENT_TINT_INDEX" }) {
        var f=new Fixture(); f.AddComponent(f.Add(),installed:true); long now=0; f.Port.WeaponDetailClock=()=>now;
        Runtime.OnRead=name=> { if(name==boundary) now=System.Diagnostics.Stopwatch.Frequency; };
        var before=f.Port.Observe(f.Session,Target,true); var item=before.Find(Target)!;
        Check(!item.ComponentsKnown && item.Components.Length==0 && item.ComponentIssue.Contains("elapsed-budget-75ms"),"elapsed budget discards entire component result: "+boundary);
        Check(f.Port.TrySession(out var current) && current.Equals(f.Session),"optional budget exhaustion does not revoke valid actor");
        f.Port.Clear(f.Session,before); Check(Runtime.Writes.Count==1,"budget exhaustion leaves identity clear available");
    }
    var real=new Fixture(); real.AddComponent(real.Add(),installed:true); real.Port.WeaponDetailClock=null;
    Runtime.OnRead=name=> { if(name=="Native.DOES_WEAPON_TAKE_WEAPON_COMPONENT") System.Threading.Thread.Sleep(90); };
    var observed=real.Port.Observe(real.Session,Target,true);
    Check(!observed.Find(Target)!.ComponentsKnown && observed.Find(Target)!.Components.Length==0 && observed.Find(Target)!.ComponentIssue.Contains("elapsed-budget-75ms"),"actual Stopwatch timeout after one slow boundary drops all components"); NoWrite("real timer case is read-only");
    var denied=new Fixture(); denied.AddComponent(denied.Add()); var expected=denied.Port.Observe(denied.Session,Target,true); long stamp=0; denied.Port.WeaponDetailClock=()=>stamp;
    Runtime.OnRead=name=> { if(name=="Native.DOES_WEAPON_TAKE_WEAPON_COMPONENT") stamp+=System.Diagnostics.Stopwatch.Frequency; };
    Reject(()=>denied.Port.Component(denied.Session,expected,Target,11,true),"detail budget expired during final action validation"); NoWrite("expired target validation never reaches setter");
});
Case("real controller two-confirmation flow has measured bounded port work", () => {
    foreach(var action in new[] { "clear", "clip-on", "pool-on", "component-remove" }) {
        var f=new Fixture();
        for(var i=0;i<511;i++) {
            var hash=i==0?Target:(uint)(20000+i); Runtime.Definitions[hash]=new Definition { Hash=hash,Slot=i+1,AmmoType=(uint)(10000+i) };
            var item=f.Add(hash); if(i==0) for(var j=1;j<=512;j++) f.AddComponent(item,(WeaponComponentHash)j,true);
        }
        Runtime.ComponentOverride=Enumerable.Range(1,1024).Select(i=>(WeaponComponentHash)i).ToArray();
        var journal=new ActionJournal(); var controller=new WeaponActionsController(f.Port,journal,_=>{});
        var definition=action=="component-remove"?f.Port.Observe(f.Session,Target,true).Find(Target)!.Definition:"";
        var target=action=="pool-on" || action=="component-remove"?Target:0u;
        f.ResetReads(); var watch=System.Diagnostics.Stopwatch.StartNew();
        controller.Execute(action,target,11,0,definition,DateTime.UtcNow);
        Check(Runtime.Writes.Count==0 && controller.Confirmation==action,"first action only confirms "+action);
        controller.Execute(action,target,11,0,definition,DateTime.UtcNow); watch.Stop();
        Check(Runtime.Writes.Count==1,"two confirmations submit exactly one write "+action+"; "+controller.LastResult+"; "+controller.TakeError());
        var named=Runtime.Reads.Count(r=>r.StartsWith("Native.")); var global=Runtime.Reads.Count(r=>r=="Component.Global"); var compatibility=Runtime.Reads.Count(r=>r=="Native.DOES_WEAPON_TAKE_WEAPON_COMPONENT");
        if(action=="clear" || action=="clip-on") Check(named==0 && global==0 && Runtime.Reads.Count<14000,"identity-only controller budget "+action);
        else if(action=="pool-on") Check(global==0 && compatibility==0 && named<=6000,"pool only bounded ammo-type diagnostics");
        else Check(global<=14 && compatibility<=14*1024+1,"component controller scans bounded selected definitions plus final target compatibility");
        Console.WriteLine($"CONTROLLER BUDGET action={action}, inventory=512, global=1024, detail=512: boundary reads={Runtime.Reads.Count}; named native reads={named}; global enumerations={global}; compatibility reads={compatibility}; fixture milliseconds={watch.ElapsedMilliseconds}; writes={Runtime.Writes.Count}. Journal is test spy; timings not game performance.");
    }
});
Case("exceptions before and after real mutation never replay with old authority", () => {
    for(var index=0; index<7; index++) foreach(var after in new[] { false,true }) {
        var f=new Fixture(); f.AddComponent(f.Add()); var before=f.Port.Observe(f.Session,Target); f.ResetReads();
        if(after) Runtime.AfterWrite=_=>throw new IOException("after mutation"); else Runtime.BeforeWrite=_=>throw new IOException("before mutation");
        Reject(Actions(f,before)[index],"write failure propagates"); Check(Runtime.Writes.Count==(after?1:0),"at most one submitted write");
        Runtime.BeforeWrite=Runtime.AfterWrite=null; Reject(Actions(f,before)[index],"same request after exception"); Check(Runtime.Writes.Count==(after?1:0),"no implicit replay after exception");
    }
});
Console.WriteLine($"Stage7 weapon actions port: {assertions} assertions; {cases} cases; {failures.Count} failed. Fake GTA boundary, not gameplay.");
foreach(var failure in failures) Console.WriteLine(failure);
return failures.Count==0?0:1;
