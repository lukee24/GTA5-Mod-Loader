using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace Gems.GameAssistant
{
    // Derived metadata is not evidence of game registration or loading. Construction is reader-only.
    public sealed class WeaponCatalog
    {
        public const string FileName = "weapon-catalog-v1.json";
        public const int MaxBytes = 2 * 1024 * 1024;
        public int SchemaVersion => 1;
        public string Component => "GEMS.WeaponCatalog";
        public string Protocol => "gems.weapon-catalog.v1";
        public string Revision { get; }
        public string ContentDigest { get; }
        public string GameRoot { get; }
        public string GameRootId { get; }
        public string TargetGame => "enhanced";
        public bool RequiresGameRestart => true;
        public IReadOnlyList<WeaponCatalogEntry> Weapons { get; }
        public IReadOnlyList<string> Issues { get; }
        private WeaponCatalog(Dictionary<string, object?> root, string digest)
        {
            Revision = WeaponJson.Hex(root["revision"], 64); ContentDigest = digest;
            GameRoot = WeaponJson.Text(root["gameRoot"], 32768);
            if (WeaponGameIdentity.CanonicalGameRoot(GameRoot) != GameRoot) throw WeaponJson.Bad("游戏根目录不是规范形式。");
            GameRootId = WeaponJson.Hex(root["gameRootId"], 64);
            if (WeaponGameIdentity.GameRootId(GameRoot) != GameRootId) throw WeaponJson.Bad("游戏根目录摘要不匹配。");
            var rows = WeaponJson.Array(root["weapons"], 2000);
            var ids = new HashSet<string>(StringComparer.Ordinal);
            var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var hashes = new HashSet<string>(StringComparer.Ordinal);
            var weapons = new List<WeaponCatalogEntry>();
            foreach (var value in rows)
            {
                var item = new WeaponCatalogEntry(value);
                if (!ids.Add(item.Id) || !names.Add(item.WeaponName) || !hashes.Add(item.Hash)) throw WeaponJson.Bad("武器标识、名称或 hash 重复。");
                weapons.Add(item);
            }
            Weapons = weapons.AsReadOnly(); Issues = WeaponJson.Strings(root["issues"], 2000, 8192);
        }
        public static WeaponCatalog Read(string path)
        {
            // Missing, unreadable and obsolete input never becomes a fabricated trusted empty catalog.
            var bytes = WeaponPath.ReadFile(path, MaxBytes);
            string text;
            try { text = new UTF8Encoding(false, true).GetString(bytes); }
            catch (DecoderFallbackException error) { throw new InvalidDataException("武器目录不是有效 UTF-8。", error); }
            var root = WeaponJson.Object(new WeaponJson(text).Parse(), "schemaVersion", "component", "protocol", "revision", "gameRoot", "gameRootId", "targetGame", "requiresGameRestart", "weapons", "issues");
            if (WeaponJson.Integer(root["schemaVersion"], 1) != 1 || !Equals(root["component"], "GEMS.WeaponCatalog") ||
                !Equals(root["protocol"], "gems.weapon-catalog.v1") || !Equals(root["targetGame"], "enhanced") || !Equals(root["requiresGameRestart"], true))
                throw WeaponJson.Bad("目录版本、组件、目标游戏或重启声明无效。");
            return new WeaponCatalog(root, WeaponGameIdentity.Digest(bytes));
        }
    }

    public sealed class WeaponCatalogEntry
    {
        public string Id { get; }
        public string ModId { get; }
        public string Name { get; }
        public string WeaponName { get; }
        public string Hash { get; }
        public string Kind { get; }
        public IReadOnlyList<WeaponCatalogEvidence> Evidence { get; }
        public string? TransactionId { get; }
        public string FileState { get; }
        public string Registration { get; }
        public string Dependencies { get; }
        public IReadOnlyList<string> Issues { get; }
        internal WeaponCatalogEntry(object? value)
        {
            var item = WeaponJson.Object(value, "id", "modId", "name", "weaponName", "hash", "kind", "evidence", "transactionId", "fileState", "registration", "dependencies", "issues");
            Id = WeaponJson.Hex(item["id"], 64); ModId = WeaponJson.Id(item["modId"]); Name = WeaponJson.Text(item["name"], 300);
            WeaponName = WeaponJson.Token(item["weaponName"]); Hash = WeaponJson.Hex(item["hash"], 8);
            // This fixed-SDK helper is pure managed hashing, not a native game invocation.
            if (GTA.StringHash.AtStringHashUtf8(WeaponName, 0).ToString("x8", CultureInfo.InvariantCulture) != Hash) throw WeaponJson.Bad("武器名称与 hash 不匹配。");
            Kind = WeaponJson.Choice(item["kind"], "addon", "replace", "unknown");
            var evidence = WeaponJson.Array(item["evidence"], 32);
            if (evidence.Count == 0) throw WeaponJson.Bad("来源证据为空。");
            Evidence = evidence.Select(v => new WeaponCatalogEvidence(v)).ToList().AsReadOnly();
            TransactionId = item["transactionId"] == null ? null : WeaponJson.Id(item["transactionId"]);
            FileState = WeaponJson.Choice(item["fileState"], "verified", "disabled", "uninstalled", "pending", "missing", "changed", "shadowed", "unverified");
            if (FileState == "verified" && TransactionId == null) throw WeaponJson.Bad("已核验文件缺少事务标识。");
            Registration = WeaponJson.Choice(item["registration"], "unknown", "not-registered");
            Dependencies = WeaponJson.Choice(item["dependencies"], "unknown", "missing", "declared-only");
            Issues = WeaponJson.Strings(item["issues"], 64, 8192);
        }
    }
    public sealed class WeaponCatalogEvidence
    {
        public string Kind { get; }
        public string SourcePath { get; }
        public string SourceSha256 { get; }
        public long SourceBytes { get; }
        public string Locator { get; }
        internal WeaponCatalogEvidence(object? value)
        {
            var item = WeaponJson.Object(value, "kind", "sourcePath", "sourceSha256", "sourceBytes", "locator");
            Kind = WeaponJson.Choice(item["kind"], "weapons-meta", "manifest-declaration");
            SourcePath = WeaponJson.Text(item["sourcePath"], 4096);
            if (SourcePath.Contains('\\') || SourcePath.Split('/').Any(p => p.Length == 0 || p == "." || p == ".." ||
                Regex.IsMatch(p, "[<>:\"|?*]|[ .]$|\\A(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\\.|$)", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)))
                throw WeaponJson.Bad("来源路径不是安全相对路径。");
            SourceSha256 = WeaponJson.Hex(item["sourceSha256"], 64); SourceBytes = WeaponJson.Integer(item["sourceBytes"], 20L * 1024 * 1024 * 1024);
            Locator = WeaponJson.Text(item["locator"], 512);
        }
    }

    // A bounded strict JSON parser avoids silent duplicate/unknown fields and serializer coercion.
    internal sealed class WeaponJson
    {
        private readonly string input; private int at, nodes;
        private static readonly Regex Number = new Regex("\\G-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?(?:[eE][+-]?[0-9]+)?", RegexOptions.CultureInvariant);
        internal WeaponJson(string input) { this.input = input; }
        internal static InvalidDataException Bad(string reason) => new InvalidDataException("武器目录：" + reason);
        internal object? Parse() { var value = Value(0); Space(); if (at != input.Length) throw Bad("JSON 尾部有额外内容。"); return value; }
        private void Space() { while (at < input.Length && (input[at] == ' ' || input[at] == '\t' || input[at] == '\r' || input[at] == '\n')) at++; }
        private char Peek => at < input.Length ? input[at] : '\0';
        private void Expect(char ch) { Space(); if (Peek != ch) throw Bad("JSON 结构无效。"); at++; }
        private object? Value(int depth)
        {
            if (depth > 64 || ++nodes > 100000) throw Bad("JSON 结构超限。"); Space();
            if (Peek == '"') return String();
            if (Peek == '{')
            {
                at++; Space(); var result = new Dictionary<string, object?>(StringComparer.Ordinal);
                if (Peek == '}') { at++; return result; }
                while (true) { Space(); if (Peek != '"') throw Bad("JSON 字段无效。"); var key = String(); Expect(':'); if (result.ContainsKey(key)) throw Bad("JSON 字段重复。"); result.Add(key, Value(depth + 1)); Space(); if (Peek == '}') { at++; return result; } Expect(','); }
            }
            if (Peek == '[')
            {
                at++; Space(); var result = new List<object?>(); if (Peek == ']') { at++; return result; }
                while (true) { result.Add(Value(depth + 1)); Space(); if (Peek == ']') { at++; return result; } Expect(','); }
            }
            foreach (var literal in new[] { "true", "false", "null" })
                if (at + literal.Length <= input.Length && string.CompareOrdinal(input, at, literal, 0, literal.Length) == 0)
                { at += literal.Length; return literal == "null" ? null : (object)(literal == "true"); }
            var match = Number.Match(input, at);
            if (!match.Success) throw Bad("JSON 值无效。"); at += match.Length;
            if (!double.TryParse(match.Value, NumberStyles.Float, CultureInfo.InvariantCulture, out var number) || double.IsNaN(number) || double.IsInfinity(number)) throw Bad("JSON 数值无效。");
            return number;
        }
        private string String()
        {
            Expect('"'); var value = new StringBuilder();
            while (at < input.Length)
            {
                var ch = input[at++]; if (ch == '"') return value.ToString(); if (ch < 32) throw Bad("JSON 字符串含未转义控制字符。");
                if (ch != '\\') { value.Append(ch); continue; }
                if (at == input.Length) throw Bad("JSON 转义不完整。"); var escape = input[at++];
                switch (escape)
                {
                    case '"': case '\\': case '/': value.Append(escape); break;
                    case 'b': value.Append('\b'); break; case 'f': value.Append('\f'); break;
                    case 'n': value.Append('\n'); break; case 'r': value.Append('\r'); break; case 't': value.Append('\t'); break;
                    case 'u':
                        if (at + 4 > input.Length || !ushort.TryParse(input.Substring(at, 4), NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture, out var code)) throw Bad("JSON Unicode 转义无效。");
                        at += 4; value.Append((char)code); break;
                    default: throw Bad("JSON 转义无效。");
                }
            }
            throw Bad("JSON 字符串不完整。");
        }
        internal static Dictionary<string, object?> Object(object? value, params string[] keys)
        {
            var result = value as Dictionary<string, object?>;
            if (result == null || result.Count != keys.Length || keys.Any(k => !result.ContainsKey(k))) throw Bad("字段缺失、额外字段或对象类型无效。"); return result;
        }
        internal static List<object?> Array(object? value, int max)
        { var result = value as List<object?>; if (result == null || result.Count > max) throw Bad("列表类型或大小无效。"); return result; }
        internal static string Text(object? value, int max)
        {
            var result = value as string;
            if (result == null || result.Length == 0 || result.Length > max || result.Any(c => c < 32 || c == 127)) throw Bad("文本类型、长度或控制字符无效。");
            // UTF-8 input is strict, including escaped UTF-16 strings before hashing/display.
            try { new UTF8Encoding(false, true).GetByteCount(result); } catch (EncoderFallbackException error) { throw new InvalidDataException("武器目录包含未配对 Unicode 代理字符。", error); }
            return result;
        }
        internal static string Hex(object? value, int length)
        { var text = Text(value, length); if (text.Length != length || !Regex.IsMatch(text, "\\A[0-9a-f]+\\z", RegexOptions.CultureInvariant)) throw Bad("摘要无效。"); return text; }
        internal static string Id(object? value)
        { var text = Text(value, 80); if (!Regex.IsMatch(text, "\\A[-A-Za-z0-9_]+\\z", RegexOptions.CultureInvariant)) throw Bad("标识无效。"); return text; }
        internal static string Token(object? value)
        { var text = Text(value, 64); if (!Regex.IsMatch(text, "\\A[A-Za-z][A-Za-z0-9_]*\\z", RegexOptions.CultureInvariant)) throw Bad("武器名称格式未支持。"); return text; }
        internal static string Choice(object? value, params string[] choices)
        { if (!(value is string text) || !choices.Contains(text, StringComparer.Ordinal)) throw Bad("枚举值无效。"); return text; }
        internal static long Integer(object? value, long max)
        { if (!(value is double number) || number < 0 || number > max || Math.Truncate(number) != number) throw Bad("整数范围无效。"); return (long)number; }
        internal static IReadOnlyList<string> Strings(object? value, int count, int length) => Array(value, count).Select(v => Text(v, length)).ToList().AsReadOnly();
    }
}
