using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Win32.SafeHandles;

namespace Gems.GameAssistant
{
    public sealed class InputProfileSnapshot
    {
        public InputProfile Profile = InputProfile.Defaults();
        public string Revision = "empty";
        public InputProfile? Previous;
    }

    public sealed class InputProfileStoreException : IOException
    {
        // A caller must refresh instead of claiming rollback when publication cannot be verified.
        public bool OutcomeUnknown { get; }
        public string AttemptedRevision { get; }
        public InputProfileStoreException(string message, bool outcomeUnknown, string attemptedRevision, Exception inner)
            : base(message, inner) { OutcomeUnknown = outcomeUnknown; AttemptedRevision = attemptedRevision; }
    }

    public sealed class InputProfileRecoveryPlan
    {
        public InputProfileSnapshot LastTrusted { get; internal set; } = new InputProfileSnapshot();
        public string[] AffectedFiles { get; internal set; } = new string[0];
        public string Fingerprint { get; internal set; } = "";
        public bool Resuming { get; internal set; }
        internal InputProfileStore.RecoveryIntent Intent = new InputProfileStore.RecoveryIntent();
    }

    // Immutable, hash-addressed history. There is no mutable "current" pointer to tear or overwrite.
    public sealed class InputProfileStore
    {
        internal enum SavePoint { BeforePublish, AfterPublish }
        internal Action<SavePoint>? SaveHook { get; set; }
        internal enum RecoveryPoint { IntentPublished, AfterMove, Completed }
        internal Action<RecoveryPoint, int>? RecoveryHook { get; set; }
        private const int MaxRecords = 512, MaxBytes = 65536;
        private const string Prefix = "input-profile-", LockName = ".input-profile.lock";
        private readonly string directory;
        [DataContract]
        internal sealed class RecoveryEntry
        {
            [DataMember(IsRequired = true)] public string Name = "";
            [DataMember(IsRequired = true)] public string Hash = "";
            [DataMember(IsRequired = true)] public string Identity = "";
        }
        [DataContract]
        internal sealed class RecoveryIntent
        {
            [DataMember(IsRequired = true)] public int SchemaVersion = 1;
            [DataMember(IsRequired = true)] public string RecoveryDirectory = "";
            [DataMember(IsRequired = true)] public int KeptCount;
            [DataMember(IsRequired = true)] public string TrustedRevision = "empty";
            [DataMember(IsRequired = true)] public RecoveryEntry[] Entries = new RecoveryEntry[0];
        }
        private sealed class Captured : IDisposable
        {
            public readonly List<FileStream> Handles = new List<FileStream>();
            public readonly List<RecoveryEntry> Entries = new List<RecoveryEntry>();
            public readonly List<byte[]> Bytes = new List<byte[]>();
            public void Dispose() { foreach (var handle in Handles) handle.Dispose(); }
        }

        [DataContract]
        private sealed class Record
        {
            [DataMember(IsRequired = true)] public int SchemaVersion = 1;
            [DataMember(IsRequired = true)] public int Sequence;
            [DataMember(IsRequired = true)] public string ParentRevision = "";
            [DataMember(IsRequired = true)] public InputProfile Profile = InputProfile.Defaults();
        }
        private sealed class History : IDisposable
        {
            public readonly List<FileStream> Handles = new List<FileStream>();
            public readonly List<Record> Records = new List<Record>();
            public string Revision = "empty";
            public void Dispose() { foreach (var handle in Handles) handle.Dispose(); }
            public InputProfileSnapshot Snapshot() => new InputProfileSnapshot
            {
                Revision = Revision,
                Profile = Records.Count == 0 ? InputProfile.Defaults() : Records.Last().Profile.Copy(),
                Previous = Records.Count == 0 ? null : Records.Count == 1 ? InputProfile.Defaults() : Records[Records.Count - 2].Profile.Copy()
            };
        }

