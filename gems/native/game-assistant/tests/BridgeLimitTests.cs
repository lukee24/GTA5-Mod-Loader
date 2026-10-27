using Gems.GameAssistant;
using System.Text.Json;

public static class BridgeLimitTests
{
    public static void Run(Action<bool, string> check)
    {
        var root = Path.Combine(Path.GetTempPath(), "gems-bridge-limits-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root); var path = Path.Combine(root, "catalog.json");
        object Entry(string name, string id, string spawn = "fixture", bool enabled = true, string state = "installed")
            => new { id, name, spawnName = spawn, enabled, installState = state };
        void Save(params object[] entries) => File.WriteAllText(path, JsonSerializer.Serialize(new { schemaVersion = 1, revision = "stage3-limits", vehicles = entries }));
        void Reject(string name)
        {
            var rejected = false;
            try { BridgeCatalog.Read(path); } catch (InvalidDataException) { rejected = true; }
            check(rejected, "目录契约：" + name);
        }
        try
        {
            var maximumId = new string('m', 80) + ":" + new string('s', 64); var maximumName = new string('车', 300);
            Save(Entry(maximumName, maximumId, new string('s', 64)));
            var actual = BridgeCatalog.Read(path);
            check(actual.Vehicles.Count == 1 && actual.Vehicles[0].Name == maximumName && actual.Vehicles[0].Id == maximumId,
                "目录契约：300字中文名称、145位组合标识、64位生成名实际reader无损接受");
            Save(Entry(new string('车', 301), maximumId)); Reject("301位名称拒绝");
            Save(Entry(maximumName, maximumId + "x")); Reject("146位标识拒绝");
            Save(Entry("A", "first", "shared"), Entry("B", "second", "SHARED")); Reject("跨包大小写重复仍拒绝");
            Save(Enumerable.Range(0, 2001).Select(i => Entry("车", "id" + i, "car" + i)).ToArray()); Reject("2001项仍拒绝");
            File.WriteAllText(path, new string('x', 2 * 1024 * 1024 + 1)); Reject("超过2MiB仍拒绝");
            Save(Entry(maximumName, maximumId, "prepared", false, "prepared"));
            check(BridgeCatalog.Read(path).Vehicles.Count == 0, "目录契约：最大合法字段不提升未安装/未启用状态");
            Save(Entry(new string('车', 161), "valid", "car"));
            check(BridgeCatalog.Read(path).Vehicles[0].Name.Length == 161, "目录契约：桌面161字合法名称不再被旧160上限拒绝");
        }
        finally { File.Delete(path); Directory.Delete(root); }
    }
}
