using Gems.GameAssistant;
using GTA;

var passed = 0; var failures = new List<string>(); var cases = 0;
void Check(bool condition, string message) { if (!condition) throw new Exception(message); passed++; Console.WriteLine("PASS " + message); }
void Case(string name, Action action)
{
    cases++;
    try { action(); }
    catch (Exception error) { failures.Add(name + ": " + error); Console.WriteLine("FAIL " + name + ": " + error); }
}
void Reject(Action action, string message)
{
    try { action(); }
    catch (InvalidOperationException) { Check(true, message); return; }
    catch (ArgumentException) { Check(true, message); return; }
    throw new Exception(message + ": did not reject");
}
Action<PlayerMotionSession>[] Calls(Fixture f) => new Action<PlayerMotionSession>[] { session => f.Port.Run(session, 1.25f), session => f.Port.Swim(session, 1.1f), session => f.Port.Jump(session) };
void ZeroWrites(string reason) => Check(Runtime.Writes.Count == 0, reason);

Case("guard-before-GTA", () =>
{
    var f = new Fixture(false) { Allowed = false };
    Check(!f.Port.TrySession(out _), "ineligible first session rejected"); Check(Runtime.Reads.Count == 0, "first eligibility rejection makes no GTA reads");
    foreach (var call in Calls(f))
    {
        f.Clear(); Reject(() => call(default), "ineligible write rejected");
        Check(Runtime.Reads.Count == 0 && Runtime.Writes.Count == 0, "ineligible write has zero GTA access");
    }
});
Case("stable-session-and-typed-routing", () =>
{
    var f = new Fixture(); Check(f.Port.TrySession(out var same) && same.Equals(f.Session), "stable actor retains session epoch");
    f.Clear(); f.Port.Run(f.Session, 1.25f); f.Port.Swim(f.Session, 1.1f); f.Port.Jump(f.Session);
    Check(Runtime.Writes.Select(w => w.Method).SequenceEqual(new[] { "SetRunSpeedMultThisFrame", "SetSwimSpeedMultThisFrame", "SetSuperJumpThisFrame" }), "each operation calls its actual typed API once");
    Check(Runtime.Writes[0].Value == 1.25f && Runtime.Writes[1].Value == 1.1f && Runtime.Writes[2].Value == null, "typed API parameters are exact");
    Check(Runtime.Writes.All(w => w.Player == f.Player.HandleValue && w.Ped == f.Ped.HandleValue), "typed calls target the validated player");
    Check(f.EligibilityCalls >= 3, "each write rechecks eligibility");
});
Case("finite-and-range-validation", () =>
{
    foreach (var value in new[] { float.NaN, float.PositiveInfinity, float.NegativeInfinity, -0.01f, 1.5f, float.MaxValue, float.MinValue })
    {
        var f = new Fixture(); Reject(() => f.Port.Run(f.Session, value), "run rejects invalid multiplier " + value);
        Reject(() => f.Port.Swim(f.Session, value), "swim rejects invalid multiplier " + value);
        Check(Runtime.Reads.Count == 0 && Runtime.Writes.Count == 0, "invalid value rejected before GTA access " + value);
    }
    foreach (var value in new[] { 0f, 0.01f, 1f, 1.499f })
    {
        var f = new Fixture(); f.Port.Run(f.Session, value); f.Port.Swim(f.Session, value);
        Check(Runtime.Writes.Count == 2 && Runtime.Writes.All(w => w.Value == value), "finite in-range boundary forwarded exactly " + value);
    }
});
Case("write-time-denial-invalidates-old-session-even-for-same-actor", () =>
{
    for (var operation = 0; operation < 3; operation++)
    {
        var f = new Fixture(); var old = f.Session; f.Allowed = false;
        Reject(() => Calls(f)[operation](old), "eligibility lost after acquisition rejects operation " + operation);
        Check(Runtime.Reads.Count == 0 && Runtime.Writes.Count == 0, "denial does not touch GTA operation " + operation);
        f.Allowed = true; Check(f.Port.TrySession(out var restored), "same actor can establish a new session " + operation);
        Check(!restored.Equals(old) && restored.Epoch > old.Epoch && restored.Actor.Equals(old.Actor), "same actor gets a fresh continuity epoch " + operation);
        f.Clear(); Reject(() => Calls(f)[operation](old), "old token does not revive after eligibility returns " + operation); ZeroWrites("old token never writes " + operation);
        Check(f.Port.TrySession(out var current), "current token can be reread " + operation); Calls(f)[operation](current); Check(Runtime.Writes.Count == 1, "fresh token can write " + operation);
    }
});
Case("pause-focus-and-other-eligibility-reasons", () =>
{
    foreach (var reason in new[] { "paused", "unfocused", "story denied" })
    {
        var f = new Fixture(); var old = f.Session; var rejected = true; f.EligibilityOverride = () => !rejected;
        Check(!f.Port.TrySession(out _), reason + " invalidates read session");
        rejected = false; Check(f.Port.TrySession(out var next) && next.Epoch > old.Epoch, reason + " restoration changes epoch");
        foreach (var call in Calls(f)) Reject(() => call(old), reason + " old session refused");
        ZeroWrites(reason + " rejection never writes default multipliers");
    }
});
Case("actor-components-and-invalid-peds", () =>
{
    var changes = new Action<Fixture>[]
    {
        f => f.Player.HandleValue++, f => f.Ped.HandleValue++, f => f.Ped.ModelValue++,
        f => f.Ped.AddressValue = new IntPtr(99999), f => f.Ped.DeadValue = true,
        f => f.Ped.ExistsValue = false, f => f.Ped.AddressValue = IntPtr.Zero,
        f => f.Player.CharacterValue = null,
        f => f.Player.CharacterValue = new Ped { HandleValue = 999, ModelValue = 1000, AddressValue = new IntPtr(1001) }
    };
    for (var change = 0; change < changes.Length; change++) for (var operation = 0; operation < 3; operation++)
    {
        var f = new Fixture(); changes[change](f); Reject(() => Calls(f)[operation](f.Session), "actor change " + change + " rejects operation " + operation);
        ZeroWrites("actor change " + change + " has zero writes " + operation);
    }
});
Case("actor-returns-to-original-after-observed-change", () =>
{
    var f = new Fixture(); var old = f.Session; var address = f.Ped.AddressValue;
    f.Ped.AddressValue = new IntPtr(81234); Check(f.Port.TrySession(out var changed) && !changed.Equals(old), "changed address establishes distinct session");
    f.Ped.AddressValue = address; Check(f.Port.TrySession(out var returned) && returned.Actor.Equals(old.Actor) && returned.Epoch > old.Epoch, "returned identical actor cannot restore old continuity");
    foreach (var call in Calls(f)) Reject(() => call(old), "pre-change permission remains invalid"); ZeroWrites("actor return performs no restoration write");
});
Case("explicit-forget-is-local-and-monotonic", () =>
{
    var f = new Fixture(); var previous = f.Session; f.Allowed = false; f.Port.ForgetSession();
    Check(Runtime.Reads.Count == 0 && Runtime.Writes.Count == 0 && f.EligibilityCalls == 0, "ForgetSession touches no GTA and does not call eligibility");
    f.Allowed = true;
    for (var i = 0; i < 10; i++)
    {
        Check(f.Port.TrySession(out var next) && next.Epoch > previous.Epoch, "forget creates monotonically new epoch " + i);
        Reject(() => f.Port.Run(previous, 1.25f), "forgotten token cannot run " + i); ZeroWrites("forget never writes 1.0 reset " + i);
        previous = next; f.Port.ForgetSession();
    }
});
Case("forged-identity-or-epoch-rejected", () =>
{
    var f = new Fixture(); var s = f.Session;
    foreach (var forged in new[] { default(PlayerMotionSession), new PlayerMotionSession(s.Actor, s.Epoch + 1), new PlayerMotionSession(new PlayerIdentity(s.Actor.PlayerHandle, s.Actor.PedHandle, s.Actor.ModelHash, s.Actor.Address + 1), s.Epoch) })
        foreach (var call in Calls(f)) Reject(() => call(forged), "mismatched session never authorizes a write");
    ZeroWrites("forged tokens do not call typed methods");
});
Case("eligibility-changes-during-actor-read", () =>
{
    for (var operation = 0; operation < 3; operation++)
    {
        var f = new Fixture(); Runtime.OnRead = member => { if (member == "Ped.MemoryAddress") f.Allowed = false; };
        Reject(() => Calls(f)[operation](f.Session), "eligibility changed while reading actor rejects operation " + operation);
        ZeroWrites("last-boundary eligibility denial has no write " + operation);
        Runtime.OnRead = null; f.Allowed = true;
        Check(f.Port.TrySession(out var restored) && restored.Epoch > f.Session.Epoch, "mid-read denial revokes continuity " + operation);
    }
});
Case("zero-address-cannot-establish-a-session", () =>
{
    var f = new Fixture(false); f.Ped.AddressValue = IntPtr.Zero;
    Check(!f.Port.TrySession(out _), "zero address is invalid even without an earlier actor token");
    ZeroWrites("zero-address session acquisition has no writes");
});
Case("second-actor-read-revalidates-liveness", () =>
{
    foreach (var mutation in new[] { "dead", "missing", "null", "address" })
    {
        var f = new Fixture(); var reads = 0;
        Runtime.OnRead = member =>
        {
            if (member != "Game.Player" || ++reads != 2) return;
            if (mutation == "dead") f.Ped.DeadValue = true;
            if (mutation == "missing") f.Ped.ExistsValue = false;
            if (mutation == "null") f.Player.CharacterValue = null;
            if (mutation == "address") f.Ped.AddressValue = IntPtr.Zero;
        };
        Reject(() => f.Port.Run(f.Session, 1.25f), "second actor read rejects " + mutation); ZeroWrites("no write after second-read " + mutation);
        Runtime.OnRead = null;
    }
});
Case("second-read-exception-revokes-old-continuity", () =>
{
    var f = new Fixture(); var reads = 0; var thrown = false;
    Runtime.OnRead = member => { if (member == "Game.Player" && ++reads == 2) throw new IOException("injected final actor getter failure"); };
    try { f.Port.Run(f.Session, 1.25f); } catch (IOException) { thrown = true; }
    Check(thrown, "second actor getter failure is observable"); ZeroWrites("getter exception submits no write");
    Runtime.OnRead = null; Check(f.Port.TrySession(out var next) && next.Epoch > f.Session.Epoch, "second getter failure revoked the epoch");
    Reject(() => f.Port.Run(f.Session, 1.25f), "old token stays rejected after getter recovery"); ZeroWrites("recovered getter cannot resurrect old permissions");
});
Case("controller-real-port-requests-and-local-stop", () =>
{
    var f = new Fixture(); var controller = new PlayerMotionController(f.Port);
    controller.SetMultiplier("player-run", 1.25f); controller.SetMultiplier("player-swim", 0.5f); controller.Tick();
    ZeroWrites("disabled multiplier edits and tick remain local");
    controller.Toggle("player-run"); controller.Toggle("player-swim"); controller.Toggle("jump"); f.Clear(); controller.Tick();
    Check(Runtime.Writes.Count == 3 && Runtime.Writes[0].Value == 1.25f && Runtime.Writes[1].Value == 0.5f, "real controller submits all three actual typed routes");
    f.Clear(); controller.Stop("test stop"); controller.Tick(); Check(!controller.AnyEnabled, "Stop disables all local effects");
    Check(Runtime.Reads.Count == 0 && Runtime.Writes.Count == 0, "Stop and subsequent disabled tick perform no GTA work or default reset");
    Check(controller.LastResult.Contains("未恢复未知外部倍率"), "stop message does not claim restoration of unknown state");
});
Case("controller-denial-does-not-resume-automatically", () =>
{
    var f = new Fixture(); var controller = new PlayerMotionController(f.Port); controller.Toggle("player-run");
    f.Allowed = false; f.Clear(); controller.Tick(); Check(!controller.AnyEnabled, "eligibility loss stops active controller");
    ZeroWrites("denied tick submits no multiplier");
    f.Allowed = true; controller.Tick(); ZeroWrites("same actor and eligibility recovery do not auto-resume");
    controller.Toggle("player-run"); controller.Tick(); Check(Runtime.Writes.Count == 1, "explicit new toggle can resume after neutral stop");
});
Case("controller-partial-typed-failure-is-honest-and-stops", () =>
{
    foreach (var after in new[] { false, true })
    {
        var f = new Fixture(); var controller = new PlayerMotionController(f.Port);
        controller.SetMultiplier("player-run", 1.25f); controller.SetMultiplier("player-swim", 1.3f);
        controller.Toggle("player-run"); controller.Toggle("player-swim"); controller.Toggle("jump"); f.Clear();
        Action<MotionWrite> fail = write => { if (write.Method == "SetSwimSpeedMultThisFrame") throw new IOException("injected typed method failure"); };
        if (after) Runtime.AfterWrite = fail; else Runtime.BeforeWrite = fail;
        controller.Tick();
        Check(!controller.AnyEnabled, "typed failure stops all requests, after=" + after);
        Check(Runtime.Writes.Count == (after ? 2 : 1) && Runtime.Writes.All(w => w.Value != 1f), "partial failure never writes 1.0 or later jump, after=" + after);
        Check(controller.LastResult.Contains("失败调用可能已生效") && controller.LastResult.Contains("未回滚"), "partial failure explicitly preserves uncertainty, after=" + after);
        f.Clear(); controller.Tick(); ZeroWrites("next tick does not replay failed request, after=" + after);
    }
});
Case("last-eligibility-callback-cannot-retarget-a-validated-write", () =>
{
    foreach (var mutation in new[] { "model", "dead", "address", "null" })
    {
        var f = new Fixture();
        f.EligibilityOverride = () =>
        {
            if (f.EligibilityCalls == 3)
            {
                if (mutation == "model") f.Ped.ModelValue++;
                if (mutation == "dead") f.Ped.DeadValue = true;
                if (mutation == "address") f.Ped.AddressValue = IntPtr.Zero;
                if (mutation == "null") f.Player.CharacterValue = null;
            }
            return true;
        };
        Reject(() => f.Port.Run(f.Session, 1.25f), "last eligibility callback actor change rejected: " + mutation);
        ZeroWrites("last eligibility callback cannot target invalid actor: " + mutation);
    }
});
Case("toggle-second-session-cannot-carry-an-old-actors-active-flags", () =>
{
    var f = new Fixture(); var controller = new PlayerMotionController(f.Port); controller.SetMultiplier("player-run", 1.25f); controller.Toggle("player-run"); f.Clear();
    var reads = 0; Runtime.OnRead = member => { if (member == "Game.Player" && ++reads == 2) f.Ped.ModelValue++; };
    controller.Toggle("player-swim"); Runtime.OnRead = null;
    Check(!controller.RunEnabled, "actor change during second toggle read cannot carry old run request");
    f.Clear(); controller.Tick(); Check(Runtime.Writes.All(w => w.Method != "SetRunSpeedMultThisFrame"), "new actor receives no old actor run multiplier");
});
Case("typed-api-exception-also-revokes-old-port-token", () =>
{
    foreach (var after in new[] { false, true }) for (var operation = 0; operation < 3; operation++)
    {
        var f = new Fixture(); var thrown = false; Action<MotionWrite> fail = _ => throw new IOException("injected direct typed failure");
        if (after) Runtime.AfterWrite = fail; else Runtime.BeforeWrite = fail;
        try { Calls(f)[operation](f.Session); } catch (IOException) { thrown = true; }
        Check(thrown, "typed failure visible, after=" + after + ", operation=" + operation);
        f.Clear(); Check(f.Port.TrySession(out var next) && next.Epoch > f.Session.Epoch, "typed failure changes continuity, after=" + after + ", operation=" + operation);
        Reject(() => Calls(f)[operation](f.Session), "old typed token cannot revive, after=" + after + ", operation=" + operation); ZeroWrites("revoked token never repeats failed native call");
    }
});

Console.WriteLine($"PLAYER PORT: {passed} assertions passed; {cases} cases; {failures.Count} failures. GTA API is a fixture: no game loading or gameplay PASS.");
foreach (var failure in failures) Console.WriteLine(failure);
Environment.ExitCode = failures.Count == 0 ? 0 : 1;
