using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using Gems.GameAssistant;

if (args.Length > 0 && args[0] == "hold")
{
    using var held = new FileStream(args[1], FileMode.Open, FileAccess.ReadWrite, FileShare.None);
    Console.WriteLine("locked"); Console.Out.Flush(); Console.ReadLine(); return;
}
if (args.Length > 0 && args[0] == "save")
{
    Console.WriteLine("ready"); Console.Out.Flush(); Console.ReadLine();
    try { var value = InputProfile.Defaults(); value.Bindings[0].Tokens = new[] { args[3] }; var result = new InputProfileStore(args[1]).Save(args[2], value); Console.WriteLine("saved:" + result.Revision); }
    catch (Exception error) { Console.WriteLine("rejected:" + error.GetType().Name); }
    return;
}

var root = args.Length == 0 ? Path.Combine(Path.GetTempPath(), "gems-input-store-" + Guid.NewGuid().ToString("N")) : Path.GetFullPath(args[0]);
Directory.CreateDirectory(root);
var results = new List<object>(); var passed = 0; var failed = 0; var skipped = 0;
void Check(bool condition, string message) { if (!condition) throw new Exception(message); passed++; }
T Throws<T>(Action action) where T : Exception { try { action(); } catch (T error) { passed++; return error; } throw new Exception("Expected " + typeof(T).Name); }
InputProfile Custom(string key = "F6") { var value = InputProfile.Defaults(); value.Bindings[0].Tokens = new[] { key }; return value; }
string NewDir(string name) { var value = Path.Combine(root, name); Directory.CreateDirectory(value); return value; }
string[] Records(string dir) => Directory.GetFiles(dir, "input-profile-*.json").OrderBy(p => p, StringComparer.Ordinal).ToArray();
string Digest(string file) => Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(file))).ToLowerInvariant();
void Run(string name, Action body)
{
    var before = passed;
    try { body(); results.Add(new { name, result = "passed", assertions = passed - before }); Console.WriteLine("PASS " + name); }
    catch (Exception error) { failed++; results.Add(new { name, result = "failed", error = error.ToString() }); Console.WriteLine("FAIL " + name + ": " + error); }
}
Process Child(params string[] childArgs)
{
    var info = new ProcessStartInfo("dotnet") { UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardInput = true, RedirectStandardError = true, CreateNoWindow = true };
    info.ArgumentList.Add(typeof(InputProfile).Assembly.Location);
    foreach (var arg in childArgs) info.ArgumentList.Add(arg);
    return Process.Start(info)!;
}
string ForeignVersion(string dir, string source, int sequence, string parent, string key)
{
    var json = JsonNode.Parse(File.ReadAllText(source))!; json["Sequence"] = sequence; json["ParentRevision"] = parent;
    json["Profile"]!["Bindings"]![0]!["Tokens"] = new JsonArray(key);
    var bytes = Encoding.UTF8.GetBytes(json.ToJsonString()); var hash = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
    var path = Path.Combine(dir, "input-profile-" + sequence.ToString("D8") + "-" + hash + ".json"); File.WriteAllBytes(path, bytes); return path;
}
void Junction(string path, string target)
{
    var command = "New-Item -ItemType Junction -Path '" + path.Replace("'", "''") + "' -Target '" + target.Replace("'", "''") + "' -ErrorAction Stop | Out-Null";
    var info = new ProcessStartInfo("powershell.exe") { UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true, CreateNoWindow = true };
    info.ArgumentList.Add("-NoProfile"); info.ArgumentList.Add("-EncodedCommand"); info.ArgumentList.Add(Convert.ToBase64String(Encoding.Unicode.GetBytes(command)));
    using var process = Process.Start(info)!; var error = process.StandardError.ReadToEnd(); process.WaitForExit(); if (process.ExitCode != 0) throw new Exception(error);
}

