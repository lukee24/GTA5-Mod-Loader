using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Security.Cryptography;
using System.Text;

namespace Gems.GameAssistant
{
    public readonly struct WeaponSession : IEquatable<WeaponSession>
    {
        public readonly PlayerIdentity Actor; public readonly long Epoch;
        public WeaponSession(PlayerIdentity actor, long epoch) { Actor = actor; Epoch = epoch; }
        public bool Equals(WeaponSession other) => Actor.Equals(other.Actor) && Epoch == other.Epoch;
        public string Key => string.Join(":", new[] { (long)Actor.PlayerHandle, Actor.PedHandle, Actor.ModelHash, Actor.Address, Epoch }.Select(v => v.ToString(CultureInfo.InvariantCulture)));
    }
    public sealed class WeaponDefinition
    {
        public uint Hash; public string Name = ""; public int Slot; public uint AmmoType; public bool Valid;
    }
    public sealed class WeaponState
    {
        public uint Hash, AmmoType; public int Slot, Ammo, PoolAmmo, Clip, MaxAmmo, Tint;
        public bool ClipKnown; public string Components = "";
        public string Canonical => string.Format(CultureInfo.InvariantCulture, "{0:x8},{1},{2:x8},{3},{4},{5},{6},{7},{8},{9}", Hash, Slot, AmmoType, Ammo, PoolAmmo, ClipKnown, Clip, MaxAmmo, Tint, Components);
    }
    public sealed class WeaponSnapshot
    {
        public WeaponSession Session; public uint Current;
        public WeaponState[] Items = new WeaponState[0];
        public uint ProbeHash, ProbeAmmoType; public int ProbePoolAmmo;
        public string Canonical => Session.Key + "|current=" + Current.ToString("x8") + "|items=" +
            string.Join(";", Items.OrderBy(i => i.Hash).Select(i => i.Canonical)) + "|probe=" + ProbeHash.ToString("x8") + "," + ProbeAmmoType.ToString("x8") + "," + ProbePoolAmmo.ToString(CultureInfo.InvariantCulture);
        public string Fingerprint { get { using (var sha = SHA256.Create()) return BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(Canonical))).Replace("-", "").ToLowerInvariant(); } }
        public WeaponState? Find(uint hash) => Items.FirstOrDefault(i => i.Hash == hash);
    }
    public interface IWeaponPort
    {
        bool TrySession(out WeaponSession session);
        void ForgetSession();
        WeaponDefinition[] Definitions(WeaponSession session);
        WeaponDefinition InspectDefinition(WeaponSession session, uint hash);
        WeaponSnapshot Read(WeaponSession session, uint probeHash = 0);
        bool AssetLoaded(WeaponSession session, uint hash);
        void RequestAsset(WeaponSession session, uint hash);
        void ReleaseAsset(WeaponSession session, uint hash);
        void GiveZero(WeaponSession session, WeaponSnapshot expected, uint hash);
        void AddAmmo(WeaponSession session, WeaponSnapshot expected, uint hash, int amount);
        void RemoveOwned(WeaponSession session, WeaponSnapshot expected, uint hash);
    }
    public interface IWeaponJournal
    {
        void Verify();
        string Begin(string action, WeaponSnapshot before, uint hash, int amount, string sourceToken);
        void Finish(string id, string state, WeaponSnapshot? after, string detail);
        int UnconfirmedCount { get; }
    }
    public sealed class WeaponChoice
    {
        public uint Hash; public string Name = "", Source = "runtime", SourceId = "", SourceToken = "", Warning = "";
        public bool SourceAllowed = true;
    }
    public sealed class OwnedWeaponRecord
    {
        public string Id = "", SourceId = "", SourceToken = ""; public uint Hash; public WeaponSession Session;
        public WeaponSnapshot Before = new WeaponSnapshot(), After = new WeaponSnapshot();
        public bool Confirmed, Removed; public string State = "待确认";
    }
    public static class WeaponRules
    {
        public const int MaxInventory = 512, MaxDefinitions = 4096, MaxComponents = 512, MaxAmmo = 1000000, MaxAddition = 10000;
        public static void AmmoValue(int value) { if (value < 0 || value > MaxAmmo) throw new InvalidOperationException("弹药读数超出可信范围。"); }
        public static int Addition(int amount, WeaponState state)
        {
            if (amount < 1 || amount > MaxAddition) throw new ArgumentOutOfRangeException(nameof(amount), "补弹必须为1..10000的正整数。");
            AmmoValue(state.Ammo); AmmoValue(state.PoolAmmo); AmmoValue(state.MaxAmmo);
            if (!state.ClipKnown || state.AmmoType == 0 || state.MaxAmmo <= 0 || state.PoolAmmo > state.MaxAmmo || amount > state.MaxAmmo - state.PoolAmmo)
                throw new InvalidOperationException("弹药类型、上限或请求余量无法确认，未补弹。");
            return amount;
        }
        public static void SharedAddition(int amount, WeaponSnapshot snapshot, uint hash)
        {
            var target = snapshot.Find(hash) ?? throw new InvalidOperationException("目标不在库存。");
            Addition(amount, target);
            foreach (var item in snapshot.Items.Where(i => i.AmmoType == target.AmmoType))
            {
                if (item.PoolAmmo != target.PoolAmmo) throw new InvalidOperationException("同弹药池读取不一致。");
                Addition(amount, item);
            }
        }
        public static void Grant(WeaponSnapshot snapshot, WeaponDefinition definition)
        {
            if (!definition.Valid || definition.Hash == 0 || definition.Slot == 0 || definition.AmmoType == 0) throw new InvalidOperationException("目标定义、槽位或弹药类型未确认。");
            if (snapshot.Find(definition.Hash) != null) throw new InvalidOperationException("当前已持有此武器；不会重新Give或覆盖配件。");
            if (snapshot.Items.Any(i => i.Slot == definition.Slot)) throw new InvalidOperationException("目标槽位已被现有武器占用。");
            if (snapshot.ProbeHash != definition.Hash || snapshot.ProbeAmmoType != definition.AmmoType || snapshot.ProbePoolAmmo != 0 || snapshot.Items.Any(i => i.AmmoType == definition.AmmoType))
                throw new InvalidOperationException("目标弹药池已有数据或与现有武器共享；本阶段无法证明可条件移除，未发放。");
        }
        public static bool ExistingUnchanged(WeaponSnapshot before, WeaponSnapshot after, uint target)
            => before.Current == after.Current && before.Items.Where(i => i.Hash != target).OrderBy(i => i.Hash).Select(i => i.Canonical).SequenceEqual(after.Items.Where(i => i.Hash != target).OrderBy(i => i.Hash).Select(i => i.Canonical));
    }
}