        public InputProfileStore(string directory)
        {
            if (string.IsNullOrWhiteSpace(directory)) throw new ArgumentException("映射目录不能为空。", nameof(directory));
            this.directory = Path.GetFullPath(directory).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            if (this.directory.Length <= (Path.GetPathRoot(this.directory) ?? "").TrimEnd('\\', '/').Length)
                throw new ArgumentException("映射目录不能是磁盘根目录。", nameof(directory));
        }

        public InputProfileSnapshot Read()
        {
            RejectLinks(directory);
            if (!Directory.Exists(directory))
            {
                if (File.Exists(directory)) throw new IOException("映射目录被文件占用。");
                return new InputProfileSnapshot();
            }
            using (var pins = PinDirectories(directory))
            using (var gate = OpenGate())
            { EnsureNoPendingRecovery(); using (var history = ReadHistory()) return history.Snapshot(); }
        }

        public InputProfileSnapshot Save(string expectedRevision, InputProfile profile)
        {
            if (expectedRevision == null) throw new ArgumentNullException(nameof(expectedRevision));
            if (profile == null) throw new ArgumentNullException(nameof(profile));
            profile.Validate(); var copy = profile.Copy(); copy.Validate();
            RejectLinks(directory);
            var parent = Path.GetDirectoryName(directory)!;
            if (!Directory.Exists(parent)) throw new DirectoryNotFoundException("映射目录的父目录不存在；未创建其他目录。");
            using (var parents = PinDirectories(parent))
            {
                RejectLinks(directory); Directory.CreateDirectory(directory);
                using (var pins = PinDirectories(directory))
                using (var gate = OpenGate())
                { EnsureNoPendingRecovery();
                using (var history = ReadHistory())
                {
                    if (history.Revision != expectedRevision) throw new InvalidDataException("映射已被其他操作更新，请重新读取后再保存。");
                    if (history.Records.Count >= MaxRecords) throw new InvalidDataException("映射历史达到 512 版上限；未删除任何历史。");
                    var record = new Record { Sequence = history.Records.Count + 1, ParentRevision = history.Revision, Profile = copy };
                    var bytes = Serialize(record); var revision = Hash(bytes);
                    var target = Path.Combine(directory, Filename(record.Sequence, revision));
                    var temporary = Path.Combine(directory, Prefix + "pending-" + Guid.NewGuid().ToString("N") + ".tmp");
                    var publicationAttempted = false;
                    try
                    {
                        using (var stream = CreateOwnedTemporary(temporary))
                        {
                            stream.Write(bytes, 0, bytes.Length); stream.Flush(true);
                            SaveHook?.Invoke(SavePoint.BeforePublish);
                            // Keep the original handle with no delete/write sharing through publication.
                            using (var current = ReadHistory())
                                if (current.Revision != history.Revision) throw new InvalidDataException("发布前映射历史发生变化；未发布新版本。");
                            publicationAttempted = true;
                            RenameOwned(stream.SafeFileHandle, target);
                        }
                        SaveHook?.Invoke(SavePoint.AfterPublish);
                        using (var committed = ReadHistory())
                        {
                            if (committed.Revision != revision) throw new InvalidDataException("发布后映射修订不一致。");
                            return committed.Snapshot();
                        }
                    }
                    catch (Exception error)
                    {
                        if (!publicationAttempted) throw;
                        try
                        {
                            using (var observed = ReadHistory())
                            {
                                if (observed.Revision == revision) return observed.Snapshot();
                                if (observed.Revision == history.Revision && !File.Exists(target))
                                    throw new InputProfileStoreException("映射未提交，原版本仍在。", false, revision, error);
                            }
                        }
                        catch (InputProfileStoreException) { throw; }
                        catch (Exception rereadError)
                        { throw new InputProfileStoreException("映射发布结果无法确认，请重新读取；不能视为已经回滚。", true, revision, new AggregateException(error, rereadError)); }
                        throw new InputProfileStoreException("映射发布结果存在并发歧义，请重新读取；未删除任何版本。", true, revision, error);
                    }
                    // Failed unpublished .tmp files are retained. A future operation never deletes
                    // a path merely because an earlier operation once created that name.
                }
                }
            }
        }

