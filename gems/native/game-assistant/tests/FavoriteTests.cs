using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.Serialization;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using Gems.GameAssistant;

public static class FavoriteTests
{
    public static int Run(Action<bool, string> check, string? fixtureParent = null)
    {
        var passed = 0;
        void Check(bool condition, string name) { check(condition, "收藏：" + name); passed++; }
        void RejectHistory(Action action, string name)
        {
            try { action(); }
            catch (InvalidDataException) { Check(true, name); return; }
            catch (SerializationException) { Check(true, name); return; }
            Check(false, name);
        }
        void RejectAccess(Action action, string name)
        {
            try { action(); }
            catch (UnauthorizedAccessException) { Check(true, name); return; }
            catch (IOException) { Check(true, name); return; }
            Check(false, name);
        }
        var parent = Path.GetFullPath(fixtureParent ?? Path.Combine(AppContext.BaseDirectory, "fixtures"));
        var root = Path.GetFullPath(Path.Combine(parent, "favorite-" + Guid.NewGuid().ToString("N")));
        if (!root.StartsWith(parent.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("收藏测试目录越界");
        Directory.CreateDirectory(root);
        string Folder(string name) { var path = Path.Combine(root, name); Directory.CreateDirectory(path); return path; }
        string Json(int sequence, int hash, bool favorite, string id, int schema = 1)
            => "{\"SchemaVersion\":" + schema.ToString(CultureInfo.InvariantCulture) + ",\"ModelHash\":" + hash.ToString(CultureInfo.InvariantCulture)
                + ",\"Favorite\":" + (favorite ? "true" : "false") + ",\"Sequence\":" + sequence.ToString(CultureInfo.InvariantCulture) + ",\"Id\":\"" + id + "\"}";
        string Record(string folder, int sequence, int hash, bool favorite, string? id = null, int schema = 1)
        {
            id ??= Guid.NewGuid().ToString("N");
            var path = Path.Combine(folder, "favorite-" + sequence.ToString("D8", CultureInfo.InvariantCulture) + "-" + id + ".json");
            File.WriteAllText(path, Json(sequence, hash, favorite, id, schema), new UTF8Encoding(false));
            return path;
        }
        Dictionary<string, byte[]> Snapshot(string folder) => Directory.GetFiles(folder).ToDictionary(path => Path.GetFileName(path), File.ReadAllBytes);
        bool Unchanged(string folder, Dictionary<string, byte[]> snapshot) => snapshot.All(pair => File.Exists(Path.Combine(folder, pair.Key)) && File.ReadAllBytes(Path.Combine(folder, pair.Key)).SequenceEqual(pair.Value));

        try
        {
            var missing = Path.Combine(root, "尚未创建的 收藏目录");
            var store = new FavoriteStore(missing);
            Check(store.ReadModels().Length == 0 && !Directory.Exists(missing), "不存在目录读取为空且不创建目录");
            Check(store.Toggle(42) && Directory.Exists(missing), "首次收藏创建追加记录");
            var first = Snapshot(missing);
            Check(first.Count == 1 && store.ReadModels().SequenceEqual(new[] { 42 }), "第一次收藏可立即读取");
            Check(!store.Toggle(42) && store.ReadModels().Length == 0, "再次操作追加取消记录");
            Check(Directory.GetFiles(missing, "favorite-*.json").Length == 2 && Unchanged(missing, first), "取消收藏保留原记录的完整字节");
            var beforeReadd = Snapshot(missing);
            Check(new FavoriteStore(missing).Toggle(42) && new FavoriteStore(missing).ReadModels().SequenceEqual(new[] { 42 }), "新实例重读后可再次收藏");
            Check(Unchanged(missing, beforeReadd), "再次收藏不改写任一既有记录");
            var hashSet = new[] { 0, 1, int.MaxValue, int.MinValue, -1, -123456789 };
            foreach (var hash in hashSet) Check(store.Toggle(hash), "可收藏模型 hash " + hash);
            var expected = hashSet.Concat(new[] { 42 }).OrderBy(hash => unchecked((uint)hash)).ToArray();
            Check(new FavoriteStore(missing).ReadModels().SequenceEqual(expected), "正负 hash 均保持完整并按 uint 排序");
            var immutable = Snapshot(missing);
            foreach (var hash in new[] { int.MinValue, -1, 1 }) Check(!store.Toggle(hash), "可取消模型 hash " + hash);
            Check(Unchanged(missing, immutable), "多车型取消不修改先前记录");
            Check(new FavoriteStore(missing).ReadModels().SequenceEqual(expected.Where(hash => hash != int.MinValue && hash != -1 && hash != 1)), "重读准确反映不同车型最终状态");
            Check(!Directory.GetFiles(missing, "*.tmp").Any(), "成功操作不留下临时记录");

            var unrelated = Path.Combine(missing, "用户说明.txt");
            var abandoned = Path.Combine(missing, "favorite-未完成.json.tmp");
            File.WriteAllBytes(unrelated, new byte[] { 0, 1, 2, 255, 10 });
            File.WriteAllText(abandoned, "不属于已提交历史", Encoding.UTF8);
            var preserved = Snapshot(missing);
            store.Toggle(700);
            Check(Unchanged(missing, preserved), "普通用户文件与未提交 tmp 都原样保留");

            var corruptions = new Action<string, string>[]
            {
                (path, id) => File.WriteAllText(path, "{not-json"),
                (path, id) => File.WriteAllText(path, "{}"),
                (path, id) => File.WriteAllText(path, Json(1, 10, true, id, 2)),
                (path, id) => File.WriteAllText(path, Json(2, 10, true, id)),
                (path, id) => File.WriteAllText(path, Json(1, 10, true, "not-a-guid")),
                (path, id) => File.WriteAllText(path, new string(' ', 1025))
            };
            for (var index = 0; index < corruptions.Length; index++)
            {
                var folder = Folder("corrupt-" + index);
                var id = Guid.NewGuid().ToString("N");
                var path = Record(folder, 1, 10, true, id);
                corruptions[index](path, id);
                var before = Snapshot(folder);
                var corrupt = new FavoriteStore(folder);
                RejectHistory(() => corrupt.ReadModels(), "损坏/不兼容/超长历史拒绝读取 " + index);
                RejectHistory(() => corrupt.Toggle(20), "损坏历史拒绝追加且不重置 " + index);
                Check(Directory.GetFiles(folder).Length == before.Count && Unchanged(folder, before), "失败后保留损坏记录原字节 " + index);
            }

            var conflictingFolder = Folder("same-sequence");
            Record(conflictingFolder, 1, 100, true);
            Record(conflictingFolder, 1, 200, true);
            var conflictBefore = Snapshot(conflictingFolder);
            var conflict = new FavoriteStore(conflictingFolder);
            RejectHistory(() => conflict.ReadModels(), "不同 ID 使用同一序号时拒绝读取");
            RejectHistory(() => conflict.Toggle(300), "同序号冲突拒绝追加");
            Check(Directory.GetFiles(conflictingFolder).Length == 2 && Unchanged(conflictingFolder, conflictBefore), "冲突记录全部保留供诊断");

            var orderFolder = Folder("out-of-order");
            Record(orderFolder, 3, -9, true);
            Record(orderFolder, 1, -9, true);
            Record(orderFolder, 2, -9, false);
            var orderStore = new FavoriteStore(orderFolder);
            Check(orderStore.ReadModels().SequenceEqual(new[] { -9 }), "按记录序号重建状态而非文件枚举顺序");
            var orderBefore = Snapshot(orderFolder);
            Check(!orderStore.Toggle(-9) && Directory.GetFiles(orderFolder, "favorite-00000004-*.json").Length == 1 && Unchanged(orderFolder, orderBefore), "追加使用最高序号后一项且原记录不变");
            var maximumFolder = Folder("maximum-sequence");
            Record(maximumFolder, 1000000000, -99, true);
            var maximumBefore = Snapshot(maximumFolder);
            RejectHistory(() => new FavoriteStore(maximumFolder).Toggle(-99), "序号上限拒绝继续追加");
            Check(Unchanged(maximumFolder, maximumBefore) && Directory.GetFiles(maximumFolder).Length == 1, "序号达到上限不删除或重置历史");

            var lockedFolder = Folder("locked-record");
            var lockedRecord = Record(lockedFolder, 1, 77, true);
            var lockedBefore = Snapshot(lockedFolder);
            using (var locked = new FileStream(lockedRecord, FileMode.Open, FileAccess.ReadWrite, FileShare.None))
            {
                RejectAccess(() => new FavoriteStore(lockedFolder).ReadModels(), "独占占用的记录拒绝读取");
                RejectAccess(() => new FavoriteStore(lockedFolder).Toggle(88), "文件占用时拒绝追加");
            }
            Check(Unchanged(lockedFolder, lockedBefore) && Directory.GetFiles(lockedFolder).Length == 1, "占用失败后历史字节及数量不变");
            var blockingFile = Path.Combine(root, "directory-is-file");
            File.WriteAllText(blockingFile, "用户原有文件");
            var blockingBytes = File.ReadAllBytes(blockingFile);
            RejectAccess(() => new FavoriteStore(blockingFile).Toggle(1), "目标目录被文件占用时拒绝写入");
            Check(File.ReadAllBytes(blockingFile).SequenceEqual(blockingBytes), "不替换占位的用户文件");

            if (OperatingSystem.IsWindows())
            {
                var aclFolder = Folder("write-denied");
                Record(aclFolder, 1, 17, true);
                var aclBefore = Snapshot(aclFolder);
                var info = new DirectoryInfo(aclFolder);
                DirectorySecurity? originalAcl = null;
                var applied = false;
                try
                {
                    originalAcl = info.GetAccessControl(AccessControlSections.Access);
                    var altered = new DirectorySecurity();
                    altered.SetSecurityDescriptorBinaryForm(originalAcl.GetSecurityDescriptorBinaryForm());
                    var user = WindowsIdentity.GetCurrent().User ?? throw new InvalidOperationException("无当前 Windows 用户 SID");
                    altered.AddAccessRule(new FileSystemAccessRule(user, FileSystemRights.CreateFiles, InheritanceFlags.None, PropagationFlags.None, AccessControlType.Deny));
                    info.SetAccessControl(altered); applied = true;
                }
                catch (UnauthorizedAccessException) { Console.WriteLine("未执行：收藏 ACL 拒写夹具缺少 ACL 修改权限。"); }
                catch (PlatformNotSupportedException) { Console.WriteLine("未执行：当前环境不支持 Windows ACL 夹具。"); }
                try
                {
                    if (applied)
                    {
                        Check(new FavoriteStore(aclFolder).ReadModels().SequenceEqual(new[] { 17 }), "目录拒写仍能只读已有收藏");
                        RejectAccess(() => new FavoriteStore(aclFolder).Toggle(18), "无创建文件权限时追加明确失败");
                    }
                }
                finally { if (applied && originalAcl != null) info.SetAccessControl(originalAcl); }
                Check(Unchanged(aclFolder, aclBefore) && Directory.GetFiles(aclFolder).Length == 1, "拒写测试之后既有历史完整保留");
            }

            var linkTarget = Folder("link-target");
            var linkRecord = Record(linkTarget, 1, 999, true);
            var linkBefore = Snapshot(linkTarget);
            var linkedDirectory = Path.Combine(root, "linked-directory");
            try
            {
                Directory.CreateSymbolicLink(linkedDirectory, linkTarget);
                RejectHistory(() => new FavoriteStore(linkedDirectory).ReadModels(), "拒绝符号链接收藏目录");
                RejectHistory(() => new FavoriteStore(linkedDirectory).Toggle(1000), "符号链接目录不能追加记录");
            }
            catch (UnauthorizedAccessException) { Console.WriteLine("未执行：收藏目录符号链接检查需要 Windows 开发者模式或权限。"); }
            catch (IOException error) when (error.HResult == unchecked((int)0x80070522)) { Console.WriteLine("未执行：收藏目录符号链接夹具缺少创建特权。"); }
            finally { if (Directory.Exists(linkedDirectory)) Directory.Delete(linkedDirectory); }
            var linkedFileFolder = Folder("linked-file");
            var linkedFile = Path.Combine(linkedFileFolder, Path.GetFileName(linkRecord));
            try
            {
                File.CreateSymbolicLink(linkedFile, linkRecord);
                RejectHistory(() => new FavoriteStore(linkedFileFolder).ReadModels(), "拒绝符号链接收藏记录");
                RejectHistory(() => new FavoriteStore(linkedFileFolder).Toggle(1000), "符号链接记录不能被当作有效历史追加");
            }
            catch (UnauthorizedAccessException) { Console.WriteLine("未执行：收藏文件符号链接检查需要 Windows 开发者模式或权限。"); }
            catch (IOException error) when (error.HResult == unchecked((int)0x80070522)) { Console.WriteLine("未执行：收藏文件符号链接夹具缺少创建特权。"); }
            finally { if (File.Exists(linkedFile)) File.Delete(linkedFile); }
            Check(Unchanged(linkTarget, linkBefore) && Directory.GetFiles(linkTarget).Length == 1, "链接检查保留目标目录的原记录");
        }
        finally
        {
            // root was generated and checked beneath the dedicated fixture parent above.
            if (Directory.Exists(root)) Directory.Delete(root, true);
        }
        return passed;
    }
}
