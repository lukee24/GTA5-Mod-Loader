using System;
using System.Globalization;
using System.Linq;
using System.Security.Cryptography;
using System.Text;

namespace Gems.GameAssistant
{
    public readonly struct WeaponReading<T>
    {
        public readonly bool Known; public readonly T Value; public readonly string Reason;
        private WeaponReading(bool known, T value, string reason) { Known = known; Value = value; Reason = reason ?? ""; }
        public static WeaponReading<T> Of(T value) => new WeaponReading<T>(true, value, "");
        public static WeaponReading<T> Unknown(string reason) => new WeaponReading<T>(false, default!, reason);
        public string Canonical => Known ? "known:" + Convert.ToString(Value, CultureInfo.InvariantCulture) : "unknown:" + Convert.ToBase64String(Encoding.UTF8.GetBytes(Reason ?? ""));
        public string Display => Known ? Convert.ToString(Value, CultureInfo.InvariantCulture) ?? "" : "未知";
    }
    public sealed class WeaponComponentObservation
    {
        public uint Hash; public int Attachment; public bool Compatible, Installed;
        public WeaponReading<bool> Active;
        public WeaponReading<int> LiveryRaw;
        public WeaponReading<int> Livery;
        public string Definition => Hash.ToString("x8") + "," + Attachment.ToString(CultureInfo.InvariantCulture) + "," + Compatible;
        public string Canonical => Definition + "," + Installed + "," + Active.Canonical + ",raw=" + LiveryRaw.Canonical + ",usable=" + Livery.Canonical;
    }
    public sealed class WeaponActionItem
    {
        public uint Hash; public WeaponReading<int> Slot;
        public WeaponReading<uint> AmmoType;
        public WeaponReading<int> Ammo, Pool, Clip, MaxAmmo, Tint, TintCount;
        public bool ComponentsKnown; public string ComponentIssue = "";
        public WeaponComponentObservation[] Components = new WeaponComponentObservation[0];
        public string Definition => Hash.ToString("x8") + "," + Slot.Canonical + "," + ComponentsKnown + "," + string.Join("/", Components.OrderBy(c => c.Hash).Select(c => c.Definition));
        public string Fields => Definition + "|" + AmmoType.Canonical + "|" + Ammo.Canonical + "|" + Pool.Canonical + "|" + Clip.Canonical + "|" + MaxAmmo.Canonical + "|" + Tint.Canonical + "|" + TintCount.Canonical;
        public string Canonical => Fields + "|" +
            Convert.ToBase64String(Encoding.UTF8.GetBytes(ComponentIssue ?? "")) + "|" + string.Join("/", Components.OrderBy(c => c.Hash).Select(c => c.Canonical));
        public WeaponComponentObservation? Find(uint hash) => Components.FirstOrDefault(c => c.Hash == hash);
    }
    public sealed class WeaponActionSnapshot
    {
        public WeaponSession Session; public uint Current, DetailWeapon;
        public bool Diagnostics;
        public WeaponActionItem[] Items = new WeaponActionItem[0];
        public string Identity => Session.Key + "|current=" + Current.ToString("x8") + "|hashes=" + string.Join(",", Items.OrderBy(i => i.Hash).Select(i => i.Hash.ToString("x8")));
        public string Canonical => Identity + "|detail=" + DetailWeapon.ToString("x8") + ",diagnostics=" + Diagnostics + "|items=" + string.Join(";", Items.OrderBy(i => i.Hash).Select(i => i.Canonical));
        public string Fingerprint => Digest(Canonical);
        public WeaponActionItem? Find(uint hash) => Items.FirstOrDefault(i => i.Hash == hash);
        public static string Digest(string text) { using (var sha = SHA256.Create()) return BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(text))).Replace("-", "").ToLowerInvariant(); }
    }
    public interface IWeaponActionsPort
    {
        bool TrySession(out WeaponSession session);
        void ForgetSession();
        // Mandatory inventory identity, optional diagnostic fields must retain explicit unknown.
        WeaponActionSnapshot Observe(WeaponSession session, uint detailWeapon = 0, bool diagnostics = false);
        void Clear(WeaponSession session, WeaponActionSnapshot expected);
        void InfinitePool(WeaponSession session, WeaponActionSnapshot expected, uint weapon, bool desired);
        void InfiniteClip(WeaponSession session, WeaponActionSnapshot expected, bool desired);
        void Component(WeaponSession session, WeaponActionSnapshot expected, uint weapon, uint component, bool installed);
        void WeaponTint(WeaponSession session, WeaponActionSnapshot expected, uint weapon, int tint);
        // Only a previously observed, nonnegative component colour is eligible for conditional restoration.
        void ComponentLivery(WeaponSession session, WeaponActionSnapshot expected, uint weapon, uint component, int observedTint);
    }
    public interface IWeaponActionJournal
    {
        void Verify();
        string BeginAction(string action, string before, string detail);
        void FinishAction(string id, string state, string? after, string detail);
        int UnconfirmedCount { get; }
    }
    public sealed class WeaponRequestRecord
    {
        public string Id = "", Scope = "", Submission = "not-submitted";
        public bool Desired; public WeaponSession Session; public uint Weapon, AmmoType; public DateTime At;
        public string ActualState => "unknown";
        public bool CurrentSession;
        public bool AuditDurable;
    }
}

