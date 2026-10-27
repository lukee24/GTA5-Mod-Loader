using Gems.GameAssistant;
using System.Text;

var fixture = Path.Combine(AppContext.BaseDirectory, "fixtures");
Directory.CreateDirectory(fixture);
var catalogPath = Path.Combine(fixture, "catalog.json");
var passed = 0;
void Check(bool condition, string name) { if (!condition) throw new Exception("测试失败：" + name); passed++; Console.WriteLine("通过：" + name); }
void Reject(string json, string name)
{
    File.WriteAllText(catalogPath, json, Encoding.UTF8);
    try { BridgeCatalog.Read(catalogPath); throw new Exception("测试失败：未拒绝 " + name); }
    catch (System.Runtime.Serialization.SerializationException) { Check(true, name); }
    catch (InvalidDataException) { Check(true, name); }
}
string Vehicle(string name, bool enabled = true, string state = "installed") => "{\"id\":\"mod-1\",\"name\":\"中文车辆\",\"spawnName\":\"" + name + "\",\"enabled\":" + enabled.ToString().ToLowerInvariant() + ",\"installState\":\"" + state + "\"}";
string Catalog(string items, int version = 1) => "{\"schemaVersion\":" + version + ",\"revision\":\"test-1\",\"vehicles\":[" + items + "]}";
Check(BridgeCatalog.Read(Path.Combine(fixture, "absent.json")).Vehicles.Count == 0, "不存在目录返回真实空数据");
File.WriteAllText(catalogPath, Catalog(Vehicle("s500")));
Check(BridgeCatalog.Read(catalogPath).Vehicles.Single().Name == "中文车辆", "读取中文车辆目录");
File.WriteAllText(catalogPath, Catalog(Vehicle("disabled", false) + "," + Vehicle("prepared", true, "prepared") + "," + Vehicle("enabled")));
Check(BridgeCatalog.Read(catalogPath).Vehicles.Select(v => v.SpawnName).SequenceEqual(new[] { "enabled" }), "不显示停用及未注册 DLC");
Reject(Catalog(Vehicle("car"), 2), "未知协议版本");
Reject(Catalog(Vehicle("../escape")), "生成名称路径穿越");
Reject(Catalog(Vehicle("car\\n")), "生成名称换行注入");
Reject(Catalog(Vehicle("car") + "," + Vehicle("CAR")), "大小写重复生成名称");
Reject("{\"schemaVersion\":1,\"revision\":\"x\",\"vehicles\":null}", "空车辆集合");
Reject("{\"schemaVersion\":1,\"vehicles\":[]}", "缺少必填修订号");
Reject(Catalog(string.Join(",", Enumerable.Range(0, 2001).Select(i => Vehicle("car" + i)))), "超量车辆目录");
File.WriteAllText(catalogPath, new string('x', 2 * 1024 * 1024 + 1));
try { BridgeCatalog.Read(catalogPath); throw new Exception("未拒绝过大文件"); } catch (InvalidDataException) { Check(true, "超过 2 MB 文件"); }
for (var bits = 0; bits < 64; bits++)
{
    var enhanced = (bits & 1) != 0; var network = (bits & 2) != 0; var active = (bits & 4) != 0; var started = (bits & 8) != 0; var loading = (bits & 16) != 0; var player = (bits & 32) != 0;
    Check(StoryGuard.Allows(enhanced, network, active, started, loading, player) == (bits == 33), "故事模式守卫组合 " + bits);
}
var link = Path.Combine(fixture, "linked");
var target = Path.Combine(fixture, "target");
Directory.CreateDirectory(target);
try
{
    if (!Directory.Exists(link)) Directory.CreateSymbolicLink(link, target);
    try { BridgeCatalog.Read(Path.Combine(link, "catalog.json")); throw new Exception("未拒绝符号链接"); } catch (InvalidDataException) { Check(true, "桥接拒绝祖先目录符号链接"); }
}
catch (UnauthorizedAccessException) { Console.WriteLine("未执行：符号链接测试需要 Windows 开发者模式或权限。"); }
catch (IOException exception) when (exception.HResult == unchecked((int)0x80070522)) { Console.WriteLine("未执行：创建符号链接缺少 Windows 特权，可使用目录联接点执行此检查。"); }
Console.WriteLine("原有检查完成：" + passed + " 项；历史 0.1.78 证据保持原档。");
FoundationTests.Run(Check);
PlayerTests.Run(Check);
PlayerMotionTests.Run(Check);
VehicleTests.Run(Check);
VehicleInputTests.Run(Check);
FavoriteTests.Run(Check);
BridgeLimitTests.Run(Check);
WorldTests.Run(Check);
SpawnCompletionTests.Run(Check);
Console.WriteLine("完成：" + passed + " 项检查通过；此测试未调用游戏接口，也不代表游戏内实测。");
