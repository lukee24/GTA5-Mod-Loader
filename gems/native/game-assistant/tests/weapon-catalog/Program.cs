using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using Gems.GameAssistant;

var root = Path.Combine(Path.GetDirectoryName(typeof(WeaponCatalog).Assembly.Location)!, "fixture-" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(root);
var path = Path.Combine(root, WeaponCatalog.FileName);
var passed = 0; var cases = 0; var failures = new List<string>();
void Check(bool condition, string message) { if (!condition) throw new Exception(message); passed++; }
void Case(string name, Action body) { cases++; try { body(); Console.WriteLine("PASS " + name); } catch (Exception e) { failures.Add(name + ": " + e); Console.WriteLine("FAIL " + name + ": " + e.Message); } }
void Reject(Action action, string message) { try { action(); } catch (Exception e) when (e is InvalidDataException || e is IOException || e is UnauthorizedAccessException || e is ArgumentException) { passed++; return; } throw new Exception("Accepted: " + message); }
string Digest(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value))).ToLowerInvariant();
string Hash(string name) => GTA.StringHash.AtStringHashUtf8(name, 0).ToString("x8");
JsonObject Row(string name = "WEAPON_GEMS_TEST", int index = 0) => new()
{
    ["id"] = Digest("row" + index), ["modId"] = "sample-mod", ["name"] = "离线武器 样本", ["weaponName"] = name, ["hash"] = Hash(name), ["kind"] = "unknown",
    ["evidence"] = new JsonArray(new JsonObject { ["kind"] = "weapons-meta", ["sourcePath"] = "data/weapons.meta", ["sourceSha256"] = new string('a', 64), ["sourceBytes"] = 123, ["locator"] = "Item[0]/Name" }),
    ["transactionId"] = "fixture-transaction-1", ["fileState"] = "verified", ["registration"] = "unknown", ["dependencies"] = "unknown", ["issues"] = new JsonArray()
};
JsonObject Catalog(string? game = null) => new()
{
    ["schemaVersion"] = 1, ["component"] = "GEMS.WeaponCatalog", ["protocol"] = "gems.weapon-catalog.v1", ["revision"] = new string('b', 64),
    ["gameRoot"] = game ?? root, ["gameRootId"] = Digest(game ?? root), ["targetGame"] = "enhanced", ["requiresGameRestart"] = true,
    ["weapons"] = new JsonArray(Row()), ["issues"] = new JsonArray()
};
void Save(JsonNode value) => File.WriteAllText(path, value.ToJsonString(), new UTF8Encoding(false));
WeaponCatalog Read(JsonNode value) { Save(value); return WeaponCatalog.Read(path); }
void Bad(Action<JsonObject> change, string message) { var value = Catalog(); change(value); Save(value); Reject(() => WeaponCatalog.Read(path), message); }
JsonObject First(JsonObject value) => value["weapons"]![0]!.AsObject();
JsonObject Evidence(JsonObject value) => First(value)["evidence"]![0]!.AsObject();