        public InputProfileRecoveryPlan PreviewRecovery()
        {
            RejectLinks(directory);
            using (var pins = PinDirectories(directory))
            using (var gate = OpenGate()) return BuildRecoveryPlan();
        }

        public InputProfileSnapshot Recover(InputProfileRecoveryPlan confirmedPlan)
        {
            if (confirmedPlan == null) throw new ArgumentNullException(nameof(confirmedPlan));
            using (var pins = PinDirectories(directory))
            using (var gate = OpenGate())
            {
                var fresh = BuildRecoveryPlan();
                if (fresh.Fingerprint != confirmedPlan.Fingerprint) throw new InvalidDataException("恢复预览后文件已变化，请重新预览并确认。");
                var intent = fresh.Intent; var started = false;
                try
                {
                    if (!fresh.Resuming)
                    {
                        intent.RecoveryDirectory = "recovery-" + Guid.NewGuid().ToString("N");
                        var recovery = Path.Combine(directory, intent.RecoveryDirectory); Directory.CreateDirectory(recovery);
                        using (var recoveryPins = PinDirectories(recovery))
                        using (var locked = CaptureIntent(intent))
                        { WriteNew(Path.Combine(recovery, "intent.json"), SerializeIntent(intent)); }
                    }
                    started = true;
                    var recoveryDirectory = Path.Combine(directory, intent.RecoveryDirectory);
                    using (var recoveryPins = PinDirectories(recoveryDirectory))
                    using (var manifest = new FileStream(Path.Combine(recoveryDirectory, "intent.json"), FileMode.Open, FileAccess.Read, FileShare.Read))
                    using (var locked = CaptureIntent(intent, true))
                    {
                        var intentBytes = ReadBounded(manifest, 262144);
                        if (Hash(intentBytes) != Hash(SerializeIntent(intent))) throw new InvalidDataException("恢复计划在执行前已改变；未移动记录。");
                        RecoveryHook?.Invoke(RecoveryPoint.IntentPublished, 0);
                        for (var i = intent.KeptCount; i < intent.Entries.Length; i++)
                        {
                            var original = Path.Combine(directory, intent.Entries[i].Name);
                            var preserved = Path.Combine(recoveryDirectory, intent.Entries[i].Name);
                            if (File.Exists(original)) RenameOwned(locked.Handles[i].SafeFileHandle, preserved);
                            RecoveryHook?.Invoke(RecoveryPoint.AfterMove, i - intent.KeptCount + 1);
                        }
                        using (var observed = CaptureIntent(intent)) { }
                        using (var history = ReadHistory(true))
                            if (history.Revision != intent.TrustedRevision) throw new InvalidDataException("恢复后的可信版本不一致。");
                        var marker = Encoding.UTF8.GetBytes(Hash(intentBytes));
                        WriteNew(Path.Combine(recoveryDirectory, "complete"), marker);
                        RecoveryHook?.Invoke(RecoveryPoint.Completed, intent.Entries.Length - intent.KeptCount);
                    }
                    EnsureNoPendingRecovery(); using (var history = ReadHistory()) return history.Snapshot();
                }
                catch (Exception error)
                {
                    // A successful final marker and matching current history are authoritative even
                    // if the final acknowledgement failed. Otherwise the durable intent is resumable.
                    if (started)
                    {
                        try
                        {
                            EnsureNoPendingRecovery(); using (var history = ReadHistory())
                                if (history.Revision == intent.TrustedRevision) return history.Snapshot();
                        }
                        catch { }
                        throw new InputProfileStoreException("恢复尚未确认完成；文件已保留，请重新预览后继续恢复。", true, intent.TrustedRevision, error);
                    }
                    throw;
                }
            }
        }

