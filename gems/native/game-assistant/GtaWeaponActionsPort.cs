using System;
using System.Linq;
using GTA;
using GTA.Native;

namespace Gems.GameAssistant
{
    public sealed partial class GtaWeaponPort : IWeaponActionsPort
    {
        internal Func<long>? WeaponDetailClock { get; set; }
        private const int MaximumActionComponentDefinitions = 1024;
        private sealed class DetailBudgetException : InvalidOperationException
        { internal DetailBudgetException(string reason) : base(reason) { } }
        private sealed class DetailBudget
        {
            private readonly Func<long> clock; private readonly long started;
            internal string Failure = "";
            internal DetailBudget(Func<long>? clock) { this.clock = clock ?? System.Diagnostics.Stopwatch.GetTimestamp; started = this.clock(); }
            internal void Check()
            {
                var elapsed = clock() - started;
                if (elapsed < 0 || elapsed * 1000.0 / System.Diagnostics.Stopwatch.Frequency >= 75)
                { Failure = "elapsed-budget-75ms"; throw new DetailBudgetException(Failure); }
            }
        }
        // An unsupported diagnostic is not an absent weapon. Guard checks are outside
        // the diagnostic catch so an actor/focus/session failure cannot become Unknown.
        private WeaponReading<T> Optional<T>(WeaponSession session, string field, Func<Ped, T> read, Func<T, bool>? valid = null)
        {
            var ped = Require(session); WeaponReading<T> value;
            try
            {
                var result = read(ped);
                value = valid == null || valid(result) ? WeaponReading<T>.Of(result) : WeaponReading<T>.Unknown(field + ":out-of-range");
            }
            catch (Exception error) { value = WeaponReading<T>.Unknown(field + ":" + (error is DetailBudgetException ? error.Message : error.GetType().Name)); }
            Require(session);
            return value;
        }
        private static Weapon ActionWeapon(Ped ped, uint hash)
        {
            if (!ped.Weapons.HasWeapon((WeaponHash)hash)) throw new InvalidOperationException("目标武器已消失。");
            var weapon = ped.Weapons[(WeaponHash)hash];
            if (weapon == null || (uint)weapon.Hash != hash) throw new InvalidOperationException("武器对象与目标不一致。");
            return weapon;
        }
        private static bool AmmoRange(int value) => value >= 0 && value <= WeaponRules.MaxAmmo;
        private WeaponReading<int> OutputReading(WeaponSession session, uint hash, Hash native, string field)
            => Optional(session, field, ped => {
                using (var output = new OutputArgument())
                {
                    if (!Function.Call<bool>(native, ped.Handle, hash, output)) throw new NotSupportedException(field);
                    return output.GetResult<int>();
                }
            }, AmmoRange);

