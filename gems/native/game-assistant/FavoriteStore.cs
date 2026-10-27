using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;

namespace Gems.GameAssistant
{
    // Append-only records avoid overwriting a user's prior favorite data. A complete
    // new record is renamed into place; malformed/conflicting history is never reset.
    public sealed class FavoriteStore
    {
        [DataContract]
        private sealed class Record
        {
            [DataMember(IsRequired = true)] public int SchemaVersion = 1;
            [DataMember(IsRequired = true)] public int ModelHash;
            [DataMember(IsRequired = true)] public bool Favorite;
            [DataMember(IsRequired = true)] public int Sequence;
            [DataMember(IsRequired = true)] public string Id = "";
        }
        private readonly string directory;
        public FavoriteStore(string directory) { this.directory = directory; }
        private static string Filename(Record record) => "favorite-" + record.Sequence.ToString("D8") + "-" + record.Id + ".json";
        private List<Record> ReadRecords()
        {
            BridgeCatalog.RejectLinks(directory);
            if (!Directory.Exists(directory)) return new List<Record>();
            var files = Directory.EnumerateFiles(directory, "favorite-*.json").Take(4097).ToArray();
            if (files.Length > 4096) throw new InvalidDataException("收藏记录达到上限；未清空历史。");
            var records = new List<Record>(); var sequences = new HashSet<int>();
            foreach (var file in files)
            {
                BridgeCatalog.RejectLinks(file);
                using (var stream = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.Read))
                {
                    if (stream.Length > 1024) throw new InvalidDataException("收藏记录超过大小限制。");
                    var record = (Record?)new DataContractJsonSerializer(typeof(Record)).ReadObject(stream);
                    if (record == null || record.SchemaVersion != 1 || record.Sequence < 1 || record.Sequence > 1000000000
                        || !Guid.TryParseExact(record.Id, "N", out _) || Filename(record) != Path.GetFileName(file) || !sequences.Add(record.Sequence))
                        throw new InvalidDataException("收藏历史无效或存在并发冲突；未覆盖任何记录。");
                    records.Add(record);
                }
            }
            return records.OrderBy(record => record.Sequence).ToList();
        }
        private static Dictionary<int, bool> States(IEnumerable<Record> records)
        {
            var result = new Dictionary<int, bool>(); foreach (var record in records) result[record.ModelHash] = record.Favorite;
            if (result.Count > 2048) throw new InvalidDataException("收藏车型索引超过上限。");
            return result;
        }
        public int[] ReadModels() => States(ReadRecords()).Where(pair => pair.Value).Select(pair => pair.Key).OrderBy(value => unchecked((uint)value)).ToArray();
        public bool Toggle(int modelHash)
        {
            var records = ReadRecords(); var states = States(records);
            if (records.Count >= 4096 || (!states.ContainsKey(modelHash) && states.Count >= 2048)) throw new InvalidDataException("收藏记录达到上限；未删除历史。");
            var record = new Record { ModelHash = modelHash, Favorite = !states.TryGetValue(modelHash, out var prior) || !prior, Sequence = records.Count == 0 ? 1 : checked(records.Last().Sequence + 1), Id = Guid.NewGuid().ToString("N") };
            if (record.Sequence > 1000000000) throw new InvalidDataException("收藏序号达到上限。");
            BridgeCatalog.RejectLinks(directory); Directory.CreateDirectory(directory);
            var target = Path.Combine(directory, Filename(record)); var temporary = target + ".tmp";
            var ownTemporary = false;
            try
            {
                using (var stream = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                { ownTemporary = true; new DataContractJsonSerializer(typeof(Record)).WriteObject(stream, record); stream.Flush(true); }
                BridgeCatalog.RejectLinks(directory);
                // New immutable name, never replace an old record or a user-created file.
                File.Move(temporary, target);
                ownTemporary = false;
            }
            finally { if (ownTemporary && File.Exists(temporary)) File.Delete(temporary); }
            ReadRecords(); // Detect concurrent same-sequence writers rather than hiding a conflict.
            return record.Favorite;
        }
    }
}