Run("first missing read, empty revision, parent confinement", () =>
{
    var dir = Path.Combine(root, "不存在 中文 space"); var store = new InputProfileStore(dir); var initial = store.Read();
    Check(initial.Revision == "empty" && initial.Previous == null, "initial snapshot"); Check(!Directory.Exists(dir), "Read created a directory"); initial.Profile.Validate(); passed++;
    var saved = store.Save(initial.Revision, Custom()); Check(saved.Revision.Length == 64 && saved.Profile.Bindings[0].Tokens[0] == "F6", "saved snapshot");
    Check(saved.Previous!.Bindings[0].Tokens[0] == "F5", "first save previous is default baseline");
    Check(Records(dir).Length == 1 && Digest(Records(dir)[0]) == saved.Revision, "hash filename");
    Throws<DirectoryNotFoundException>(() => new InputProfileStore(Path.Combine(root, "missing-parent", "child")).Save("empty", Custom()));
    Check(!Directory.Exists(Path.Combine(root, "missing-parent")), "created outside requested directory");
});
Run("roundtrip, immutable history, previous/default restore and detached snapshots", () =>
{
    var dir = NewDir("roundtrip"); var store = new InputProfileStore(dir); var first = store.Save("empty", Custom()); var oldPath = Records(dir)[0]; var oldHash = Digest(oldPath);
    var second = store.Save(first.Revision, Custom("F7")); Check(second.Previous!.Bindings[0].Tokens[0] == "F6", "previous profile");
    first.Profile.Bindings[0].Tokens[0] = "F8"; second.Previous!.Bindings[0].Tokens[0] = "F9";
    Check(store.Read().Previous!.Bindings[0].Tokens[0] == "F6", "caller changed stored data");
    var restored = store.Save(second.Revision, store.Read().Previous!); Check(restored.Profile.Bindings[0].Tokens[0] == "F6", "restore previous");
    var defaults = store.Save(restored.Revision, InputProfile.Defaults()); Check(defaults.Profile.Bindings[0].Tokens[0] == "F5", "restore defaults");
    Check(Records(dir).Length == 4 && Digest(oldPath) == oldHash, "old records overwritten");
    Throws<InvalidDataException>(() => store.Save(first.Revision, Custom())); Check(Records(dir).Length == 4, "stale save published");
});
Run("invalid input rejected before writing", () =>
{
    var dir = Path.Combine(root, "invalid-input"); var store = new InputProfileStore(dir); var value = Custom(); value.Bindings[0].Tokens = new[] { "Up" };
    Throws<InvalidDataException>(() => store.Save("empty", value)); Check(!Directory.Exists(dir), "invalid write created directory");
    value = Custom(); value.Bindings = null!; Throws<InvalidDataException>(() => store.Save("empty", value));
    Throws<ArgumentNullException>(() => store.Save("empty", null!)); Throws<ArgumentNullException>(() => store.Save(null!, Custom()));
});
Run("external bytes, filename, gap, branch and lock corruption rejected", () =>
{
    foreach (var kind in new[] { "bytes", "filename", "gap", "branch", "lock", "oversize", "empty", "directory-record" })
    {
        var dir = NewDir("corrupt-" + kind); var store = new InputProfileStore(dir); var first = store.Save("empty", Custom()); var path = Records(dir)[0];
        if (kind == "bytes") File.AppendAllText(path, " ");
        if (kind == "filename") File.Move(path, Path.Combine(dir, "input-profile-wrong.json"));
        if (kind == "gap") { store.Save(first.Revision, Custom("F7")); File.Delete(path); }
        if (kind == "branch") ForeignVersion(dir, path, 1, "empty", "F8");
        if (kind == "lock") File.WriteAllText(Path.Combine(dir, ".input-profile.lock"), "foreign content");
        if (kind == "oversize") File.WriteAllBytes(path, new byte[65537]);
        if (kind == "empty") File.WriteAllBytes(path, Array.Empty<byte>());
        if (kind == "directory-record") Directory.CreateDirectory(Path.Combine(dir, "input-profile-surprise.json"));
        Throws<Exception>(() => store.Read()); Throws<Exception>(() => store.Save(first.Revision, Custom("F9")));
    }
});
Run("real cross-process FileShare.None record and gate locks", () =>
{
    foreach (var kind in new[] { "record", "gate" })
    {
        var dir = NewDir("locked-" + kind); var store = new InputProfileStore(dir); var original = store.Save("empty", Custom());
        using var process = Child("hold", kind == "record" ? Records(dir)[0] : Path.Combine(dir, ".input-profile.lock"));
        Check(process.StandardOutput.ReadLine() == "locked", "child failed to lock");
        Throws<IOException>(() => store.Read()); Throws<IOException>(() => store.Save(original.Revision, Custom("F7")));
        process.StandardInput.WriteLine(); process.StandardInput.Flush(); Check(process.WaitForExit(10000) && process.ExitCode == 0, "child lock exit");
        Check(store.Read().Revision == original.Revision && Records(dir).Length == 1, "lock failure changed history");
    }
});
Run("before-publication failure preserves previous and retry works", () =>
{
    var dir = NewDir("before"); var store = new InputProfileStore(dir); var first = store.Save("empty", Custom());
    store.SaveHook = point => { if (point == InputProfileStore.SavePoint.BeforePublish) throw new IOException("injected before"); };
    Throws<IOException>(() => store.Save(first.Revision, Custom("F7"))); Check(store.Read().Revision == first.Revision && Records(dir).Length == 1, "precommit changed history");
    store.SaveHook = null; Check(store.Save(first.Revision, Custom("F7")).Profile.Bindings[0].Tokens[0] == "F7", "retry");
});
Run("after-publication exception reports committed when disk confirms", () =>
{
    var dir = NewDir("after-confirmed"); var store = new InputProfileStore(dir); var first = store.Save("empty", Custom());
    store.SaveHook = point => { if (point == InputProfileStore.SavePoint.AfterPublish) throw new IOException("injected after"); };
    var saved = store.Save(first.Revision, Custom("F7")); Check(saved.Revision == store.Read().Revision && saved.Profile.Bindings[0].Tokens[0] == "F7", "committed reported as failure");
    Check(Records(dir).Length == 2, "duplicate publication");
});
Run("after-publication unavailable read reports unknown, later read recovers", () =>
{
    var dir = NewDir("after-locked"); var store = new InputProfileStore(dir); var first = store.Save("empty", Custom()); FileStream? held = null;
    store.SaveHook = point => { if (point == InputProfileStore.SavePoint.AfterPublish) { held = new FileStream(Records(dir).Last(), FileMode.Open, FileAccess.ReadWrite, FileShare.None); throw new IOException("after locked"); } };
    try { var error = Throws<InputProfileStoreException>(() => store.Save(first.Revision, Custom("F7"))); Check(error.OutcomeUnknown && error.AttemptedRevision.Length == 64, "unknown outcome absent"); }
    finally { held?.Dispose(); }
    Check(store.Read().Profile.Bindings[0].Tokens[0] == "F7" && Records(dir).Length == 2, "committed result not recoverable");
});
Run("after-publication corruption and branching stay unknown and refuse Read", () =>
{
    foreach (var kind in new[] { "corruption", "branch" })
    {
        var dir = NewDir("after-" + kind); var store = new InputProfileStore(dir); var first = store.Save("empty", Custom());
        store.SaveHook = point => { if (point == InputProfileStore.SavePoint.AfterPublish) { var path = Records(dir).Last(); if (kind == "corruption") File.AppendAllText(path, " "); else ForeignVersion(dir, path, 2, first.Revision, "F8"); throw new IOException("external change"); } };
        var error = Throws<InputProfileStoreException>(() => store.Save(first.Revision, Custom("F7"))); Check(error.OutcomeUnknown, "false rollback claim"); Throws<InvalidDataException>(() => store.Read());
    }
});
Run("existing snapshots held immutable throughout publication", () =>
{
    var dir = NewDir("pinned-history"); var store = new InputProfileStore(dir); var first = store.Save("empty", Custom()); var path = Records(dir)[0];
    store.SaveHook = point => { if (point == InputProfileStore.SavePoint.BeforePublish) { Throws<IOException>(() => File.WriteAllText(path, "bad")); Throws<IOException>(() => File.Delete(path)); } };
    var saved = store.Save(first.Revision, Custom("F7")); Check(saved.Previous!.Bindings[0].Tokens[0] == "F6", "history changed");
});
Run("non-cooperating writer detected before own publication", () =>
{
    var dir = NewDir("foreign-before"); var store = new InputProfileStore(dir); var first = store.Save("empty", Custom());
    store.SaveHook = point => { if (point == InputProfileStore.SavePoint.BeforePublish) ForeignVersion(dir, Records(dir)[0], 2, first.Revision, "F8"); };
    Throws<InvalidDataException>(() => store.Save(first.Revision, Custom("F7"))); Check(store.Read().Profile.Bindings[0].Tokens[0] == "F8" && Records(dir).Length == 2, "foreign commit overwritten");
});
Run("two real processes racing one revision publish exactly once", () =>
{
    for (var round = 0; round < 8; round++)
    {
        var dir = NewDir("race-" + round); var store = new InputProfileStore(dir); var first = store.Save("empty", Custom());
        using var a = Child("save", dir, first.Revision, "F7"); using var b = Child("save", dir, first.Revision, "F8");
        Check(a.StandardOutput.ReadLine() == "ready" && b.StandardOutput.ReadLine() == "ready", "racing children not ready");
        a.StandardInput.WriteLine(); a.StandardInput.Flush(); b.StandardInput.WriteLine(); b.StandardInput.Flush();
        var output = new[] { a.StandardOutput.ReadLine()!, b.StandardOutput.ReadLine()! };
        Check(a.WaitForExit(10000) && b.WaitForExit(10000), "racing children timeout");
        Check(output.Count(v => v.StartsWith("saved:")) == 1 && output.Count(v => v.StartsWith("rejected:")) == 1, "race results: " + string.Join(" / ", output));
        Check(Records(dir).Length == 2 && store.Read().Revision != first.Revision, "race forked history");
    }
});
Run("junction directory, ancestor and published entry rejected", () =>
{
    var actual = NewDir("junction-target"); var store = new InputProfileStore(actual); var first = store.Save("empty", Custom());
    var link = Path.Combine(root, "junction-link"); Junction(link, actual);
    Throws<InvalidDataException>(() => new InputProfileStore(link).Read()); Throws<InvalidDataException>(() => new InputProfileStore(link).Save(first.Revision, Custom("F7")));
    Throws<InvalidDataException>(() => new InputProfileStore(Path.Combine(link, "child")).Read());
    var linkedEntry = Path.Combine(actual, "input-profile-linked.json"); Junction(linkedEntry, NewDir("junction-record-target"));
    Throws<InvalidDataException>(() => store.Read()); Check(Records(actual).Length == 1, "link test altered target records");
});
Run("ancestor replacement blocked during commit", () =>
{
    var outer = NewDir("pinned-parent"); var dir = Path.Combine(outer, "profiles"); var store = new InputProfileStore(dir); var first = store.Save("empty", Custom());
    store.SaveHook = point => { if (point == InputProfileStore.SavePoint.BeforePublish) { Throws<IOException>(() => Directory.Move(dir, dir + "-moved")); Throws<IOException>(() => Directory.Move(outer, outer + "-moved")); } };
    Check(store.Save(first.Revision, Custom("F7")).Profile.Bindings[0].Tokens[0] == "F7", "directory pin save");
});
Run("unrelated files and pending records never become revisions", () =>
{
    var dir = NewDir("unrelated"); File.WriteAllText(Path.Combine(dir, "user-settings.json"), "user data"); File.WriteAllText(Path.Combine(dir, "input-profile-pending-abandoned.tmp"), "incomplete");
    var store = new InputProfileStore(dir); Check(store.Read().Revision == "empty", "pending promoted"); store.Save("empty", Custom());
    Check(File.ReadAllText(Path.Combine(dir, "user-settings.json")) == "user data", "foreign file altered"); Check(File.ReadAllText(Path.Combine(dir, "input-profile-pending-abandoned.tmp")) == "incomplete", "foreign pending deleted");
});
Run("temporary handle prevents rename or overwrite and failure never deletes foreign paths", () =>
{
    foreach (var fail in new[] { false, true })
    {
        var dir = NewDir("temporary-" + fail); var store = new InputProfileStore(dir); var first = store.Save("empty", Custom()); string? temporary = null;
        store.SaveHook = point =>
        {
            if (point != InputProfileStore.SavePoint.BeforePublish) return;
            temporary = Directory.GetFiles(dir, "*.tmp").Single();
            Throws<IOException>(() => File.Move(temporary, temporary + ".stolen")); Throws<IOException>(() => File.WriteAllText(temporary, "foreign bytes"));
            if (fail) throw new IOException("before publication");
        };
        if (fail)
        {
            Throws<IOException>(() => store.Save(first.Revision, Custom("F7"))); Check(File.Exists(temporary), "failed temp deleted");
            File.Move(temporary!, Path.Combine(dir, "preserved-unpublished.tmp")); File.WriteAllText(temporary!, "foreign replacement");
            store.SaveHook = null; store.Save(first.Revision, Custom("F8")); Check(File.ReadAllText(temporary!) == "foreign replacement", "later save deleted foreign replacement");
        }
        else Check(store.Save(first.Revision, Custom("F7")).Profile.Bindings[0].Tokens[0] == "F7", "protected publication failed");
    }
});
Run("100 handle publications retain exact deterministic Unicode filenames", () =>
{
    var dir = NewDir("100-中文 空格"); var store = new InputProfileStore(dir); var revision = "empty";
    for (var i = 0; i < 100; i++)
    {
        var saved = store.Save(revision, Custom(i % 2 == 0 ? "F7" : "F8")); revision = saved.Revision;
        var names = Directory.GetFiles(dir).Where(p => Path.GetFileName(p).StartsWith("input-profile-")).ToArray();
        Check(names.Length == i + 1 && names.All(p => Path.GetFileName(p).Length == 92 && p.EndsWith(".json")), "rename appended stray characters");
        Check(store.Read().Revision == revision, "published revision unreadable");
    }
});
Run("explicit corrupt-tail recovery preserves exact bytes and can save again", () =>
{
    var dir = NewDir("recover-tail"); var store = new InputProfileStore(dir); var first = store.Save("empty", Custom()); var second = store.Save(first.Revision, Custom("F7"));
    var damaged = Records(dir).Last(); File.AppendAllText(damaged, " "); var before = Digest(damaged);
    var plan = store.PreviewRecovery(); Check(!plan.Resuming && plan.LastTrusted.Revision == first.Revision && plan.AffectedFiles.Length == 1, "wrong recovery preview");
    Throws<InvalidDataException>(() => store.Read()); Check(File.Exists(damaged), "preview moved data");
    var recovered = store.Recover(plan); Check(recovered.Revision == first.Revision && recovered.Profile.Bindings[0].Tokens[0] == "F6", "wrong recovered state");
    var preserved = Directory.GetFiles(dir, Path.GetFileName(damaged), SearchOption.AllDirectories).Single();
    Check(Path.GetDirectoryName(preserved) != dir && Digest(preserved) == before, "damaged data lost or changed");
    Check(store.Save(recovered.Revision, Custom("F8")).Profile.Bindings[0].Tokens[0] == "F8", "save after recovery");
    Throws<InvalidOperationException>(() => store.PreviewRecovery());
});
Run("fork recovery never arbitrarily chooses a competing version", () =>
{
    var dir = NewDir("recover-fork"); var store = new InputProfileStore(dir); var first = store.Save("empty", Custom()); var second = store.Save(first.Revision, Custom("F7"));
    ForeignVersion(dir, Records(dir).Last(), 2, first.Revision, "F8");
    var plan = store.PreviewRecovery(); Check(plan.LastTrusted.Revision == first.Revision && plan.AffectedFiles.Length == 2, "fork picked a winner");
    var restored = store.Recover(plan); Check(restored.Revision == first.Revision && Records(dir).Length == 1, "fork recovery prefix");
});
Run("all corrupt explicit preview recovers baseline without deleting source bytes", () =>
{
    var dir = NewDir("recover-all"); var store = new InputProfileStore(dir); store.Save("empty", Custom()); var path = Records(dir)[0]; File.WriteAllText(path, "{bad json");
    var plan = store.PreviewRecovery(); Check(plan.LastTrusted.Revision == "empty" && plan.AffectedFiles.Length == 1, "baseline not explicit");
    Check(store.Recover(plan).Profile.Bindings[0].Tokens[0] == "F5", "baseline recovery");
    Check(Directory.GetFiles(dir, Path.GetFileName(path), SearchOption.AllDirectories).Select(File.ReadAllText).Single() == "{bad json", "corrupt source bytes lost");
});
Run("recovery rejects changed bytes, replacement identity and newly added records", () =>
{
    foreach (var kind in new[] { "bytes", "identity", "extra" })
    {
        var dir = NewDir("recover-change-" + kind); var store = new InputProfileStore(dir); var first = store.Save("empty", Custom()); store.Save(first.Revision, Custom("F7"));
        var damaged = Records(dir).Last(); File.AppendAllText(damaged, " "); var plan = store.PreviewRecovery();
        if (kind == "bytes") File.AppendAllText(damaged, " ");
        if (kind == "identity") { var bytes = File.ReadAllBytes(damaged); File.Move(damaged, damaged + ".old"); File.WriteAllBytes(damaged, bytes); }
        if (kind == "extra") ForeignVersion(dir, Records(dir)[0], 2, first.Revision, "F8");
        Throws<InvalidDataException>(() => store.Recover(plan)); Check(File.Exists(damaged), "changed file moved");
    }
});
Run("durable interrupted recovery resumes after intent and each partial move", () =>
{
    foreach (var point in new[] { 0, 1, 2 })
    {
        var dir = NewDir("recover-interrupt-" + point); var store = new InputProfileStore(dir); var first = store.Save("empty", Custom()); var second = store.Save(first.Revision, Custom("F7")); store.Save(second.Revision, Custom("F8"));
        File.AppendAllText(Records(dir)[1], " "); var originals = Records(dir).ToDictionary(p => Path.GetFileName(p)!, Digest);
        var plan = store.PreviewRecovery(); Check(plan.AffectedFiles.Length == 2, "tail must include descendants");
        store.RecoveryHook = (where, count) => { if (point == 0 ? where == InputProfileStore.RecoveryPoint.IntentPublished : where == InputProfileStore.RecoveryPoint.AfterMove && count == point) throw new IOException("interrupted recovery"); };
        Check(Throws<InputProfileStoreException>(() => store.Recover(plan)).OutcomeUnknown, "interrupted recovery claimed rollback");
        Throws<InvalidDataException>(() => store.Read()); Throws<InvalidDataException>(() => store.Save(first.Revision, Custom("F9")));
        var fresh = new InputProfileStore(dir); var resumed = fresh.PreviewRecovery(); Check(resumed.Resuming && resumed.LastTrusted.Revision == first.Revision, "resume plan lost");
        Check(fresh.Recover(resumed).Revision == first.Revision, "resume revision");
        foreach (var pair in originals) Check(Digest(Directory.GetFiles(dir, pair.Key!, SearchOption.AllDirectories).Single()) == pair.Value, "recovery lost or changed bytes");
    }
});
Run("recovery final acknowledgement error returns verified committed result", () =>
{
    var dir = NewDir("recover-after-complete"); var store = new InputProfileStore(dir); var first = store.Save("empty", Custom()); store.Save(first.Revision, Custom("F7")); File.AppendAllText(Records(dir).Last(), " ");
    var plan = store.PreviewRecovery(); store.RecoveryHook = (where, count) => { if (where == InputProfileStore.RecoveryPoint.Completed) throw new IOException("lost acknowledgement"); };
    Check(store.Recover(plan).Revision == first.Revision && store.Read().Revision == first.Revision, "verified completion reported failed");
});
Run("recovery uses owned handles and blocks same-path replacement", () =>
{
    var dir = NewDir("recover-owned-handle"); var store = new InputProfileStore(dir); var first = store.Save("empty", Custom()); store.Save(first.Revision, Custom("F7"));
    var damaged = Records(dir).Last(); File.AppendAllText(damaged, " "); var before = Digest(damaged); var plan = store.PreviewRecovery();
    store.RecoveryHook = (where, count) =>
    {
        if (where != InputProfileStore.RecoveryPoint.IntentPublished) return;
        Throws<IOException>(() => File.Move(damaged, damaged + ".stolen")); Throws<IOException>(() => File.WriteAllText(damaged, "foreign replacement"));
        var manifest = Directory.GetFiles(dir, "intent.json", SearchOption.AllDirectories).Single();
        Throws<IOException>(() => File.WriteAllText(manifest, "foreign recovery plan")); Throws<IOException>(() => File.Move(manifest, manifest + ".stolen"));
    };
    Check(store.Recover(plan).Revision == first.Revision, "owned recovery failed");
    Check(Digest(Directory.GetFiles(dir, Path.GetFileName(damaged), SearchOption.AllDirectories).Single()) == before, "moved wrong bytes");
});
Run("new foreign source after recovery move is preserved and blocks completion", () =>
{
    var dir = NewDir("recover-foreign-source"); var store = new InputProfileStore(dir); var first = store.Save("empty", Custom()); store.Save(first.Revision, Custom("F7"));
    var damaged = Records(dir).Last(); File.AppendAllText(damaged, " "); var plan = store.PreviewRecovery();
    store.RecoveryHook = (where, count) => { if (where == InputProfileStore.RecoveryPoint.AfterMove) File.WriteAllText(damaged, "foreign replacement"); };
    Check(Throws<InputProfileStoreException>(() => store.Recover(plan)).OutcomeUnknown, "ambiguous source claimed success");
    Check(File.ReadAllText(damaged) == "foreign replacement", "foreign source destroyed"); Throws<InvalidDataException>(() => store.Read()); Throws<InvalidDataException>(() => store.PreviewRecovery());
});
Run("more than 512 recovery directories refuses all operations", () =>
{
    var dir = NewDir("recovery-limit"); var store = new InputProfileStore(dir);
    for (var i = 0; i < 514; i++) Directory.CreateDirectory(Path.Combine(dir, "recovery-" + Guid.NewGuid().ToString("N")));
    Throws<InvalidDataException>(() => store.Read()); Throws<InvalidDataException>(() => store.Save("empty", Custom())); Throws<InvalidDataException>(() => store.PreviewRecovery());
    Check(Directory.GetDirectories(dir).Length == 514, "recovery directories removed");
});
Run("long Unicode path save and corrupt-tip recovery", () =>
{
    var parent = NewDir(new string('x', 140)); var dir = Path.Combine(parent, "映射 中文 路径"); var store = new InputProfileStore(dir);
    var first = store.Save("empty", Custom()); Check(Records(dir)[0].Length > 260, "long path fixture too short");
    store.Save(first.Revision, Custom("F7")); File.AppendAllText(Records(dir).Last(), " ");
    Check(store.Recover(store.PreviewRecovery()).Revision == first.Revision, "long path recovery failed");
    Check(store.Save(first.Revision, Custom("F8")).Profile.Bindings[0].Tokens[0] == "F8", "long path later save");
});
Run("formerly accepted overlapping gamepad toggle cannot be persisted", () =>
{
    var dir = Path.Combine(root, "invalid-pad-prefix"); var store = new InputProfileStore(dir); var profile = InputProfile.Defaults();
    profile.Bindings.Single(b => b.Id == "pad-Toggle").Tokens = new[] { "FrontendLb", "FrontendRb" };
    Throws<InvalidDataException>(() => store.Save("empty", profile)); Check(!Directory.Exists(dir), "invalid pad prefix persisted");
});
Run("recovery capture memory and generated manifest are bounded before mutation", () =>
{
    var dir = NewDir("recovery-byte-limit"); var store = new InputProfileStore(dir);
    for (var i = 0; i < 5; i++) File.WriteAllBytes(Path.Combine(dir, "input-profile-oversized-" + i + ".json"), new byte[4 * 1024 * 1024]);
    Throws<InvalidDataException>(() => store.PreviewRecovery()); Check(Directory.GetDirectories(dir, "recovery-*").Length == 0, "oversize started recovery");
    var namesDir = NewDir("recovery-manifest-limit"); var namesStore = new InputProfileStore(namesDir);
    for (var i = 0; i < 512; i++) File.WriteAllText(Path.Combine(namesDir, "input-profile-" + new string('中', 200) + i.ToString("D3") + ".json"), "bad");
    Throws<InvalidDataException>(() => namesStore.PreviewRecovery()); Check(Directory.GetDirectories(namesDir, "recovery-*").Length == 0, "oversize manifest published");
});

var report = new { schemaVersion = 1, component = "stage4-input-profile-store", testedAtUtc = DateTime.UtcNow, os = Environment.OSVersion.ToString(), runtime = Environment.Version.ToString(), root, assertionsPassed = passed, casesFailed = failed, skipped, results, actualGameTested = false };
var reportPath = Path.Combine(root, "0.1.81-stage4-store-results.json"); File.WriteAllText(reportPath, System.Text.Json.JsonSerializer.Serialize(report, new System.Text.Json.JsonSerializerOptions { WriteIndented = true }));
Console.WriteLine($"ASSERTIONS {passed}; FAILURES {failed}; SKIPS {skipped}; REPORT {reportPath}"); Environment.ExitCode = failed == 0 ? 0 : 1;