        private static bool IsPublishedCandidate(string path) => Path.GetFileName(path).StartsWith(Prefix, StringComparison.OrdinalIgnoreCase)
            && !(Path.GetFileName(path).StartsWith(Prefix + "pending-", StringComparison.OrdinalIgnoreCase) && path.EndsWith(".tmp", StringComparison.OrdinalIgnoreCase));
        private string[] PublishedFiles() => Directory.EnumerateFileSystemEntries(directory)
            .Where(IsPublishedCandidate)
            .Take(MaxRecords + 1).OrderBy(p => p, StringComparer.Ordinal).ToArray();
        private string[] PendingRecoveries()
        {
            var pending = new List<string>();
            var recoveries = Directory.EnumerateFileSystemEntries(directory, "recovery-*").Take(513).ToArray();
            if (recoveries.Length > 512) throw new InvalidDataException("恢复目录超过 512 个上限；未忽略后续记录。");
            foreach (var recovery in recoveries)
            {
                RejectLinks(recovery); if (!Directory.Exists(recovery)) throw new InvalidDataException("恢复记录目录异常。");
                var intent = Path.Combine(recovery, "intent.json"); var complete = Path.Combine(recovery, "complete");
                RejectLinks(intent); RejectLinks(complete);
                if (!File.Exists(intent))
                { if (Directory.EnumerateFileSystemEntries(recovery).Any(p => !p.EndsWith(".tmp", StringComparison.Ordinal))) throw new InvalidDataException("恢复目录缺少计划；未忽略已有文件。"); continue; }
                if (File.Exists(complete))
                {
                    var bytes = ReadBounded(intent, 262144);
                    if (Encoding.UTF8.GetString(ReadBounded(complete, 64)) != Hash(bytes)) throw new InvalidDataException("恢复完成记录与计划不一致。");
                }
                else pending.Add(recovery);
            }
            if (pending.Count > 1) throw new InvalidDataException("发现多个未完成恢复，无法自动判断顺序。");
            return pending.ToArray();
        }
        private void EnsureNoPendingRecovery()
        { if (PendingRecoveries().Length != 0) throw new InvalidDataException("存在未完成的映射恢复，请先预览并确认继续；未加载部分恢复结果。"); }
        private InputProfileRecoveryPlan BuildRecoveryPlan()
        {
            var pending = PendingRecoveries();
            if (pending.Length != 0)
            {
                var bytes = ReadBounded(Path.Combine(pending[0], "intent.json"), 262144);
                RecoveryIntent intent;
                using (var memory = new MemoryStream(bytes, false)) intent = (RecoveryIntent)new DataContractJsonSerializer(typeof(RecoveryIntent)).ReadObject(memory)!;
                ValidateIntent(intent);
                if (intent.RecoveryDirectory != Path.GetFileName(pending[0])) throw new InvalidDataException("恢复计划位置不符。");
                using (var capture = CaptureIntent(intent)) return RecoveryPlan(intent, capture, true);
            }
            using (var capture = CaptureFiles(PublishedFiles(), false))
            {
                var kept = 0; var revision = "empty";
                for (var i = 0; i < capture.Entries.Count; i++)
                {
                    var entry = capture.Entries[i];
                    // A fork must quarantine both competing versions, not choose by filename order.
                    var sequencePrefix = Prefix + (i + 1).ToString("D8", System.Globalization.CultureInfo.InvariantCulture) + "-";
                    if (capture.Entries.Count(e => e.Name.StartsWith(sequencePrefix, StringComparison.Ordinal)) != 1) break;
                    try { var record = Parse(capture.Bytes[i], entry.Name, i + 1, revision); revision = entry.Hash; kept++; }
                    catch (Exception error) when (error is SerializationException || error is InvalidDataException || error is System.Xml.XmlException || error is ArgumentException) { break; }
                }
                if (kept == capture.Entries.Count) throw new InvalidOperationException("映射历史完整，无需恢复。");
                var intent = new RecoveryIntent { KeptCount = kept, TrustedRevision = revision, Entries = capture.Entries.ToArray() };
                return RecoveryPlan(intent, capture, false);
            }
        }
        private static InputProfileRecoveryPlan RecoveryPlan(RecoveryIntent intent, Captured capture, bool resuming)
        {
            var snapshot = new InputProfileSnapshot(); var revision = "empty"; InputProfile? previous = null;
            for (var i = 0; i < intent.KeptCount; i++)
            {
                var record = Parse(capture.Bytes[i], capture.Entries[i].Name, i + 1, revision);
                previous = snapshot.Profile.Copy(); snapshot.Profile = record.Profile.Copy(); revision = capture.Entries[i].Hash;
            }
            if (revision != intent.TrustedRevision) throw new InvalidDataException("恢复计划的可信历史不一致。");
            snapshot.Revision = revision; snapshot.Previous = previous;
            return new InputProfileRecoveryPlan { Intent = intent, Fingerprint = Hash(SerializeIntent(intent)), LastTrusted = snapshot, AffectedFiles = intent.Entries.Skip(intent.KeptCount).Select(e => e.Name).ToArray(), Resuming = resuming };
        }
        private Captured CaptureIntent(RecoveryIntent intent, bool forMoving = false)
        {
            ValidateIntent(intent);
            var actual = PublishedFiles().Select(Path.GetFileName).ToArray();
            if (actual.Any(name => !intent.Entries.Any(e => e.Name == name))) throw new InvalidDataException("恢复计划之外出现新映射，请重新检查。");
            var paths = new List<string>();
            for (var i = 0; i < intent.Entries.Length; i++)
            {
                var original = Path.Combine(directory, intent.Entries[i].Name);
                var preserved = Path.Combine(directory, intent.RecoveryDirectory, intent.Entries[i].Name);
                RejectLinks(original); RejectLinks(preserved);
                var exists = File.Exists(original); var moved = intent.RecoveryDirectory.Length != 0 && File.Exists(preserved);
                if (exists == moved || (i < intent.KeptCount && !exists)) throw new InvalidDataException("恢复文件缺失、重复或可信前缀被移动。");
                paths.Add(exists ? original : preserved);
            }
            var capture = CaptureFiles(paths.ToArray(), forMoving, true);
            for (var i = 0; i < intent.Entries.Length; i++)
                if (capture.Entries[i].Name != intent.Entries[i].Name || capture.Entries[i].Hash != intent.Entries[i].Hash || capture.Entries[i].Identity != intent.Entries[i].Identity)
                { capture.Dispose(); throw new InvalidDataException("恢复预览后文件内容或身份已变化；未继续移动。"); }
            return capture;
        }
        private static void ValidateIntent(RecoveryIntent intent)
        {
            if (intent == null || intent.SchemaVersion != 1 || intent.Entries == null || intent.Entries.Length == 0 || intent.Entries.Length > MaxRecords || intent.KeptCount < 0 || intent.KeptCount >= intent.Entries.Length
                || intent.RecoveryDirectory == null || (intent.RecoveryDirectory.Length != 0 && (!intent.RecoveryDirectory.StartsWith("recovery-", StringComparison.Ordinal) || !Guid.TryParseExact(intent.RecoveryDirectory.Substring(9), "N", out _)))) throw new InvalidDataException("恢复计划无效。");
            var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var entry in intent.Entries)
                if (entry == null || string.IsNullOrWhiteSpace(entry.Name) || Path.GetFileName(entry.Name) != entry.Name || entry.Name.IndexOfAny(new[] { '/', '\\', ':' }) >= 0 || !IsPublishedCandidate(entry.Name) || !names.Add(entry.Name) || entry.Hash == null || entry.Hash.Length != 64 || string.IsNullOrEmpty(entry.Identity)) throw new InvalidDataException("恢复计划文件条目无效。");
        }
        private static Captured CaptureFiles(string[] paths, bool allowMove, bool coexistWithDeleteHandle = false)
        {
            var capture = new Captured();
            try
            {
                if (paths.Length > MaxRecords) throw new InvalidDataException("恢复记录超过上限。");
                long totalBytes = 0;
                foreach (var path in paths)
                {
                    RejectLinks(path); FileStream stream;
                    if (allowMove)
                    {
                        var handle = CreateFile(NativePath(path), 0x80010000, 1, IntPtr.Zero, 3, 0x80, IntPtr.Zero);
                        if (handle.IsInvalid) { var error = Marshal.GetLastWin32Error(); handle.Dispose(); throw new IOException("无法固定待恢复文件。", new Win32Exception(error)); }
                        try { stream = new FileStream(handle, FileAccess.Read); } catch { handle.Dispose(); throw; }
                    }
                    else stream = new FileStream(path, FileMode.Open, FileAccess.Read, coexistWithDeleteHandle ? FileShare.Read | FileShare.Delete : FileShare.Read);
                    capture.Handles.Add(stream);
                    totalBytes = checked(totalBytes + stream.Length);
                    if (totalBytes > 16 * 1024 * 1024) throw new InvalidDataException("恢复记录合计超过 16 MB 安全读取上限。");
                    var bytes = ReadBounded(stream, 4 * 1024 * 1024);
                    if (!GetFileInformationByHandle(stream.SafeFileHandle, out var info)) throw new IOException("无法读取恢复文件身份。", new Win32Exception(Marshal.GetLastWin32Error()));
                    capture.Bytes.Add(bytes); capture.Entries.Add(new RecoveryEntry { Name = Path.GetFileName(path), Hash = Hash(bytes), Identity = info.VolumeSerialNumber.ToString("X8") + ":" + info.FileIndexHigh.ToString("X8") + info.FileIndexLow.ToString("X8") });
                }
                return capture;
            }
            catch { capture.Dispose(); throw; }
        }
        private static byte[] ReadBounded(string path, int limit)
        { RejectLinks(path); using (var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read)) return ReadBounded(stream, limit); }
        private static byte[] ReadBounded(FileStream stream, int limit)
        {
            if (stream.Length > limit) throw new InvalidDataException("恢复文件超过安全读取上限。");
            var bytes = new byte[checked((int)stream.Length)]; var offset = 0;
            while (offset < bytes.Length) { var count = stream.Read(bytes, offset, bytes.Length - offset); if (count == 0) throw new EndOfStreamException(); offset += count; }
            return bytes;
        }
        private static Record Parse(byte[] bytes, string name, int sequence, string parent)
        {
            if (bytes.Length == 0 || bytes.Length > MaxBytes) throw new InvalidDataException("映射快照大小无效。");
            Record? record; using (var memory = new MemoryStream(bytes, false)) record = (Record?)new DataContractJsonSerializer(typeof(Record)).ReadObject(memory);
            if (record == null || record.SchemaVersion != 1 || record.Sequence != sequence || record.ParentRevision != parent || record.Profile == null || Filename(sequence, Hash(bytes)) != name) throw new InvalidDataException("映射快照无效。");
            record.Profile.Validate(); return record;
        }
        private static byte[] SerializeIntent(RecoveryIntent intent)
        { using (var memory = new MemoryStream()) { new DataContractJsonSerializer(typeof(RecoveryIntent)).WriteObject(memory, intent); if (memory.Length > 262144) throw new InvalidDataException("恢复计划超过 256 KB 上限；未发布恢复计划。"); return memory.ToArray(); } }

        private FileStream OpenGate()
        {
            var path = Path.Combine(directory, LockName); RejectLinks(path);
            var stream = new FileStream(path, FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
            if (stream.Length == 0) return stream;
            stream.Dispose(); throw new InvalidDataException("映射锁文件内容异常；未覆盖已有文件。");
        }

        private History ReadHistory(bool coexistWithDeleteHandle = false)
        {
            var history = new History();
            try
            {
                RejectLinks(directory);
                var files = PublishedFiles();
                if (files.Length > MaxRecords) throw new InvalidDataException("映射历史超出大小限制。");
                foreach (var file in files)
                {
                    RejectLinks(file);
                    var stream = new FileStream(file, FileMode.Open, FileAccess.Read, coexistWithDeleteHandle ? FileShare.Read | FileShare.Delete : FileShare.Read); history.Handles.Add(stream);
                    if (stream.Length == 0 || stream.Length > MaxBytes) throw new InvalidDataException("映射快照大小无效。");
                    var bytes = new byte[checked((int)stream.Length)]; var offset = 0;
                    while (offset < bytes.Length) { var count = stream.Read(bytes, offset, bytes.Length - offset); if (count == 0) throw new EndOfStreamException("映射快照读取不完整。"); offset += count; }
                    var revision = Hash(bytes);
                    Record? record;
                    using (var memory = new MemoryStream(bytes, false)) record = (Record?)new DataContractJsonSerializer(typeof(Record)).ReadObject(memory);
                    if (record == null || record.SchemaVersion != 1 || record.Sequence != history.Records.Count + 1 || record.ParentRevision != history.Revision || record.Profile == null
                        || Filename(record.Sequence, revision) != Path.GetFileName(file)) throw new InvalidDataException("映射历史损坏、被改写或存在并发分支；未覆盖记录。");
                    record.Profile.Validate(); history.Records.Add(record); history.Revision = revision;
                }
                return history;
            }
            catch { history.Dispose(); throw; }
        }

        private static string Filename(int sequence, string revision) => Prefix + sequence.ToString("D8", System.Globalization.CultureInfo.InvariantCulture) + "-" + revision + ".json";
        private static byte[] Serialize(Record record)
        {
            using (var stream = new MemoryStream())
            { new DataContractJsonSerializer(typeof(Record)).WriteObject(stream, record); if (stream.Length > MaxBytes) throw new InvalidDataException("映射快照超过大小限制。"); return stream.ToArray(); }
        }
        private static string Hash(byte[] bytes)
        { using (var hash = SHA256.Create()) return BitConverter.ToString(hash.ComputeHash(bytes)).Replace("-", "").ToLowerInvariant(); }

        private static FileStream CreateOwnedTemporary(string path)
        {
            RejectLinks(path);
            var handle = CreateFile(NativePath(path), 0xC0010000, 1, IntPtr.Zero, 1, 0x80, IntPtr.Zero);
            if (handle.IsInvalid) { var error = Marshal.GetLastWin32Error(); handle.Dispose(); throw new IOException("无法创建映射临时文件。", new Win32Exception(error)); }
            try { return new FileStream(handle, FileAccess.ReadWrite); } catch { handle.Dispose(); throw; }
        }
        private static void RenameOwned(SafeFileHandle handle, string target)
        {
            var name = Encoding.Unicode.GetBytes(NativePath(target));
            var rootOffset = IntPtr.Size == 8 ? 8 : 4; var lengthOffset = rootOffset + IntPtr.Size; var nameOffset = lengthOffset + 4;
            // Win32 resolves the supplied path as UTF-16 before passing it to NT. Keep
            // an explicit NUL beyond FileNameLength; otherwise it may read allocator tail bytes.
            var size = nameOffset + name.Length + 2;
            var buffer = Marshal.AllocHGlobal(size);
            try
            {
                for (var i = 0; i < nameOffset; i++) Marshal.WriteByte(buffer, i, 0);
                Marshal.WriteInt32(buffer, lengthOffset, name.Length); Marshal.Copy(name, 0, IntPtr.Add(buffer, nameOffset), name.Length); Marshal.WriteInt16(buffer, nameOffset + name.Length, 0);
                if (!SetFileInformationByHandle(handle, 3, buffer, (uint)size)) throw new IOException("映射原子发布失败。", new Win32Exception(Marshal.GetLastWin32Error()));
            }
            finally { Marshal.FreeHGlobal(buffer); }
        }
        private static void WriteNew(string path, byte[] bytes)
        {
            using (var stream = CreateOwnedTemporary(path + "." + Guid.NewGuid().ToString("N") + ".tmp"))
            { stream.Write(bytes, 0, bytes.Length); stream.Flush(true); RenameOwned(stream.SafeFileHandle, path); }
        }
        private static string NativePath(string path)
        {
            var full = Path.GetFullPath(path);
            if (full.StartsWith("\\\\?\\", StringComparison.Ordinal)) return full;
            return full.StartsWith("\\\\", StringComparison.Ordinal) ? "\\\\?\\UNC\\" + full.Substring(2) : "\\\\?\\" + full;
        }

        private static void RejectLinks(string path)
        {
            for (var current = Path.GetFullPath(path); !string.IsNullOrEmpty(current); current = Path.GetDirectoryName(current))
            {
                try { if ((File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0) throw new InvalidDataException("映射存储禁止符号链接和联接点。"); }
                catch (FileNotFoundException) { } catch (DirectoryNotFoundException) { }
            }
        }

        // Windows directory handles without FILE_SHARE_DELETE pin every existing ancestor.
        // Verifying the resolved path closes a link-swap window between checking and opening.
        private sealed class DirectoryPins : IDisposable
        {
            public readonly List<SafeFileHandle> Handles = new List<SafeFileHandle>();
            public void Dispose() { foreach (var handle in Handles) handle.Dispose(); }
        }
        private static DirectoryPins PinDirectories(string path)
        {
            var pins = new DirectoryPins();
            try
            {
                var chain = new List<string>();
                for (var current = Path.GetFullPath(path); !string.IsNullOrEmpty(current); current = Path.GetDirectoryName(current)) chain.Add(current);
                chain.Reverse();
                foreach (var current in chain)
                {
                    RejectLinks(current);
                    var handle = CreateFile(NativePath(current), 0, 3, IntPtr.Zero, 3, 0x02000000, IntPtr.Zero);
                    if (handle.IsInvalid) { var error = Marshal.GetLastWin32Error(); handle.Dispose(); throw new IOException("无法固定映射目录。", new Win32Exception(error)); }
                    pins.Handles.Add(handle);
                    var resolved = new StringBuilder(32768); var length = GetFinalPathNameByHandle(handle, resolved, resolved.Capacity, 0);
                    if (length == 0 || length >= resolved.Capacity) throw new IOException("无法核对映射目录的实际路径。", new Win32Exception(Marshal.GetLastWin32Error()));
                    var value = resolved.ToString();
                    if (value.StartsWith("\\\\?\\UNC\\", StringComparison.Ordinal)) value = "\\\\" + value.Substring(8);
                    else if (value.StartsWith("\\\\?\\", StringComparison.Ordinal)) value = value.Substring(4);
                    if (!string.Equals(value.TrimEnd('\\', '/'), current.TrimEnd('\\', '/'), StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("映射目录的实际路径发生变化。");
                }
                return pins;
            }
            catch { pins.Dispose(); throw; }
        }
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern SafeFileHandle CreateFile(string name, uint access, uint share, IntPtr security, uint creation, uint flags, IntPtr template);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern uint GetFinalPathNameByHandle(SafeFileHandle handle, StringBuilder path, int capacity, uint flags);
        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool SetFileInformationByHandle(SafeFileHandle handle, int informationClass, IntPtr information, uint size);
        [StructLayout(LayoutKind.Sequential)]
        private struct FileInformation
        {
            public uint FileAttributes;
            public System.Runtime.InteropServices.ComTypes.FILETIME CreationTime, LastAccessTime, LastWriteTime;
            public uint VolumeSerialNumber, FileSizeHigh, FileSizeLow, NumberOfLinks, FileIndexHigh, FileIndexLow;
        }
        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool GetFileInformationByHandle(SafeFileHandle handle, out FileInformation information);
    }
}
