using System;
using System.Linq;
using GTA;
using GTA.Native;

namespace Gems.GameAssistant
{
    public sealed partial class GtaWeaponPort : IWeaponPort
    {
        private readonly Func<bool> eligible; private PlayerIdentity? last; private long epoch;
        public GtaWeaponPort(Func<bool> eligible) { this.eligible = eligible; }
        public void ForgetSession() { last = null; unchecked { epoch++; } }
        private static PlayerIdentity Identity(Player player, Ped? ped = null)
        {
            ped = ped ?? player.Character;
            if (ped == null || !ped.Exists() || ped.IsDead || ped.MemoryAddress == IntPtr.Zero) throw new InvalidOperationException("武器目标角色不可用。");
            return new PlayerIdentity(player.Handle, ped.Handle, ped.Model.Hash, ped.MemoryAddress.ToInt64());
        }
        public bool TrySession(out WeaponSession session)
        {
            session = default;
            try
            {
                if (!eligible()) { ForgetSession(); return false; }
                var actor = Identity(Game.Player);
                if (!eligible()) { ForgetSession(); return false; }
                if (last.HasValue && !last.Value.Equals(actor)) ForgetSession();
                last = actor; session = new WeaponSession(actor, epoch); return true;
            }
            catch { ForgetSession(); throw; }
        }
        private Ped Require(WeaponSession expected)
        {
            try
            {
                if (!TrySession(out var actual) || !actual.Equals(expected) || !eligible()) throw new InvalidOperationException("武器会话资格已中断。");
                var player = Game.Player; var ped = player.Character;
                if (!Identity(player, ped).Equals(expected.Actor) || epoch != expected.Epoch) throw new InvalidOperationException("最终武器目标已变化。");
                return ped;
            }
            catch { ForgetSession(); throw; }
        }
        private T ReadCall<T>(WeaponSession session, Func<Ped, T> read)
        { try { return read(Require(session)); } catch { ForgetSession(); throw; } }
        public WeaponDefinition[] Definitions(WeaponSession session)
        {
            var hashes = DefinitionHashes(session);
            return hashes.Where(h => h != WeaponHash.Unarmed).OrderBy(h => unchecked((uint)h)).Select(h => ReadDefinition(session, h)).ToArray();
        }
        private WeaponHash[] DefinitionHashes(WeaponSession session)
        {
            var hashes = ReadCall(session, p => Weapon.GetAllWeaponHashesForHumanPeds());
            if (hashes == null || hashes.Length == 0 || hashes.Length > WeaponRules.MaxDefinitions || hashes.Distinct().Count() != hashes.Length)
                throw new InvalidOperationException("运行定义列表为空、重复或超限；不当作可信空库存。");
            return hashes;
        }
        public WeaponDefinition InspectDefinition(WeaponSession session, uint hash)
        {
            if (hash == (uint)WeaponHash.Unarmed || !DefinitionHashes(session).Contains((WeaponHash)hash))
                throw new InvalidOperationException("目标未在实际运行定义表中发现。");
            return ReadDefinition(session, (WeaponHash)hash);
        }
        private WeaponDefinition ReadDefinition(WeaponSession session, WeaponHash h) => new WeaponDefinition {
                Hash = unchecked((uint)h),
                Name = ReadCall(session, p => new WeaponAsset(h).HumanName) ?? "",
                Slot = ReadCall(session, p => new WeaponAsset(h).SlotHash),
                Valid = ReadCall(session, p => p.Weapons.IsWeaponValid(h)) && ReadCall(session, p => new WeaponAsset(h).IsValidAsWeaponHash),
                AmmoType = ReadCall(session, p => Function.Call<uint>(Hash.GET_PED_AMMO_TYPE_FROM_WEAPON, p.Handle, unchecked((uint)h)))
            };
        private uint[] Hashes(WeaponSession session)
        {
            var values = ReadCall(session, p => p.Weapons.GetAllWeaponHashes()).Select(h => unchecked((uint)h)).OrderBy(h => h).ToArray();
            if (values.Length == 0 || values.Length > WeaponRules.MaxInventory || values.Distinct().Count() != values.Length || values.Any(h => h == 0))
                throw new InvalidOperationException("库存枚举为空、重复或超限，不能安全写入。");
            foreach (var hash in values) if (!ReadCall(session, p => p.Weapons.HasWeapon((WeaponHash)hash))) throw new InvalidOperationException("库存枚举与存在查询不一致。");
            return values;
        }
        private int Pool(WeaponSession session, uint type)
        {
            if (type == 0) return 0;
            var value = ReadCall(session, p => Function.Call<int>(Hash.GET_PED_AMMO_BY_TYPE, p.Handle, type)); WeaponRules.AmmoValue(value); return value;
        }
        private WeaponState State(WeaponSession session, uint hash)
        {
            var result = new WeaponState { Hash = hash, Slot = ReadCall(session, p => new WeaponAsset(hash).SlotHash) };
            if (hash == (uint)WeaponHash.Unarmed) return result;
            if (!ReadCall(session, p => p.Weapons.IsWeaponValid((WeaponHash)hash))) throw new InvalidOperationException("存在无法核对的库存定义；未开放写入。");
            T Part<T>(Func<Weapon, T> get) => ReadCall(session, p => {
                if (!p.Weapons.HasWeapon((WeaponHash)hash)) throw new InvalidOperationException("读取中武器已消失。");
                var item = p.Weapons[(WeaponHash)hash]; if (item == null || item.Hash != (WeaponHash)hash) throw new InvalidOperationException("缓存武器对象不匹配。"); return get(item);
            });
            result.AmmoType = ReadCall(session, p => Function.Call<uint>(Hash.GET_PED_AMMO_TYPE_FROM_WEAPON, p.Handle, hash));
            result.Ammo = Part(w => w.Ammo); WeaponRules.AmmoValue(result.Ammo); result.PoolAmmo = Pool(session, result.AmmoType);
            using (var maximum = new OutputArgument())
            {
                if (!ReadCall(session, p => Function.Call<bool>(Hash.GET_MAX_AMMO, p.Handle, hash, maximum))) throw new InvalidOperationException("弹药上限接口拒绝读取。");
                result.MaxAmmo = maximum.GetResult<int>(); WeaponRules.AmmoValue(result.MaxAmmo);
            }
            using (var output = new OutputArgument())
            {
                result.ClipKnown = ReadCall(session, p => Function.Call<bool>(Hash.GET_AMMO_IN_CLIP, p.Handle, hash, output));
                if (result.ClipKnown) { result.Clip = output.GetResult<int>(); WeaponRules.AmmoValue(result.Clip); }
            }
            result.Tint = Part(w => (int)w.Tint);
            var count = Part(w => w.Components.Count); if (count < 0 || count > WeaponRules.MaxComponents) throw new InvalidOperationException("组件数量无法确认。");
            var parts = new string[count];
            for (var i = 0; i < count; i++)
            {
                var index = i; parts[i] = Part(w => { var component = w.Components[index]; if (component == null || (uint)component.ComponentHash == 0xffffffffU) throw new InvalidOperationException("组件哨兵无效。"); return ((uint)component.ComponentHash).ToString("x8") + ":" + component.Active; });
            }
            result.Components = string.Join("/", parts.OrderBy(p => p, StringComparer.Ordinal));
            return result;
        }
        public WeaponSnapshot Read(WeaponSession session, uint probeHash = 0)
        {
            var hashes = Hashes(session); var current = ReadCall(session, p => (uint)p.Weapons.Current.Hash);
            if (!hashes.Contains(current)) throw new InvalidOperationException("当前武器与库存不一致。");
            var result = new WeaponSnapshot { Session = session, Current = current, Items = hashes.Select(h => State(session, h)).ToArray(), ProbeHash = probeHash };
            if (probeHash != 0)
            {
                result.ProbeAmmoType = ReadCall(session, p => Function.Call<uint>(Hash.GET_PED_AMMO_TYPE_FROM_WEAPON, p.Handle, probeHash));
                result.ProbePoolAmmo = Pool(session, result.ProbeAmmoType);
            }
            if (!hashes.SequenceEqual(Hashes(session)) || current != ReadCall(session, p => (uint)p.Weapons.Current.Hash)) throw new InvalidOperationException("读取期间库存或当前武器改变。");
            return result;
        }
        private Ped Unchanged(WeaponSession session, WeaponSnapshot expected)
        {
            if (!expected.Session.Equals(session) || Read(session, expected.ProbeHash).Fingerprint != expected.Fingerprint) throw new InvalidOperationException("预览后的库存或弹药已改变，取消操作。");
            return Require(session);
        }
        public bool AssetLoaded(WeaponSession session, uint hash) => ReadCall(session, p => new WeaponAsset(hash).IsLoaded);
        public void RequestAsset(WeaponSession session, uint hash) => ReadCall(session, p => { new WeaponAsset(hash).Request(); return true; });
        public void ReleaseAsset(WeaponSession session, uint hash) => ReadCall(session, p => { new WeaponAsset(hash).MarkAsNoLongerNeeded(); return true; });
        public void GiveZero(WeaponSession session, WeaponSnapshot expected, uint hash)
        {
            ReadCall(session, p => {
                var safe = Unchanged(session, expected); var asset = new WeaponAsset(hash);
                if (safe.Weapons.HasWeapon((WeaponHash)hash) || safe.Weapons.TryGetWeaponHashBySlotHash(asset.SlotHash, out _)) throw new InvalidOperationException("目标或槽位已被占用。");
                safe = Require(session);
                if (safe.Weapons.HasWeapon((WeaponHash)hash) || safe.Weapons.TryGetWeaponHashBySlotHash(asset.SlotHash, out _)) throw new InvalidOperationException("最终发放检查发现目标或槽位占用。");
                if (!asset.IsLoaded) throw new InvalidOperationException("最终发放检查发现资源已卸载，未调用Give。");
                safe.Weapons.Give((WeaponHash)hash, 0, false, false); return true;
            });
        }
        public void AddAmmo(WeaponSession session, WeaponSnapshot expected, uint hash, int amount)
        {
            WeaponRules.SharedAddition(amount, expected, hash);
            ReadCall(session, p => { var safe = Unchanged(session, expected); safe = Require(session); if (!safe.Weapons.HasWeapon((WeaponHash)hash)) throw new InvalidOperationException("目标已消失，不重新Give。"); Function.Call(Hash.ADD_AMMO_TO_PED, safe.Handle, hash, amount); return true; });
        }
        public void RemoveOwned(WeaponSession session, WeaponSnapshot expected, uint hash)
        {
            if (hash == (uint)WeaponHash.Unarmed || expected.Current == hash) throw new InvalidOperationException("不能移除空手或当前使用的目标。");
            ReadCall(session, p => { var safe = Unchanged(session, expected); safe = Require(session); if (!safe.Weapons.HasWeapon((WeaponHash)hash) || (uint)safe.Weapons.Current.Hash == hash) throw new InvalidOperationException("目标已不存在或当前选中，未移除。"); safe.Weapons.Remove((WeaponHash)hash); return true; });
        }
    }
}
