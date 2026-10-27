using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;

namespace Gems.GameAssistant
{
    // Immutable intent/result files. Never deletes, replaces or repairs someone else's files.
    // History is audit evidence, not authority to remove a weapon after a script restart.
    public sealed class WeaponJournal : IWeaponJournal, IWeaponActionJournal
    {
        private readonly string directory;
        private readonly Dictionary<string, string> observed = new Dictionary<string, string>(StringComparer.Ordinal);
        private readonly Dictionary<string, FileStream> held = new Dictionary<string, FileStream>(StringComparer.Ordinal);
        private readonly Dictionary<string, IDisposable> pins = new Dictionary<string, IDisposable>(StringComparer.Ordinal);
        private readonly Dictionary<string, string> heldVersions = new Dictionary<string, string>(StringComparer.Ordinal);
        internal Action<string>? Hook { get; set; }
        public int UnconfirmedCount { get; private set; }
        public const int MaximumFiles = 2048;
        public const int MaximumRecordBytes = 1024 * 1024, MaximumTotalBytes = 16 * 1024 * 1024;
        public WeaponJournal(string directory) { this.directory = Path.GetFullPath(directory); }
        private void EnsureDirectory()
        {
            var missing = new Stack<string>(); var current = directory;
            while (!Directory.Exists(current)) { missing.Push(current); current = Path.GetDirectoryName(current) ?? throw new IOException("记录路径缺少根目录。"); }
            while (missing.Count > 0)
            {
                var next = missing.Pop();
                using (WeaponPath.PinDirectories(Path.GetDirectoryName(next)!))
                { Directory.CreateDirectory(next); using (WeaponPath.PinDirectories(next)) { } }
            }
        }
        private static string Decode(byte[] bytes)
        {
            var text = new UTF8Encoding(false, true).GetString(bytes); var end = text.IndexOf('\n');
            if (end != 64 || text.Substring(0, end) != WeaponGameIdentity.Digest(new UTF8Encoding(false).GetBytes(text.Substring(end + 1))))
                throw new InvalidDataException("武器记录摘要损坏；保留文件，禁止继续写入。");
            var payload = text.Substring(end + 1);
            if (!payload.StartsWith("GEMS.WeaponAction.v1\n", StringComparison.Ordinal) && !payload.StartsWith("GEMS.WeaponAction.v2\n", StringComparison.Ordinal)) throw new InvalidDataException("武器记录版本无效。");
            return payload;
        }
        private static string ValidatePayload(string payload, string id, bool isIntent)
        {
            var lines = payload.Split('\n');
            if (lines.Length < 3 || lines[lines.Length - 1] != "" || payload.IndexOf('\r') >= 0) throw new InvalidDataException("武器记录行格式无效。");
            var version = lines[0] == "GEMS.WeaponAction.v1" ? "v1" : "v2";
            var fields = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (var line in lines.Skip(1).Take(lines.Length - 2))
            {
                var equal = line.IndexOf('=');
                if (equal <= 0 || fields.ContainsKey(line.Substring(0, equal))) throw new InvalidDataException("武器记录字段缺失或重复。");
                fields.Add(line.Substring(0, equal), line.Substring(equal + 1));
            }
            var expected = isIntent ? version == "v1" ? new[] { "id", "phase", "action", "hash", "amount", "source", "before" } : new[] { "id", "phase", "action", "before", "detail" }
                : new[] { "id", "phase", "state", "after", "detail" };
            if (fields.Count != expected.Length || expected.Any(k => !fields.ContainsKey(k)) || fields["id"] != id || fields["phase"] != (isIntent ? "intent" : "result"))
                throw new InvalidDataException("武器记录身份、阶段或字段与文件类型不符；未确认为完成。");
            if (isIntent && version == "v1" && (!System.Text.RegularExpressions.Regex.IsMatch(fields["hash"], "\\A[0-9a-f]{8}\\z") || !int.TryParse(fields["amount"], NumberStyles.Integer, CultureInfo.InvariantCulture, out _)))
                throw new InvalidDataException("旧版武器意图数值无效。");
            if (!isIntent && fields["state"] != "observed-not-game-tested" && fields["state"] != "unknown-partial" && fields["state"] != "not-submitted" && !(version == "v2" && fields["state"] == "request-returned-effect-unknown"))
                throw new InvalidDataException("未知武器结果状态。");
            var encoded = isIntent ? version == "v1" ? new[] { "source", "before" } : new[] { "action", "before", "detail" } : new[] { "after", "detail" };
            foreach (var key in encoded)
                try { new UTF8Encoding(false, true).GetString(Convert.FromBase64String(fields[key])); }
                catch (Exception e) when (e is FormatException || e is DecoderFallbackException) { throw new InvalidDataException("武器记录编码无效。", e); }
            return version;
        }
        public void Verify()
        {
            EnsureDirectory();
            using (WeaponPath.PinDirectories(directory))
            {
                if (Directory.EnumerateDirectories(directory).Any()) throw new InvalidDataException("武器记录目录包含未知子目录。");
                var files = Directory.EnumerateFiles(directory).Take(MaximumFiles + 1).ToArray();
                if (files.Length > MaximumFiles) throw new InvalidDataException("武器记录超过2048文件容量；保留历史后需另建记录目录。");
                CheckBudget(files, 0);
                var intents = new HashSet<string>(StringComparer.Ordinal); var results = new HashSet<string>(StringComparer.Ordinal); var unknown = new HashSet<string>(StringComparer.Ordinal);
                var versions = new Dictionary<string, string>(StringComparer.Ordinal);
                long readBytes = 0;
                foreach (var path in files)
                {
                    var name = Path.GetFileName(path);
                    if (!System.Text.RegularExpressions.Regex.IsMatch(name, "\\A[0-9a-f]{32}\\.(intent|result)\\z")) throw new InvalidDataException("未知武器记录文件；未覆盖或删除。");
                    var id = name.Substring(0, 32); var isIntent = name.EndsWith(".intent", StringComparison.Ordinal);
                    if (isIntent) intents.Add(id); else results.Add(id);
                    if (isIntent && held.ContainsKey(id))
                    {
                        versions[name] = heldVersions[id];
                        readBytes += held[id].Length;
                        if (readBytes > MaximumTotalBytes) throw new InvalidDataException("武器记录读取超过16MiB预算。");
                        continue;
                    }
                    var bytes = WeaponPath.ReadFile(path, MaximumRecordBytes); var payload = Decode(bytes);
                    versions[name] = ValidatePayload(payload, id, isIntent);
                    readBytes += bytes.Length;
                    if (readBytes > MaximumTotalBytes) throw new InvalidDataException("武器记录读取期间增长超过16MiB预算。");
                    if (!payload.Contains("\nid=" + id + "\n")) throw new InvalidDataException("武器记录身份不匹配。");
                    if (!isIntent && payload.Contains("\nstate=unknown-partial\n")) unknown.Add(id);
                    var digest = WeaponGameIdentity.Digest(bytes);
                    if (observed.TryGetValue(name, out var previous) && previous != digest) throw new InvalidDataException("武器记录已被外部修改；停止写入。");
                    observed[name] = digest;
                }
                if (observed.Keys.Any(name => !files.Any(f => Path.GetFileName(f) == name))) throw new InvalidDataException("已读武器记录被外部移除。");
                if (results.Any(id => !intents.Contains(id))) throw new InvalidDataException("武器结果缺少原始意图记录。");
                if (results.Any(id => versions[id + ".intent"] != versions[id + ".result"])) throw new InvalidDataException("武器意图与结果版本不配对；未确认为完成。");
                UnconfirmedCount = intents.Count(id => !results.Contains(id) || unknown.Contains(id));
            }
        }
        private static byte[] Bytes(string payload)
        { var data = new UTF8Encoding(false).GetBytes(payload); return new UTF8Encoding(false).GetBytes(WeaponGameIdentity.Digest(data) + "\n" + payload); }
        private static void CheckBudget(string[] files, int additionalBytes)
        {
            long total = additionalBytes;
            foreach (var file in files)
            {
                var length = new FileInfo(file).Length;
                if (length < 1 || length > MaximumRecordBytes) throw new InvalidDataException("单条武器记录必须为1字节至1MiB；保留原件，停止写入。");
                total += length;
                if (total > MaximumTotalBytes) throw new InvalidDataException("武器记录总量超过16MiB预算；保留历史并停止写入。");
            }
            if (total > MaximumTotalBytes) throw new InvalidDataException("武器记录总量预算不足。");
        }
        private FileStream WriteNew(string name, byte[] bytes)
        {
            if (bytes.Length < 1 || bytes.Length > MaximumRecordBytes) throw new InvalidDataException("本次武器意图/结果超过1MiB；未创建不可读记录文件。");
            ValidatePayload(Decode(bytes), name.Substring(0, 32), name.EndsWith(".intent", StringComparison.Ordinal));
            var files = Directory.EnumerateFiles(directory).Take(MaximumFiles + 1).ToArray();
            var intent = name.EndsWith(".intent", StringComparison.Ordinal);
            if (files.Length + (intent ? 2 : 1) > MaximumFiles) throw new InvalidDataException("武器记录文件容量不足。");
            // Reserve a maximum-sized result before the mutation can be authorized.
            CheckBudget(files, bytes.Length + (intent ? MaximumRecordBytes : 0));
            var stream = new FileStream(Path.Combine(directory, name), FileMode.CreateNew, FileAccess.ReadWrite, FileShare.Read);
            try
            {
                stream.Write(bytes, 0, bytes.Length); stream.Flush(true); Hook?.Invoke("written:" + name);
                stream.Position = 0; var copy = new byte[bytes.Length]; var at = 0;
                while (at < copy.Length) { var count = stream.Read(copy, at, copy.Length - at); if (count == 0) throw new EndOfStreamException(); at += count; }
                if (stream.Length != bytes.Length || !copy.SequenceEqual(bytes)) throw new IOException("武器记录读回不一致。");
                observed[name] = WeaponGameIdentity.Digest(bytes); return stream;
            }
            catch { stream.Dispose(); throw; } // A partial file remains visible for diagnosis; no path-based deletion.
        }
        public string Begin(string action, WeaponSnapshot before, uint hash, int amount, string sourceToken)
        {
            Verify(); var id = Guid.NewGuid().ToString("N"); var pin = WeaponPath.PinDirectories(directory);
            try
            {
                if (Directory.EnumerateFiles(directory).Take(MaximumFiles).Count() > MaximumFiles - 2) throw new IOException("记录容量不足以同时保留意图和结果；未执行武器动作。");
                var bytes = Bytes("GEMS.WeaponAction.v1\nid=" + id + "\nphase=intent\naction=" + action + "\nhash=" + hash.ToString("x8") + "\namount=" + amount.ToString(CultureInfo.InvariantCulture) + "\nsource=" + Convert.ToBase64String(Encoding.UTF8.GetBytes(sourceToken)) + "\nbefore=" + Convert.ToBase64String(Encoding.UTF8.GetBytes(before.Canonical)) + "\n");
                var stream = WriteNew(id + ".intent", bytes); held.Add(id, stream); heldVersions.Add(id, "v1"); pins.Add(id, pin); UnconfirmedCount++; return id;
            }
            catch { pin.Dispose(); throw; }
        }
        public void Finish(string id, string state, WeaponSnapshot? after, string detail)
            => FinishRaw(id, state, after?.Canonical, detail, "v1");
        public string BeginAction(string action, string before, string detail)
        {
            Verify(); var id = Guid.NewGuid().ToString("N"); var pin = WeaponPath.PinDirectories(directory);
            try
            {
                var payload = "GEMS.WeaponAction.v2\nid=" + id + "\nphase=intent\naction=" + Convert.ToBase64String(Encoding.UTF8.GetBytes(action)) + "\nbefore=" + Convert.ToBase64String(Encoding.UTF8.GetBytes(before)) + "\ndetail=" + Convert.ToBase64String(Encoding.UTF8.GetBytes(detail)) + "\n";
                var stream = WriteNew(id + ".intent", Bytes(payload)); held.Add(id, stream); heldVersions.Add(id, "v2"); pins.Add(id, pin); UnconfirmedCount++; return id;
            }
            catch { pin.Dispose(); throw; }
        }
        public void FinishAction(string id, string state, string? after, string detail) => FinishRaw(id, state, after, detail, "v2");
        private void FinishRaw(string id, string state, string? after, string detail, string version)
        {
            if (!held.ContainsKey(id)) throw new InvalidOperationException("没有本实例已固定的动作意图，禁止伪造完成。");
            try
            {
                if (heldVersions[id] != version) throw new InvalidOperationException("不能用另一版本结果完成此意图。");
                Hook?.Invoke("before-result");
                var bytes = Bytes("GEMS.WeaponAction." + version + "\nid=" + id + "\nphase=result\nstate=" + state + "\nafter=" + Convert.ToBase64String(Encoding.UTF8.GetBytes(after ?? "unavailable")) + "\ndetail=" + Convert.ToBase64String(Encoding.UTF8.GetBytes(detail)) + "\n");
                using (WriteNew(id + ".result", bytes)) { }
                if (state != "unknown-partial") UnconfirmedCount = Math.Max(0, UnconfirmedCount - 1);
            }
            finally { held[id].Dispose(); held.Remove(id); heldVersions.Remove(id); pins[id].Dispose(); pins.Remove(id); }
        }
    }
}
