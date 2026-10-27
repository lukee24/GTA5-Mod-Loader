using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text.RegularExpressions;

namespace Gems.GameAssistant
{
    [DataContract]
    public sealed class BridgeCatalog
    {
        [DataMember(Name = "schemaVersion", IsRequired = true)] public int SchemaVersion { get; set; }
        [DataMember(Name = "revision", IsRequired = true)] public string Revision { get; set; } = "";
        [DataMember(Name = "vehicles", IsRequired = true)] public List<BridgeVehicle> Vehicles { get; set; } = new List<BridgeVehicle>();

        public static BridgeCatalog Read(string path)
        {
            RejectLinks(path);
            var info = new FileInfo(path);
            if (!info.Exists) return new BridgeCatalog { SchemaVersion = 1, Revision = "empty" };
            if (info.Length > 2 * 1024 * 1024) throw new InvalidDataException("车辆目录超过 2 MB 上限。");
            // Atomic rename by the publisher keeps readers on one complete revision.
            using (var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read | FileShare.Delete))
            {
                if (stream.Length > 2 * 1024 * 1024) throw new InvalidDataException("车辆目录超过大小限制。");
                var reader = new DataContractJsonSerializer(typeof(BridgeCatalog));
                var catalog = reader.ReadObject(stream) as BridgeCatalog ?? throw new InvalidDataException("无法读取车辆目录。");
                if (catalog.SchemaVersion != 1) throw new InvalidDataException("车辆目录版本不受支持。");
                if (catalog.Revision == null || catalog.Revision.Length > 128) throw new InvalidDataException("车辆目录修订号无效。");
                if (catalog.Vehicles == null || catalog.Vehicles.Count > 2000) throw new InvalidDataException("车辆目录项目超过上限。");
                var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                foreach (var item in catalog.Vehicles)
                {
                    if (item == null || !IsSpawnName(item.SpawnName)) throw new InvalidDataException("车辆生成名称无效。");
                    if (string.IsNullOrWhiteSpace(item.Id) || item.Id.Length > 145 || string.IsNullOrWhiteSpace(item.Name) || item.Name.Length > 300)
                        throw new InvalidDataException("车辆名称或标识无效。");
                    if (item.Brand != null && item.Brand.Length > 80) throw new InvalidDataException("车辆品牌过长。");
                    if (!names.Add(item.SpawnName)) throw new InvalidDataException("车辆生成名称重复。");
                }
                catalog.Vehicles = catalog.Vehicles.Where(v => v.Enabled && v.InstallState == "installed").ToList();
                return catalog;
            }
        }

        public static bool IsSpawnName(string? value) => value != null && Regex.IsMatch(value, "\\A[A-Za-z0-9_]{1,64}\\z", RegexOptions.CultureInvariant);

        public static void RejectLinks(string path)
        {
            var absolute = Path.GetFullPath(path);
            var current = absolute;
            while (!string.IsNullOrEmpty(current))
            {
                if ((File.Exists(current) || Directory.Exists(current)) && (File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0)
                    throw new InvalidDataException("桥接目录禁止符号链接和联接点。");
                current = Path.GetDirectoryName(current);
            }
        }
    }

    [DataContract]
    public sealed class BridgeVehicle
    {
        [DataMember(Name = "id", IsRequired = true)] public string Id { get; set; } = "";
        [DataMember(Name = "name", IsRequired = true)] public string Name { get; set; } = "";
        [DataMember(Name = "brand")] public string Brand { get; set; } = "";
        [DataMember(Name = "spawnName", IsRequired = true)] public string SpawnName { get; set; } = "";
        [DataMember(Name = "dlcName")] public string DlcName { get; set; } = "";
        [DataMember(Name = "enabled", IsRequired = true)] public bool Enabled { get; set; }
        [DataMember(Name = "installState", IsRequired = true)] public string InstallState { get; set; } = "";
        [DataMember(Name = "requiresGameRestart")] public bool RequiresGameRestart { get; set; }
    }
}