        private WeaponComponentObservation[] ComponentDefinitions(Ped ped, uint hash, DetailBudget budget)
        {
            budget.Check();
            var weapon = ActionWeapon(ped, hash); var count = weapon.Components.Count;
            if (count < 0 || count > WeaponRules.MaxComponents) throw new InvalidOperationException("组件数量无法确认。");
            budget.Check();
            var global = WeaponComponent.GetAllHashes();
            if (global != null && global.Length > MaximumActionComponentDefinitions) throw new DetailBudgetException("global-definitions-exceed-1024");
            if (global == null || global.Length == 0 || global.Distinct().Count() != global.Length || global.Any(h => (uint)h == 0 || h == WeaponComponentHash.Invalid))
                throw new InvalidOperationException("实际组件定义为空、重复或超限。");
            var compatibility = global.ToDictionary(h => (uint)h, h => { budget.Check(); return Function.Call<bool>(Hash.DOES_WEAPON_TAKE_WEAPON_COMPONENT, hash, (uint)h); });
            var result = new WeaponComponentObservation[count];
            for (var index = 0; index < count; index++)
            {
                budget.Check();
                var component = weapon.Components[index];
                if (component == null || component.ComponentHash == WeaponComponentHash.Invalid || (uint)component.ComponentHash == 0 || !global.Contains(component.ComponentHash))
                    throw new InvalidOperationException("组件对象与实际定义不一致。");
                var attachment = (int)component.AttachmentPoint; budget.Check(); var installed = component.Active;
                result[index] = new WeaponComponentObservation {
                    Hash = (uint)component.ComponentHash, Attachment = attachment,
                    Compatible = compatibility[(uint)component.ComponentHash],
                    Installed = installed,
                    Active = WeaponReading<bool>.Unknown("active:not-read"),
                    Livery = WeaponReading<int>.Unknown("livery:applicability-unverified")
                };
            }
            if (result.Select(c => c.Hash).Distinct().Count() != count) throw new InvalidOperationException("组件定义重复。");
            var compatible = compatibility.Where(c => c.Value).Select(c => c.Key).OrderBy(h => h).ToArray();
            if (!compatible.SequenceEqual(result.Where(c => c.Compatible).Select(c => c.Hash).OrderBy(h => h)))
                throw new InvalidOperationException("实际组件定义与 SDK 缓存集合不一致。");
            budget.Check(); return result.OrderBy(c => c.Hash).ToArray();
        }
        private WeaponActionItem ActionItem(WeaponSession session, uint hash, bool detail, bool diagnostics)
        {
            var result = new WeaponActionItem { Hash = hash, Slot = WeaponReading<int>.Unknown("detail:not-requested"),
                AmmoType = WeaponReading<uint>.Unknown("diagnostics:not-requested"),
                Ammo = WeaponReading<int>.Unknown("detail:not-requested"), Pool = WeaponReading<int>.Unknown("detail:not-requested"),
                Clip = WeaponReading<int>.Unknown("detail:not-requested"), MaxAmmo = WeaponReading<int>.Unknown("detail:not-requested"),
                Tint = WeaponReading<int>.Unknown("detail:not-requested"), TintCount = WeaponReading<int>.Unknown("detail:not-requested"),
                ComponentsKnown = false, ComponentIssue = "detail:not-requested" };
            if (hash == (uint)WeaponHash.Unarmed)
            {
                result.AmmoType = WeaponReading<uint>.Unknown("unarmed:not-applicable");
                result.Ammo = result.Pool = result.Clip = result.MaxAmmo = result.Tint = result.TintCount = WeaponReading<int>.Unknown("unarmed:not-applicable");
                result.ComponentIssue = "unarmed:not-applicable"; return result;
            }
            if (diagnostics || detail) result.AmmoType = Optional(session, "ammo-type", p => Function.Call<uint>(Hash.GET_PED_AMMO_TYPE_FROM_WEAPON, p.Handle, hash), v => v != 0);
            if (!detail) return result;
            result.Slot = Optional(session, "slot", p => new WeaponAsset(hash).SlotHash);
            result.Ammo = Optional(session, "ammo", p => ActionWeapon(p, hash).Ammo, AmmoRange);
            result.Pool = result.AmmoType.Known
                ? Optional(session, "pool", p => Function.Call<int>(Hash.GET_PED_AMMO_BY_TYPE, p.Handle, result.AmmoType.Value), AmmoRange)
                : WeaponReading<int>.Unknown("pool:ammo-type-unknown");
            result.Clip = OutputReading(session, hash, Hash.GET_AMMO_IN_CLIP, "clip");
            result.MaxAmmo = OutputReading(session, hash, Hash.GET_MAX_AMMO, "max-ammo");
            result.TintCount = Optional(session, "tint-count", p => ActionWeapon(p, hash).TintCount, v => v > 0 && v <= 4096);
            result.Tint = Optional(session, "tint", p => (int)ActionWeapon(p, hash).Tint, v => v >= 0 && result.TintCount.Known && v < result.TintCount.Value);
            var budget = new DetailBudget(WeaponDetailClock);
            var components = Optional(session, "components", p => ComponentDefinitions(p, hash, budget));
            result.ComponentsKnown = components.Known;
            if (!components.Known) { result.ComponentIssue = components.Reason; return result; }
            result.Components = components.Value;
            foreach (var component in result.Components)
            {
                component.Active = component.Compatible
                    ? Optional(session, "component-active", p => { budget.Check(); return Function.Call<bool>(Hash.IS_PED_WEAPON_COMPONENT_ACTIVE, p.Handle, hash, component.Hash); })
                    : WeaponReading<bool>.Unknown("active:incompatible");
                if (budget.Failure.Length != 0) { IncompleteComponents(result, budget.Failure); return result; }
                component.LiveryRaw = component.Compatible && component.Installed
                    ? Optional(session, "livery-raw", p => { budget.Check(); return Function.Call<int>(Hash.GET_PED_WEAPON_COMPONENT_TINT_INDEX, p.Handle, hash, component.Hash); })
                    : WeaponReading<int>.Unknown("livery-raw:not-installed-compatible");
                if (budget.Failure.Length != 0) { IncompleteComponents(result, budget.Failure); return result; }
            }
            var finished = Optional(session, "components-budget", p => { budget.Check(); return true; });
            if (!finished.Known) IncompleteComponents(result, finished.Reason);
            return result;
        }
        private static void IncompleteComponents(WeaponActionItem item, string reason)
        { item.ComponentsKnown = false; item.ComponentIssue = "components:" + reason; item.Components = new WeaponComponentObservation[0]; }
        private uint[] ActionHashes(WeaponSession session)
        {
            var hashes = ReadCall(session, ped => {
                var values = ped.Weapons.GetAllWeaponHashes().Select(h => (uint)h).OrderBy(h => h).ToArray();
                if (values.Length == 0 || values.Length > WeaponRules.MaxInventory || values.Distinct().Count() != values.Length || values.Any(h => h == 0))
                    throw new InvalidOperationException("库存枚举为空、重复或超限。");
                foreach (var hash in values) if (!ped.Weapons.HasWeapon((WeaponHash)hash)) throw new InvalidOperationException("库存枚举与存在查询不一致。");
                return values;
            });
            Require(session); return hashes;
        }
        public WeaponActionSnapshot Observe(WeaponSession session, uint detailWeapon = 0, bool diagnostics = false)
        {
            try
            {
                var hashes = ActionHashes(session); var current = ReadCall(session, p => (uint)p.Weapons.Current.Hash);
                if (!hashes.Contains(current) || (detailWeapon != 0 && !hashes.Contains(detailWeapon))) throw new InvalidOperationException("当前或详情武器与库存集合不一致。");
                var snapshot = new WeaponActionSnapshot { Session = session, Current = current, DetailWeapon = detailWeapon, Diagnostics = diagnostics, Items = hashes.Select(h => ActionItem(session, h, h == detailWeapon, diagnostics || detailWeapon != 0)).ToArray() };
                if (!hashes.SequenceEqual(ActionHashes(session)) || current != ReadCall(session, p => (uint)p.Weapons.Current.Hash))
                    throw new InvalidOperationException("观察期间库存集合或当前武器改变。");
                Require(session); return snapshot;
            }
            catch { ForgetSession(); throw; }
        }
        private void ActionTargetUnchanged(WeaponSession session, WeaponActionSnapshot expected, uint weapon)
        {
            if (expected == null || !expected.Session.Equals(session) || expected.DetailWeapon != weapon || expected.Find(weapon) == null)
                throw new InvalidOperationException("操作需要目标武器的详情观察。");
            var actual = Observe(session, weapon, expected.Diagnostics);
            if (actual.Identity != expected.Identity || actual.Find(weapon)!.Canonical != expected.Find(weapon)!.Canonical ||
                !actual.Items.Select(i => i.Hash + ":" + i.AmmoType.Canonical).SequenceEqual(expected.Items.Select(i => i.Hash + ":" + i.AmmoType.Canonical)))
                throw new InvalidOperationException("确认后的武器观察值已改变，未提交请求。");
        }
        private Ped FinalActionPed(WeaponSession session, WeaponActionSnapshot expected)
        {
            if (expected == null || !expected.Session.Equals(session)) throw new InvalidOperationException("武器请求会话不一致。");
            var ped = Require(session);
            CheckCapturedActionPed(session, expected, ped); return ped;
        }
        private void CheckCapturedActionPed(WeaponSession session, WeaponActionSnapshot expected, Ped ped)
        {
            var hashes = ped.Weapons.GetAllWeaponHashes().Select(h => (uint)h).OrderBy(h => h).ToArray();
            if (!hashes.SequenceEqual(expected.Items.Select(i => i.Hash).OrderBy(h => h)) || (uint)ped.Weapons.Current.Hash != expected.Current || hashes.Any(h => !ped.Weapons.HasWeapon((WeaponHash)h)))
                throw new InvalidOperationException("最终检查发现库存集合或当前武器改变。");
            var player = Game.Player;
            if (epoch != session.Epoch || !Identity(player, ped).Equals(session.Actor) || !Identity(player).Equals(session.Actor))
                throw new InvalidOperationException("最终库存检查期间角色改变。");
        }
        private void ActionWrite(Action write)
        { try { write(); } catch { ForgetSession(); throw; } }
        public void Clear(WeaponSession session, WeaponActionSnapshot expected) => ActionWrite(() => {
            FinalActionPed(session, expected).Weapons.RemoveAll();
        });
        public void InfinitePool(WeaponSession session, WeaponActionSnapshot expected, uint weapon, bool desired) => ActionWrite(() => {
            var target = expected.Find(weapon);
            if (weapon == (uint)WeaponHash.Unarmed || target == null || !target.AmmoType.Known || target.AmmoType.Value == 0 || expected.Items.Any(i => i.Hash != (uint)WeaponHash.Unarmed && !i.AmmoType.Known))
                throw new InvalidOperationException("无法确认共享弹药池成员，未提交请求。");
            var ped = FinalActionPed(session, expected); var item = ActionWeapon(ped, weapon); ped = Require(session);
            foreach (var member in expected.Items.Where(i => i.Hash != (uint)WeaponHash.Unarmed))
                if (Function.Call<uint>(Hash.GET_PED_AMMO_TYPE_FROM_WEAPON, ped.Handle, member.Hash) != member.AmmoType.Value) throw new InvalidOperationException("最终共享弹药池成员或类型改变。");
            CheckCapturedActionPed(session, expected, ped); item.InfiniteAmmo = desired;
        });
        public void InfiniteClip(WeaponSession session, WeaponActionSnapshot expected, bool desired) => ActionWrite(() => {
            var ped = FinalActionPed(session, expected); var item = ActionWeapon(ped, expected.Current);
            ped = Require(session); CheckCapturedActionPed(session, expected, ped); item.InfiniteAmmoClip = desired;
        });
        private WeaponComponent FinalComponent(WeaponSession session, WeaponActionSnapshot expected, uint weapon, uint component)
        {
            var target = expected.Find(weapon); var old = target?.Find(component);
            if (target == null || !target.ComponentsKnown || old == null || !old.Compatible || component == 0 || component == (uint)WeaponComponentHash.Invalid)
                throw new InvalidOperationException("目标组件不在可信兼容定义中。");
            var ped = FinalActionPed(session, expected); var budget = new DetailBudget(WeaponDetailClock); var definitions = ComponentDefinitions(ped, weapon, budget);
            // Active and raw colour were sampled by ActionTargetUnchanged. Repeat the
            // actual compatible definition set and HAS immediately before the setter.
            if (!definitions.Select(c => c.Definition + "," + c.Installed).SequenceEqual(target.Components.Select(c => c.Definition + "," + c.Installed)))
                throw new InvalidOperationException("最终组件集合或安装状态改变。");
            ped = Require(session); var item = ActionWeapon(ped, weapon); var found = item.Components[(WeaponComponentHash)component];
            budget.Check();
            if (found == null || (uint)found.ComponentHash != component || (int)found.AttachmentPoint != old.Attachment || found.Active != old.Installed)
                throw new InvalidOperationException("最终组件目标不一致。");
            budget.Check();
            if (!Function.Call<bool>(Hash.DOES_WEAPON_TAKE_WEAPON_COMPONENT, weapon, component)) throw new InvalidOperationException("最终组件兼容性改变。");
            CheckCapturedActionPed(session, expected, ped); budget.Check(); return found;
        }
        public void Component(WeaponSession session, WeaponActionSnapshot expected, uint weapon, uint component, bool installed) => ActionWrite(() => {
            ActionTargetUnchanged(session, expected, weapon); var target = FinalComponent(session, expected, weapon, component); target.Active = installed;
        });
        public void WeaponTint(WeaponSession session, WeaponActionSnapshot expected, uint weapon, int tint) => ActionWrite(() => {
            var target = expected.Find(weapon);
            if (target == null || weapon == (uint)WeaponHash.Unarmed || !target.TintCount.Known || !target.Tint.Known || tint < 0 || tint >= target.TintCount.Value) throw new InvalidOperationException("武器颜色范围无法确认。");
            ActionTargetUnchanged(session, expected, weapon); var ped = FinalActionPed(session, expected); var item = ActionWeapon(ped, weapon); ped = Require(session);
            if (item.TintCount != target.TintCount.Value || (int)item.Tint != target.Tint.Value) throw new InvalidOperationException("最终武器颜色或范围改变。");
            CheckCapturedActionPed(session, expected, ped); item.Tint = (GTA.WeaponTint)tint;
        });
        public void ComponentLivery(WeaponSession session, WeaponActionSnapshot expected, uint weapon, uint component, int observedTint) => ActionWrite(() => {
            // The pinned public API provides neither a supportedness query nor a success
            // flag for livery reads. A default nonnegative integer cannot establish that.
            Require(session);
            throw new InvalidOperationException("组件涂装适用性尚无可信读回条件，不能恢复未知颜色。");
        });
    }
}