Case("fixed SDK hash vectors, managed helper only", () =>
{
    foreach (var item in new[] { ("WEAPON_PISTOL", "1b06d571"), ("WEAPON_UNARMED", "a2719263"), ("WEAPON_ASSAULTRIFLE", "bfefff6d"), ("WEAPON_GEMS_TEST", "2c9384c6"), ("weapon_gems_test", "2c9384c6"), ("WEAPON_A", "09c3167e"), ("WEAPON_Z9", "152868df") })
        Check(Hash(item.Item1) == item.Item2, "SDK vector " + item.Item1);
    Check((uint)GTA.WeaponHash.Pistol == 0x1b06d571 && (uint)GTA.WeaponHash.Unarmed == 0xa2719263, "fixed enum correspondence");
});
Case("real UTF8 file roundtrip and immutable metadata", () =>
{
    var catalog = Read(Catalog());
    Check(catalog.Weapons.Count == 1 && catalog.Weapons[0].Name == "离线武器 样本", "UTF8 names preserved");
    Check(catalog.Weapons[0].FileState == "verified" && catalog.Weapons[0].Registration == "unknown" && catalog.Weapons[0].Dependencies == "unknown", "unknown not upgraded");
    Check(catalog.ContentDigest == Digest(File.ReadAllText(path)), "raw file digest");
    Check(catalog.GetType().GetProperties().All(p => p.SetMethod == null), "catalog immutable properties");
    Check(catalog.Weapons[0].GetType().GetProperties().All(p => p.SetMethod == null), "row immutable properties");
    Check(catalog.Weapons is not List<WeaponCatalogEntry> && catalog.Issues is not List<string>, "collections are not writable lists");
    var before = catalog.ContentDigest; var changed = Catalog(); First(changed)["name"] = "另一个名字"; var second = Read(changed);
    Check(second.Revision == catalog.Revision && second.ContentDigest != before, "same declared revision changed payload has distinct fingerprint");
});
Case("missing, old, malformed, invalid UTF8 and trailing payload", () =>
{
    Reject(() => WeaponCatalog.Read(Path.Combine(root, "absent.json")), "missing file");
    Reject(() => WeaponCatalog.Read(Path.Combine(root, "missing", "absent.json")), "missing ancestor");
    Check(!Directory.Exists(Path.Combine(root, "missing")), "reader creates nothing");
    foreach (var raw in new[] { "", "{}", "null", "[]", "{\"schemaVersion\":1,\"vehicles\":[]}", Catalog().ToJsonString() + "{}", Catalog().ToJsonString() + "x", "\ufeff" + Catalog().ToJsonString(), "{", "[", "NaN" })
    { File.WriteAllText(path, raw, new UTF8Encoding(false)); Reject(() => WeaponCatalog.Read(path), "invalid JSON " + raw.Length); }
    foreach (var bytes in new[] { new byte[] { 0xc3, 0x28 }, new byte[] { 0xed, 0xa0, 0x80 }, new byte[] { 0xff, 0xfe, 0x7b, 0x00 } })
    { File.WriteAllBytes(path, bytes); Reject(() => WeaponCatalog.Read(path), "invalid UTF8"); }
});
Case("every field is required and unknown fields rejected", () =>
{
    foreach (var key in Catalog().Select(p => p.Key).ToArray()) { Bad(v => v.Remove(key), "missing root " + key); Bad(v => v[key] = null, "null root " + key); }
    foreach (var key in Row().Select(p => p.Key).ToArray())
    {
        Bad(v => First(v).Remove(key), "missing row " + key);
        if (key != "transactionId") Bad(v => First(v)[key] = null, "null row " + key);
    }
    foreach (var key in Evidence(Catalog()).Select(p => p.Key).ToArray()) { Bad(v => Evidence(v).Remove(key), "missing evidence " + key); Bad(v => Evidence(v)[key] = null, "null evidence " + key); }
    Bad(v => v["extra"] = true, "unknown root"); Bad(v => First(v)["extra"] = true, "unknown row"); Bad(v => Evidence(v)["extra"] = true, "unknown evidence");
    Bad(v => First(v)["transactionId"] = null, "verified files require a transaction");
    var nullable = Catalog(); First(nullable)["transactionId"] = null; First(nullable)["fileState"] = "unverified"; Check(Read(nullable).Weapons[0].TransactionId == null, "explicit null transaction retained for unverified metadata");
});
Case("duplicate JSON keys and strict numeric and boolean types", () =>
{
    foreach (var key in new[] { "revision", "name", "sourcePath" })
    {
        var raw = Catalog().ToJsonString(); var token = '"' + key + "\":"; var pos = raw.IndexOf(token, StringComparison.Ordinal); raw = raw.Insert(pos, '"' + key + "\":null,");
        File.WriteAllText(path, raw); Reject(() => WeaponCatalog.Read(path), "duplicate " + key);
    }
    foreach (var value in new JsonNode?[] { JsonValue.Create("1"), JsonValue.Create(true), JsonValue.Create(1.5), JsonValue.Create(2), JsonValue.Create(-1) }) Bad(v => v["schemaVersion"] = value?.DeepClone(), "schema type/range");
    foreach (var value in new JsonNode?[] { JsonValue.Create("true"), JsonValue.Create(1), JsonValue.Create(false) }) Bad(v => v["requiresGameRestart"] = value?.DeepClone(), "restart type/range");
    foreach (var value in new JsonNode?[] { JsonValue.Create("1"), JsonValue.Create(true), JsonValue.Create(0.5), JsonValue.Create(-1), JsonValue.Create(20L * 1024 * 1024 * 1024 + 1) }) Bad(v => Evidence(v)["sourceBytes"] = value?.DeepClone(), "bytes type/range");
    var maximum = Catalog(); Evidence(maximum)["sourceBytes"] = 20L * 1024 * 1024 * 1024; Check(Read(maximum).Weapons[0].Evidence[0].SourceBytes == 20L * 1024 * 1024 * 1024, "20GiB metadata boundary");
});
Case("all text, enum, identifier, digest and evidence constraints", () =>
{
    foreach (var field in new[] { "component", "protocol", "targetGame" }) Bad(v => v[field] = "other", "root discriminator " + field);
    foreach (var field in new[] { "revision", "gameRootId" }) foreach (var value in new[] { "", new string('A', 64), new string('a', 63), new string('g', 64) }) Bad(v => v[field] = value, field);
    foreach (var field in new[] { "id", "hash" }) foreach (var value in new[] { "", "FFFF", new string('g', field == "id" ? 64 : 8) }) Bad(v => First(v)[field] = value, field);
    foreach (var field in new[] { "kind", "fileState", "registration", "dependencies" }) Bad(v => First(v)[field] = "invented", "row enum " + field);
    Bad(v => Evidence(v)["kind"] = "invented", "evidence kind");
    foreach (var field in new[] { "modId", "transactionId" }) foreach (var value in new[] { "", new string('a', 81), "with space", "../x" }) Bad(v => First(v)[field] = value, field);
    foreach (var name in new[] { "", new string('a', 65), "1NAME", "WEAPON-TEST", "WEAPON_中文" }) Bad(v => First(v)["weaponName"] = name, "token");
    Bad(v => First(v)["hash"] = "00000000", "name/hash mismatch");
    foreach (var value in new[] { "", new string('n', 301), "x\u0000y", "x\ny", "x\u007fy" }) Bad(v => First(v)["name"] = value, "name control/length");
    foreach (var value in new[] { "", "../weapons.meta", "/x", "C:/x", "a\\b", "a//b", "a/./b", "a/CON.txt", "a/lpt9", "a/trailing.", "a/trailing ", "a/?", new string('a', 4097) }) Bad(v => Evidence(v)["sourcePath"] = value, "unsafe source path");
    Bad(v => Evidence(v)["sourceSha256"] = new string('a', 63), "evidence sha");
    Bad(v => Evidence(v)["locator"] = new string('a', 513), "locator length");
    var longest = Catalog(); First(longest)["name"] = new string('中', 300); First(longest)["modId"] = new string('a', 80); First(longest)["transactionId"] = new string('a', 80);
    Evidence(longest)["sourcePath"] = new string('a', 4096); Evidence(longest)["locator"] = new string('a', 512); Check(Read(longest).Weapons[0].Name.Length == 300, "maximum text boundaries");
    foreach (var state in new[] { "verified", "disabled", "uninstalled", "pending", "missing", "changed", "shadowed", "unverified" }) { var v = Catalog(); First(v)["fileState"] = state; Check(Read(v).Weapons[0].FileState == state, "preserved file state " + state); }
});
Case("escaped Unicode, every forbidden control and parser structure limits", () =>
{
    for (var control = 0; control < 32; control++) Bad(v => First(v)["name"] = "before" + (char)control + "after", "C0 control " + control);
    Bad(v => First(v)["name"] = "before\u007fafter", "DEL control");
    var name = System.Text.Json.JsonSerializer.Serialize("离线武器 样本");
    foreach (var replacement in new[] { "\"\\ud800\"", "\"\\udfff\"", "\"\\ud800A\"", "\"\\udc00\\ud800\"" })
    { File.WriteAllText(path, Catalog().ToJsonString().Replace(name, replacement)); Reject(() => WeaponCatalog.Read(path), "unpaired surrogate"); }
    File.WriteAllText(path, Catalog().ToJsonString().Replace(name, "\"\\ud83d\\ude80\"")); Check(WeaponCatalog.Read(path).Weapons[0].Name == "🚀", "paired supplementary character accepted");
    File.WriteAllText(path, Catalog().ToJsonString().Replace("\"name\":", "\"\\u006eame\":null,\"name\":")); Reject(() => WeaponCatalog.Read(path), "duplicate escaped key");
    foreach (var raw in new[] { new string('[', 66) + "0" + new string(']', 66), "[" + string.Join(",", Enumerable.Repeat("0", 100001)) + "]" })
    {
        File.WriteAllText(path, raw); var limited = false;
        try { WeaponCatalog.Read(path); } catch (InvalidDataException error) { limited = error.Message.Contains("结构超限"); }
        Check(limited, "depth/node limit precedes domain interpretation");
    }
});
Case("list, evidence, duplicate row and byte capacity boundaries", () =>
{
    Bad(v => First(v)["evidence"] = new JsonArray(), "empty evidence");
    var max = Catalog(); var evidence = Evidence(max).DeepClone(); First(max)["evidence"] = new JsonArray(Enumerable.Range(0, 32).Select(_ => evidence.DeepClone()).ToArray()); Check(Read(max).Weapons[0].Evidence.Count == 32, "32 evidence");
    First(max)["evidence"]!.AsArray().Add(evidence.DeepClone()); Save(max); Reject(() => WeaponCatalog.Read(path), "33 evidence");
    foreach (var target in new[] { "root", "row" })
    {
        var v = Catalog(); var node = target == "root" ? v : First(v); var count = target == "root" ? 2000 : 64;
        node["issues"] = new JsonArray(Enumerable.Range(0, count).Select(_ => JsonValue.Create("issue")).ToArray()); Check(Read(v).Issues.Count == (target == "root" ? count : 0), "issue count boundary " + target);
        node["issues"]!.AsArray().Add("x"); Save(v); Reject(() => WeaponCatalog.Read(path), "issue count overflow " + target);
        Bad(x => (target == "root" ? x : First(x))["issues"] = new JsonArray(new string('a', 8193)), "issue text overflow");
    }
    foreach (var duplicate in new[] { "id", "name", "hash" })
    {
        var v = Catalog(); var next = Row("WEAPON_OTHER", 1);
        if (duplicate == "id") next["id"] = First(v)["id"]!.DeepClone();
        else { next["weaponName"] = "weapon_gems_test"; next["hash"] = First(v)["hash"]!.DeepClone(); }
        v["weapons"]!.AsArray().Add(next); Save(v); Reject(() => WeaponCatalog.Read(path), "duplicate " + duplicate);
    }
    var many = Catalog(); many["weapons"] = new JsonArray(Enumerable.Range(0, 2000).Select(i => Row("WEAPON_GEMS_" + i, i)).ToArray()); Check(Read(many).Weapons.Count == 2000, "2000 valid distinct rows");
    many["weapons"]!.AsArray().Add(Row("WEAPON_GEMS_2000", 2000)); Save(many); Reject(() => WeaponCatalog.Read(path), "2001 rows");
    var raw = Catalog().ToJsonString(); File.WriteAllText(path, raw + new string(' ', WeaponCatalog.MaxBytes - Encoding.UTF8.GetByteCount(raw)), new UTF8Encoding(false)); Check(WeaponCatalog.Read(path).Weapons.Count == 1, "exact 2MiB accepted");
    using (var append = new FileStream(path, FileMode.Append, FileAccess.Write)) append.WriteByte(32); Reject(() => WeaponCatalog.Read(path), "2MiB plus one");
});
Case("canonical identity preserves drive case, Unicode and actual text", () =>
{
    foreach (var pair in new[] { (@"C:\Games\GTA V", @"C:\Games\GTA V"), (@"c:/Games/中文/", @"c:\Games\中文"), (@"\\?\C:\Games\é\", @"C:\Games\é"), (@"\\?\UNC\Host\Share\Games\", @"\\Host\Share\Games"), (@"C:\", @"C:\"), (@"\\Host\Share\", @"\\Host\Share\") })
    { Check(WeaponGameIdentity.CanonicalGameRoot(pair.Item1) == pair.Item2, "canonical " + pair.Item1); Check(WeaponGameIdentity.GameRootId(pair.Item1) == Digest(pair.Item2), "UTF8 no BOM digest " + pair.Item1); }
    Check(WeaponGameIdentity.GameRootId(@"C:\Games") != WeaponGameIdentity.GameRootId(@"c:\Games"), "drive casing retained");
    Check(WeaponGameIdentity.GameRootId("C:\\é") != WeaponGameIdentity.GameRootId("C:\\é"), "Unicode normalization not folded");
    foreach (var invalid in new[] { "", "relative", @"\rooted", "C:relative", @"\\.\C:\Games", @"C:\a\..\b", @"C:\a\.\b", @"C:\a\\b", @"\\Host\Share", @"\\Host\\Games" }) Reject(() => WeaponGameIdentity.CanonicalGameRoot(invalid), "invalid canonical " + invalid);
    Bad(v => v["gameRootId"] = new string('0', 64), "root digest mismatch");
    Bad(v => { v["gameRoot"] = root + "\\"; v["gameRootId"] = Digest(root + "\\"); }, "noncanonical catalogue root");
});
Case("actual Windows roots and injected current-host binding", () =>
{
    var chinese = Path.Combine(root, "实际 中文 space é"); Directory.CreateDirectory(chinese);
    using (var pins = WeaponPath.PinDirectories(chinese))
    {
        Check(pins.Resolved == chinese, "GetFinalPathNameByHandle returns real casing and Unicode");
        Reject(() => Directory.Move(chinese, chinese + "-moved"), "pinned ancestor rename");
        var catalog = Read(Catalog(pins.Resolved));
        Check(new WeaponGameIdentity(() => pins.Resolved).Match(catalog, out var reason) && reason.Contains("不证明"), "actual resolved root binding with honest qualifier");
        foreach (var mismatch in new[] { pins.Resolved + "-other", pins.Resolved.ToUpperInvariant(), "c" + pins.Resolved.Substring(1) })
            Check(!new WeaponGameIdentity(() => mismatch).Match(catalog, out _), "root text mismatch denied " + mismatch);
        Check(!new WeaponGameIdentity(() => throw new IOException("denied")).Match(catalog, out _), "root failure denies actions");
        Check(catalog.Weapons.Count == 1, "failed identity does not erase readable metadata");
    }
    Check(!new WeaponGameIdentity().Match(Read(Catalog()), out _), "real current non-GTA process rejected");
    Reject(() => WeaponGameIdentity.ResolveCurrentProcessRoot(), "actual process resolver refuses test host");
});
Case("actual exclusive file occupancy, no reads through links", () =>
{
    Save(Catalog());
    using (var locked = new FileStream(path, FileMode.Open, FileAccess.ReadWrite, FileShare.None)) Reject(() => WeaponCatalog.Read(path), "FileShare.None occupancy");
    Check(WeaponCatalog.Read(path).Weapons.Count == 1, "read succeeds after lock released");
    var linked = Path.Combine(root, "hard-linked.json"); if (!Native.CreateHardLink(linked, path, IntPtr.Zero)) throw new Win32Exception(Marshal.GetLastWin32Error());
    Reject(() => WeaponCatalog.Read(linked), "hard link"); Reject(() => WeaponCatalog.Read(path), "original with multiple hard links");
    File.Delete(linked); Check(WeaponCatalog.Read(path).Weapons.Count == 1, "ordinary file readable after fixture hard link removal");
    var junction = Path.Combine(root, "junction"); var command = "New-Item -ItemType Junction -Path '" + junction.Replace("'", "''") + "' -Target '" + root.Replace("'", "''") + "' -ErrorAction Stop | Out-Null";
    var psi = new ProcessStartInfo("powershell.exe") { UseShellExecute = false, RedirectStandardError = true, RedirectStandardOutput = true, CreateNoWindow = true };
    psi.ArgumentList.Add("-NoProfile"); psi.ArgumentList.Add("-EncodedCommand"); psi.ArgumentList.Add(Convert.ToBase64String(Encoding.Unicode.GetBytes(command)));
    using var process = Process.Start(psi)!; var error = process.StandardError.ReadToEnd(); process.WaitForExit(); Check(process.ExitCode == 0, "junction creation: " + error);
    Check((File.GetAttributes(junction) & FileAttributes.ReparsePoint) != 0, "actual junction exists");
    Reject(() => WeaponCatalog.Read(Path.Combine(junction, WeaponCatalog.FileName)), "junction ancestor");
    Reject(() => WeaponCatalog.Read(junction), "directory or link at file target");
});
Case("long Unicode file path uses read-only Win32 extended path", () =>
{
    var deep = Path.Combine(root, new string('中', 70), new string('名', 70), new string('字', 70)); Directory.CreateDirectory(deep);
    var file = Path.Combine(deep, WeaponCatalog.FileName); File.WriteAllText(file, Catalog().ToJsonString(), new UTF8Encoding(false));
    Check(file.Length > 260 && WeaponCatalog.Read(file).Weapons.Count == 1, "long Unicode path read");
});
if (args.Length > 0) Case("actual TypeScript producer fixture", () =>
{
    var fixture = WeaponCatalog.Read(Path.GetFullPath(args[0]));
    Check(fixture.Weapons.Count > 0 && fixture.ContentDigest.Length == 64, "actual producer metadata accepted");
    Console.WriteLine("PRODUCER revision=" + fixture.Revision + " digest=" + fixture.ContentDigest + " rows=" + fixture.Weapons.Count + " root=" + fixture.GameRoot);
});
if (args.Length > 1) Case("actual Node realpath and Win32 final-path identity vectors", () =>
{
    var vectors = JsonNode.Parse(File.ReadAllText(args[1]))!["vectors"]!.AsArray();
    foreach (var vector in vectors)
    {
        using var pins = WeaponPath.PinDirectories(vector!["input"]!.GetValue<string>());
        Check(pins.Resolved == vector["resolved"]!.GetValue<string>(), "actual OS path agrees with Node realpath.native");
        Check(WeaponGameIdentity.CanonicalGameRoot(pins.Resolved) == vector["canonical"]!.GetValue<string>(), "canonical exact text agrees");
        Check(WeaponGameIdentity.GameRootId(pins.Resolved) == vector["gameRootId"]!.GetValue<string>(), "actual system root UTF8 hash agrees");
    }
});
Console.WriteLine($"WEAPON CATALOG: {passed} assertions; {cases} cases; {failures.Count} failures. Offline files and managed SDK hashing only; game untested. Fixture: {root}");
foreach (var failure in failures) Console.WriteLine(failure);
Environment.ExitCode = failures.Count == 0 ? 0 : 1;

static class Native
{
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool CreateHardLink(string fileName, string existingFileName, IntPtr security);
}
