using System;
using System.Globalization;
using System.Linq;

namespace Gems.GameAssistant
{
    public sealed class WeaponCatalogBridge
    {
        private readonly string path;
        private readonly WeaponGameIdentity identity;
        public WeaponChoice[] Choices { get; private set; } = new WeaponChoice[0];
        public string Status { get; private set; } = "尚未读取独立武器目录。";
        public string Detail { get; private set; } = "";
        public WeaponCatalogBridge(string path, WeaponGameIdentity identity) { this.path = path; this.identity = identity; }
        private static string Token(WeaponCatalog catalog, WeaponCatalogEntry entry) => catalog.Revision + ":" + catalog.ContentDigest + ":" + entry.Id;
        private static string Rejection(WeaponCatalogEntry row)
        {
            if (row.FileState != "verified" || row.TransactionId == null) return "文件当前未核验或未关联安装事务";
            if (row.Registration == "not-registered") return "已明确未注册";
            if (row.Dependencies == "missing") return "已报告缺少依赖";
            return "";
        }
        public void Refresh()
        {
            Choices = new WeaponChoice[0];
            try
            {
                var catalog = WeaponCatalog.Read(path); var matched = identity.Match(catalog, out var reason);
                Choices = catalog.Weapons.Select(row => new WeaponChoice {
                    Hash = uint.Parse(row.Hash, NumberStyles.HexNumber, CultureInfo.InvariantCulture),
                    Name = row.Name, Source = "catalog", SourceId = row.Id, SourceToken = Token(catalog, row),
                    SourceAllowed = matched && Rejection(row) == "",
                    Warning = !matched ? reason : Rejection(row) != "" ? Rejection(row) : "注册/依赖尚未验证；需实际运行定义与资源匹配，效果未实测。"
                }).ToArray();
                Status = matched ? "目录根匹配；注册未知，必须再核运行定义。" : "目录根未绑定；目录动作禁止。";
                Detail = reason + "\n" + string.Join("\n", catalog.Issues) + "\n" + string.Join("\n", catalog.Weapons.SelectMany(w => w.Issues));
            }
            catch (Exception error) { Status = "武器目录读取失败；库存与运行定义仍可单独读取。"; Detail = error.ToString(); }
        }
        public void Validate(WeaponChoice choice, WeaponDefinition[] runtime)
        {
            if (choice.Source == "catalog")
            {
                var packet = WeaponCatalog.Read(path);
                if (!identity.Match(packet, out var reason)) throw new InvalidOperationException(reason);
                var row = packet.Weapons.SingleOrDefault(w => w.Id == choice.SourceId);
                if (row == null || Token(packet, row) != choice.SourceToken || uint.Parse(row.Hash, NumberStyles.HexNumber, CultureInfo.InvariantCulture) != choice.Hash)
                    throw new InvalidOperationException("目录修订或字节内容已变化；必须重新选择并预览。");
                var rejection = Rejection(row); if (rejection.Length != 0) throw new InvalidOperationException(rejection);
            }
            else if (choice.Source != "runtime") throw new InvalidOperationException("未知武器来源。");
            if (!runtime.Any(d => d.Hash == choice.Hash && d.Valid)) throw new InvalidOperationException("当前运行定义与来源 hash 不匹配。");
        }
    }
}
