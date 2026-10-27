using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace Gems.GameAssistant
{
    // A separate strict packet. Parsed declarations and file hashes do not prove model loading.
    public sealed class PedCatalog
    {
        public const string FileName="ped-catalog-v1.json";public const int MaxBytes=2*1024*1024;
        public readonly string Revision,ContentDigest,GameRoot,GameRootId;
        public readonly IReadOnlyList<PedCatalogEntry> Peds;public readonly IReadOnlyList<string> Issues;
        private PedCatalog(Dictionary<string,object?> root,string digest)
        {
            Revision=WeaponJson.Hex(root["revision"],64);ContentDigest=digest;GameRoot=WeaponJson.Text(root["gameRoot"],32768);
            if(WeaponGameIdentity.CanonicalGameRoot(GameRoot)!=GameRoot)throw WeaponJson.Bad("人物根路径未规范化。");
            GameRootId=WeaponJson.Hex(root["gameRootId"],64);if(WeaponGameIdentity.GameRootId(GameRoot)!=GameRootId)throw WeaponJson.Bad("人物根身份摘要不匹配。");
            var ids=new HashSet<string>(StringComparer.Ordinal);var names=new HashSet<string>(StringComparer.OrdinalIgnoreCase);var hashes=new HashSet<string>();var peds=new List<PedCatalogEntry>();var dependencies=0;
            foreach(var raw in WeaponJson.Array(root["peds"],2000)){var row=new PedCatalogEntry(raw);if(!ids.Add(row.Id)||!names.Add(row.ModelName)||!hashes.Add(row.Hash))throw WeaponJson.Bad("人物标识/名称/hash重复。");dependencies+=row.DependencyRefs.Count;if(dependencies>20000)throw WeaponJson.Bad("人物依赖总量超过20000。");peds.Add(row);}
            Peds=peds.AsReadOnly();Issues=WeaponJson.Strings(root["issues"],2000,8192);
        }
        public static PedCatalog Read(string path)
        {
            var bytes=WeaponPath.ReadFile(path,MaxBytes);var text=new UTF8Encoding(false,true).GetString(bytes);
            var root=WeaponJson.Object(new WeaponJson(text).Parse(),"schemaVersion","component","protocol","revision","gameRoot","gameRootId","targetGame","requiresGameRestart","peds","issues");
            if(WeaponJson.Integer(root["schemaVersion"],1)!=1||!Equals(root["component"],"GEMS.PedCatalog")||!Equals(root["protocol"],"gems.ped-catalog.v1")||!Equals(root["targetGame"],"enhanced")||!Equals(root["requiresGameRestart"],true))throw WeaponJson.Bad("人物目录协议/目标/重启声明错误。");
            return new PedCatalog(root,WeaponGameIdentity.Digest(bytes));
        }
    }
    public sealed class PedCatalogEntry
    {
        public readonly string Id,ModId,Name,ModelName,Hash,Kind,FileState,Registration,Dependencies;
        public readonly string? ParsedPedType,TransactionId;public readonly bool DesktopFavorite;
        public readonly IReadOnlyList<PedCatalogEvidence> Evidence;public readonly IReadOnlyList<PedCatalogDependency> DependencyRefs;
        public readonly IReadOnlyList<string> UserTags,Issues;
        internal PedCatalogEntry(object? raw)
        {
            var v=WeaponJson.Object(raw,"id","modId","name","modelName","hash","kind","parsedPedType","dependencyRefs","evidence","transactionId","fileState","registration","dependencies","desktopFavorite","userTags","issues");
            Id=WeaponJson.Hex(v["id"],64);ModId=WeaponJson.Id(v["modId"]);Name=WeaponJson.Text(v["name"],300);ModelName=WeaponJson.Token(v["modelName"]);Hash=WeaponJson.Hex(v["hash"],8);
            if(GTA.StringHash.AtStringHashUtf8(ModelName,0).ToString("x8",CultureInfo.InvariantCulture)!=Hash)throw WeaponJson.Bad("人物名称/hash不匹配。");
            Kind=WeaponJson.Choice(v["kind"],"addon","npc-replace","protagonist-replace","unknown");ParsedPedType=v["parsedPedType"]==null?null:WeaponJson.Token(v["parsedPedType"]);
            var evidence=WeaponJson.Array(v["evidence"],32);if(evidence.Count==0)throw WeaponJson.Bad("人物来源为空。");Evidence=evidence.Select(e=>new PedCatalogEvidence(e)).ToList().AsReadOnly();
            var deps=WeaponJson.Array(v["dependencyRefs"],96).Select(d=>new PedCatalogDependency(d)).ToArray();if(deps.Select(d=>d.Kind+"\n"+d.Identifier).Distinct(StringComparer.Ordinal).Count()!=deps.Length)throw WeaponJson.Bad("人物依赖重复。");DependencyRefs=Array.AsReadOnly(deps);
            TransactionId=v["transactionId"]==null?null:WeaponJson.Id(v["transactionId"]);FileState=WeaponJson.Choice(v["fileState"],"verified","disabled","uninstalled","pending","missing","changed","shadowed","unverified");if(FileState=="verified"&&TransactionId==null)throw WeaponJson.Bad("人物已核验行缺事务。");
            Registration=WeaponJson.Choice(v["registration"],"unknown","not-registered");Dependencies=WeaponJson.Choice(v["dependencies"],"unknown","missing","declared-only");if(!(v["desktopFavorite"] is bool))throw WeaponJson.Bad("人物收藏不是布尔值。");DesktopFavorite=(bool)v["desktopFavorite"]!;
            UserTags=WeaponJson.Strings(v["userTags"],4,16);if(UserTags.Any(t=>!new[]{"military","police","civilian","animal"}.Contains(t))||UserTags.Distinct().Count()!=UserTags.Count)throw WeaponJson.Bad("人物分类无效或重复。");Issues=WeaponJson.Strings(v["issues"],64,8192);
        }
    }
    public sealed class PedCatalogEvidence
    {
        public readonly string Kind,SourcePath,SourceSha256,Locator;public readonly long SourceBytes;
        internal PedCatalogEvidence(object? raw){var v=WeaponJson.Object(raw,"kind","sourcePath","sourceSha256","sourceBytes","locator");Kind=WeaponJson.Choice(v["kind"],"peds-meta","manifest-declaration");SourcePath=SafeRelative(v["sourcePath"]);SourceSha256=WeaponJson.Hex(v["sourceSha256"],64);SourceBytes=WeaponJson.Integer(v["sourceBytes"],20L*1024*1024*1024);Locator=WeaponJson.Text(v["locator"],512);}
        internal static string SafeRelative(object? raw){var value=WeaponJson.Text(raw,4096);if(value.Contains('\\')||value.Split('/').Any(p=>p.Length==0||p=="."||p==".."||Regex.IsMatch(p,"[<>:\"|?*]|[ .]$|\\A(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\\.|$)",RegexOptions.IgnoreCase|RegexOptions.CultureInvariant)))throw WeaponJson.Bad("人物来源路径越界或不安全。");return value;}
    }
    public sealed class PedCatalogDependency
    {
        public readonly string Kind,Identifier,Origin,Required;
        internal PedCatalogDependency(object? raw){var v=WeaponJson.Object(raw,"kind","identifier","origin","required");Kind=WeaponJson.Choice(v["kind"],"props","clip-dictionary","expression-dictionary","creature-metadata","movement-clip-set","dlc","runtime","file");var parsed=Kind!="dlc"&&Kind!="runtime"&&Kind!="file";Identifier=Kind=="file"?PedCatalogEvidence.SafeRelative(v["identifier"]):WeaponJson.Text(v["identifier"],128);Origin=WeaponJson.Choice(v["origin"],parsed?"parsed-reference":"manifest-declaration");Required=WeaponJson.Choice(v["required"],parsed?"unknown":"declared");}
    }
}
