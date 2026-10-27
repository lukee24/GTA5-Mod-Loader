using Gems.GameAssistant;
using System.Text;
using System.Text.Json;

internal static class Program
{
    static int checks; static readonly DateTime Now = new DateTime(2026, 10, 27, 0, 0, 0, DateTimeKind.Utc);
    static void Check(bool value, string text) { checks++; if (!value) throw new Exception("FAIL " + text); }
    static void Throws(Action run, string text) { bool threw = false; try { run(); } catch { threw = true; } Check(threw, text); }
    static WeaponChoice Choice(uint hash = 2) => new WeaponChoice { Hash = hash, Name = "测试武器", Source = "runtime", SourceToken = "runtime:" + hash };
    static (FakePort p, MemoryJournal j, WeaponController c) Setup()
    { var p = new FakePort(); var j = new MemoryJournal(); return (p, j, new WeaponController(p, j, (c, d) => { if (!d.Any(x => x.Hash == c.Hash && x.Valid)) throw new Exception("runtime missing"); })); }
    static void Twice(WeaponController c, string action, WeaponChoice? choice = null, int amount = 0)
    { c.Execute(action, choice ?? Choice(), amount, Now); c.Execute(action, choice ?? Choice(), amount, Now.AddSeconds(1)); }
    static void Grant(WeaponController c) { Twice(c, "grant"); c.Tick(Now.AddSeconds(2)); }
    static void Main()
    {
        var (p, j, c) = Setup(); c.Refresh(); Check(c.ReadValid && c.Definitions.Length == 3, "stable runtime/inventory refresh");
        c.Execute("grant", Choice(), 0, Now); Check(p.Gives == 0 && c.Confirmation == "grant", "first confirmation read only");
        c.Execute("grant", Choice(), 0, Now); Check(p.Gives == 0 && c.Pending, "second confirmation queues no synchronous Give");
        c.Tick(Now.AddSeconds(1)); Check(p.Gives == 1 && c.Owned.Single().Confirmed && j.Begins == 1 && j.Finishes == 1, "give intent/readback ownership");
        c.Tick(Now.AddSeconds(2)); Check(p.Gives == 1 && p.Requests == 1 && p.Releases == 1, "one Give per request");
        Twice(c, "ammo", amount: 10); Check(p.Adds == 1 && p.Pool == 10 && c.Owned.Single().Confirmed, "owned ammo updates known after-state");
        Twice(c, "remove"); Check(p.Removes == 1 && !p.HasTarget && c.Owned.Single().Removed && p.Pool == 10, "conditional remove preserves residue without pool setter");
        Check(c.LastResidue=="10"&&c.LastResult.Contains("10"),"residue readback visible in result");
        (p,j,c)=Setup();Grant(c);p.UnknownProbeAfterRemove=true;Twice(c,"remove");Check(c.LastResidue.StartsWith("未知")&&c.LastResult.Contains("未知"),"changed ammo-type probe is unknown not zero");
        (p,j,c)=Setup();p.Loaded=false;Twice(c,"grant");var definitionReads=p.DefinitionReads;var inventoryReads=p.InventoryReads;c.Tick(Now.AddSeconds(2));c.Tick(Now.AddSeconds(3));
        Check(p.DefinitionReads==definitionReads&&p.InventoryReads==inventoryReads&&p.Gives==0,"waiting frames poll only qualification/resource, no full inventory definitions scan");
        (p, j, c) = Setup(); p.Shared = true; Twice(c, "grant"); c.Tick(Now); Check(p.Gives == 0, "preexisting shared ammo member prevents grant");
        (p, j, c) = Setup(); p.Pool = 1; Twice(c, "grant"); c.Tick(Now); Check(p.Gives == 0, "unowned nonzero pool prevents grant");
        (p, j, c) = Setup(); p.SlotOccupied = true; Twice(c, "grant"); c.Tick(Now); Check(p.Gives == 0, "occupied slot prevents grant");
        (p, j, c) = Setup(); p.HasTarget = true; Twice(c, "grant"); Check(p.Gives == 0, "already owned never Give");
        p.Shared = true; Twice(c, "ammo", amount: 10); Check(p.Adds == 1 && p.Pool == 10, "existing shared pool explicit positive addition");
        Twice(c, "remove"); Check(p.Removes == 0, "preexisting weapon never removed");
        foreach (var amount in new[] { -1, 0, 101, 10001, int.MaxValue }) { (p, j, c) = Setup(); p.HasTarget = true; Twice(c, "ammo", amount: amount); Check(p.Adds == 0, "invalid amount " + amount); }
        foreach (var reason in new[] { "guard", "epoch", "actor", "snapshot", "source", "timeout" })
        {
            (p, j, c) = Setup(); Twice(c, "grant");
            if (reason == "guard") p.Allowed = false; if (reason == "epoch") p.Epoch++; if (reason == "actor") p.Actor++;
            if (reason == "snapshot") p.OriginalAmmo++; if (reason == "source") p.DefinitionValid = false;
            c.Tick(reason == "timeout" ? Now.AddSeconds(10) : Now.AddSeconds(2));
            Check(p.Gives == 0 && !c.Pending, "pending cancels " + reason);
            p.Allowed = true; c.Tick(Now.AddSeconds(3)); Check(p.Gives == 0, "no replay " + reason);
        }
        foreach (var change in new[] { "ammo", "component", "tint", "slot", "selected", "epoch", "shared" })
        {
            (p, j, c) = Setup(); Grant(c);
            if (change == "ammo") p.Pool++; if (change == "component") p.Component = "changed"; if (change == "tint") p.Tint++;
            if (change == "slot") p.TargetSlot++; if (change == "selected") p.Selected = 2; if (change == "epoch") p.Epoch++; if (change == "shared") p.Shared = true;
            Twice(c, "remove"); Check(p.Removes == 0 && p.HasTarget, "external edit blocks removal " + change);
        }
        foreach (var fault in new[] { "intent", "give-before", "give-after", "readback", "result" })
        {
            (p, j, c) = Setup(); j.FailBegin = fault == "intent"; p.ThrowBefore = fault == "give-before"; p.ThrowAfter = fault == "give-after"; p.WrongAfter = fault == "readback"; j.FailFinish = fault == "result";
            Grant(c); c.Tick(Now.AddSeconds(4));
            Check(p.Gives <= 1 && !c.Pending && !c.Owned.Any(o => o.Confirmed), "failure never confirms or repeats " + fault);
            if (fault == "intent") Check(p.Gives == 0, "write-ahead intent failure no native call");
            if (fault == "give-after" || fault == "result") Check(p.HasTarget && c.Owned.Count == 1, "partial target retained unresolved " + fault);
        }
        (p, j, c) = Setup(); j.OnBegin = () => p.Epoch++; Grant(c); Check(p.Gives == 0 && j.Finishes == 1, "guard gap during file intent prevents mutation");
        (p, j, c) = Setup(); Twice(c, "grant"); c.Cancel("back"); c.Tick(Now); Check(p.Gives == 0 && p.Releases == 1, "explicit cancel releases request only");
        (p, j, c) = Setup(); p.Loaded = false; Twice(c, "grant"); c.Suspend("focus"); p.Loaded = true; c.Tick(Now); Check(p.Gives == 0 && p.Releases == 0, "guard suspension makes no cleanup native calls");
        FileCases(); CatalogCases();
        MenuCases();
        Console.WriteLine("PASS " + checks + " assertions; production controller/journal/bridge, fake game port. No GTA game validation.");
    }
    static void MenuCases()
    {
        var (port, journal, controller) = Setup();
        var bridge = new WeaponCatalogBridge(Path.Combine(Area("menu"), WeaponCatalog.FileName), new WeaponGameIdentity(() => "C:\\Unavailable"));
        var menu = new WeaponMenu(controller, bridge);
        Check(menu.Rows().Any(r => r.Key == "weapon-refresh"), "production menu refresh available");
        menu.Execute("weapon-refresh",0,Now); menu.Execute("weapon-page:2",0,Now);
        Check(menu.Rows().Count(r=>r.Key.StartsWith("weapon-item:"))==3,"runtime list actual controller rows");
        menu.Filter("00000002"); Check(menu.Rows().Count(r=>r.Key.StartsWith("weapon-item:"))==1,"hash search real menu");
        menu.Execute("weapon-item:0",0,Now); Check(menu.Rows().Any(r=>r.Key=="weapon-grant"),"detail actions connected");
        menu.Execute("weapon-grant",0,Now); Check(controller.Confirmation=="grant","production menu creates preview");
        menu.Back(); Check(controller.Confirmation==""&&!controller.Pending,"back cancels preview");
        menu.Execute("weapon-search-clear",0,Now); Check(menu.Query=="","explicit search clear");
        menu.Reset(); Check(menu.Page==0,"category reset returns home");
    }
    static string Area(string name) { var path = Path.Combine(Directory.GetCurrentDirectory(), "native", "game-assistant", "artifacts", "0.1.83-stage6-fixtures", name + "-" + Guid.NewGuid().ToString("N")); Directory.CreateDirectory(path); return path; }
    static void FileCases()
    {
        var largeComponents=string.Join("/",Enumerable.Range(1,512).Select(i=>i.ToString("x8")+":True"));
        var largeSnapshot=new WeaponSnapshot {Session=new WeaponSession(new PlayerIdentity(1,2,3,4),0),Current=1,
            Items=Enumerable.Range(1,128).Select(i=>new WeaponState{Hash=(uint)i,Components=largeComponents}).ToArray()};
        var largeRoot=Area("oversize-intent");var largeJournal=new WeaponJournal(largeRoot);
        Throws(()=>largeJournal.Begin("grant",largeSnapshot,2,0,"runtime:2"),"oversize legitimate bounded inventory refuses before file creation");
        Check(Directory.GetFiles(largeRoot).Length==0,"oversize intent leaves no unreadable audit file");
        var root = Area("journal"); var journal = new WeaponJournal(Path.Combine(root, "中文 空格", "记录")); var p = new FakePort(); var s = p.Read(p.Session, 2);
        journal.Verify(); var id = journal.Begin("grant", s, 2, 0, "runtime:2");
        var intent = Directory.GetFiles(root, "*.intent", SearchOption.AllDirectories).Single();
        Throws(() => File.WriteAllText(intent, "foreign"), "live intent denies overwrite");
        Throws(() => File.Move(intent, intent + ".moved"), "live intent denies replacement");
        journal.Finish(id, "observed-not-game-tested", s, "test"); journal.Verify(); Check(journal.UnconfirmedCount == 0, "real durable intent/result");
        File.WriteAllText(intent, "foreign"); Throws(journal.Verify, "external changed history blocks writes"); Check(File.ReadAllText(intent) == "foreign", "foreign changed file preserved");
        var failedRoot = Area("result"); var failed = new WeaponJournal(failedRoot); var second = failed.Begin("grant", s, 2, 0, "runtime:2");
        failed.Hook = phase => { if (phase == "before-result") throw new IOException("simulated disk failure before result"); };
        Throws(() => failed.Finish(second, "unknown-partial", null, "failed"), "actual result failure");
        var restart = new WeaponJournal(failedRoot); restart.Verify(); Check(restart.UnconfirmedCount == 1, "restart retains missing result, no inferred success");
        failed.Hook = null; var third = failed.Begin("ammo", s, 2, 10, "runtime:2"); failed.Finish(third, "not-submitted", null, "test repaired path"); failed.Verify(); Check(failed.UnconfirmedCount == 1, "later audited action possible while old unknown retained");
        var blocked = Area("blocked"); var file = Path.Combine(blocked, "not-a-directory"); File.WriteAllText(file, "user");
        Throws(() => new WeaponJournal(Path.Combine(file, "nested")).Verify(), "file ancestor blocks creation"); Check(File.ReadAllText(file) == "user", "original file intact");
        var partialRoot = Area("partial"); var partial = new WeaponJournal(partialRoot); partial.Hook = _ => throw new IOException("after bytes written");
        Throws(() => partial.Begin("grant", s, 2, 0, "runtime:2"), "intent failure never claims committed");
        var fresh = new WeaponJournal(partialRoot); fresh.Verify(); Check(fresh.UnconfirmedCount == 1 && Directory.GetFiles(partialRoot).Length == 1, "failed write retained as unconfirmed not deleted");
        var uncertain=fresh.Begin("ammo",s,2,10,"runtime:2");fresh.Finish(uncertain,"unknown-partial",null,"call may have applied");
        var reread=new WeaponJournal(partialRoot);reread.Verify();Check(reread.UnconfirmedCount==2,"unknown-partial result remains unconfirmed after restart");
        var resultRoot=Area("oversize-result");var resultJournal=new WeaponJournal(resultRoot);var resultId=resultJournal.Begin("grant",s,2,0,"runtime:2");
        Throws(()=>resultJournal.Finish(resultId,"observed-not-game-tested",largeSnapshot,"test"),"oversize result refused after possible mutation");
        var resultRestart=new WeaponJournal(resultRoot);resultRestart.Verify();Check(resultRestart.UnconfirmedCount==1&&Directory.GetFiles(resultRoot).Length==1,"oversize result retains readable unknown intent");
        var budgetRoot=Area("total-budget");var budgetJournal=new WeaponJournal(budgetRoot);bool limited=false;
        for(int i=0;i<30;i++)
        {
            try{var budgetId=budgetJournal.Begin("grant",s,2,0,new string('x',700000));budgetJournal.Finish(budgetId,"not-submitted",null,"test");}
            catch(Exception failure) when(failure is IOException || failure is InvalidDataException){limited=true;break;}
        }
        Check(limited&&Directory.GetFiles(budgetRoot).Sum(f=>new FileInfo(f).Length)<=16L*1024*1024,"aggregate audit budget enforced before publishing new intent");
        budgetJournal.Verify();Check(budgetJournal.UnconfirmedCount==0,"budget refusal leaves prior history readable and complete");
        var capacity = Area("capacity"); for (int i = 0; i <= WeaponJournal.MaximumFiles; i++) File.WriteAllText(Path.Combine(capacity, i.ToString("x32") + ".intent"), "test");
        Throws(() => new WeaponJournal(capacity).Verify(), "capacity checked before enumeration truncation");
        Console.WriteLine("Real file fixtures retained: " + root + " | " + failedRoot + " | " + partialRoot + " | " + capacity);
    }
    static void CatalogCases()
    {
        var root = Area("catalog"); var path = Path.Combine(root, WeaponCatalog.FileName); var game = WeaponGameIdentity.CanonicalGameRoot(root); string revision = new string('a',64), registration = "unknown", dependencies = "unknown", state = "verified";
        var hash = GTA.StringHash.AtStringHashUtf8("WEAPON_PISTOL", 0);
        void Write() => File.WriteAllText(path, JsonSerializer.Serialize(new {
            schemaVersion=1, component="GEMS.WeaponCatalog", protocol="gems.weapon-catalog.v1",revision,gameRoot=game,gameRootId=WeaponGameIdentity.GameRootId(game),targetGame="enhanced",requiresGameRestart=true,
            weapons=new[]{new{id=new string('b',64),modId="sample",name="中文 测试",weaponName="WEAPON_PISTOL",hash=hash.ToString("x8"),kind="addon",evidence=new[]{new{kind="weapons-meta",sourcePath="weapons.meta",sourceSha256=new string('c',64),sourceBytes=10,locator="Item/Name"}},transactionId="tx-1",fileState=state,registration,dependencies,issues=new[]{"未知依赖"}}},issues=Array.Empty<string>()}),new UTF8Encoding(false));
        Write(); var bridge = new WeaponCatalogBridge(path, new WeaponGameIdentity(() => root)); bridge.Refresh();
        Check(bridge.Choices.Single().SourceAllowed, "unknown not auto-refused but requires independent evidence");
        var choice = bridge.Choices.Single(); var definitions = new[]{new WeaponDefinition{Hash=hash,Valid=true}};
        bridge.Validate(choice, definitions); Check(true, "runtime observed match allowed as action evidence not registration");
        Throws(()=>bridge.Validate(choice, Array.Empty<WeaponDefinition>()), "runtime mismatch refused");
        revision = new string('d',64); Write(); Throws(()=>bridge.Validate(choice, definitions), "revision change refused"); revision = new string('a',64);
        dependencies="missing"; Write(); bridge.Refresh(); Check(!bridge.Choices.Single().SourceAllowed, "missing dependencies refuse"); Throws(()=>bridge.Validate(bridge.Choices.Single(),definitions), "hard deny missing at commit");
        dependencies="unknown"; registration="not-registered"; Write(); bridge.Refresh(); Throws(()=>bridge.Validate(bridge.Choices.Single(),definitions), "hard deny not registered");
        registration="unknown"; Write(); bridge.Refresh(); choice=bridge.Choices.Single(); File.AppendAllText(path," "); Throws(()=>bridge.Validate(choice,definitions), "same revision different raw bytes refused");
        Write(); var wrong = new WeaponCatalogBridge(path,new WeaponGameIdentity(()=>root+"-other")); wrong.Refresh(); Check(!wrong.Choices.Single().SourceAllowed, "independent host root mismatch");
        state="changed"; Write(); bridge.Refresh(); Check(!bridge.Choices.Single().SourceAllowed, "changed file state blocks");
    }
}

