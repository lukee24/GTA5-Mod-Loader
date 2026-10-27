using System;
using System.Collections.Generic;
using System.Linq;
using System.Drawing;
using GTA;
using GTA.Math;

namespace Gems.GameAssistant
{
    internal sealed class VehicleController
    {
        private readonly Func<bool> allowed;
        private readonly Action<string, string> log;
        private Vehicle? tracked;
        private PlayerIdentity trackedIdentity;
        private readonly Dictionary<string, OwnedBooleanState> changes = new Dictionary<string, OwnedBooleanState>();
        private bool pending;
        private DateTime nextRestore = DateTime.MinValue;
        public bool HasChanges => changes.Values.Any(state => state.HasValue);
        public readonly ActionConfirmation Confirmation = new ActionConfirmation();
        public VehicleController(Func<bool> allowed, Action<string, string> log) { this.allowed = allowed; this.log = log; }

        // This composite identity is also used for vehicle state: actor 0, entity handle,
        // model, memory address. A recycled handle alone never authorizes restoration.
        private static PlayerIdentity Identity(Vehicle vehicle) => new PlayerIdentity(0, vehicle.Handle, vehicle.Model.Hash, vehicle.MemoryAddress.ToInt64());
        private static PlayerIdentity ActorIdentity(Ped ped) => new PlayerIdentity(0, ped.Handle, ped.Model.Hash, ped.MemoryAddress.ToInt64());
        private void Guard() { if (!allowed()) throw new InvalidOperationException("故事模式守卫拒绝，未调用车辆接口。"); }
        private Vehicle Require(Vehicle vehicle, PlayerIdentity identity)
        {
            Guard();
            if (!vehicle.Exists() || !Identity(vehicle).Equals(identity)) throw new InvalidOperationException("车辆已消失或身份改变，未修改新实体。");
            return vehicle;
        }
        public Vehicle Current(Ped ped)
        {
            Guard();
            var currentPed = Game.Player.Character;
            if (currentPed == null || !currentPed.Exists() || !ped.Exists() || !ActorIdentity(currentPed).Equals(ActorIdentity(ped)))
                throw new InvalidOperationException("当前角色已变化，请重新选择操作。");
            var vehicle = currentPed.CurrentVehicle;
            if (vehicle == null || !vehicle.Exists()) throw new InvalidOperationException("请先进入有效车辆。");
            return vehicle;
        }
        private Vehicle AfterInput(Ped ped, PlayerIdentity actor, Vehicle vehicle, PlayerIdentity identity)
        {
            Guard();
            var currentPed = Game.Player.Character;
            if (currentPed == null || !currentPed.Exists() || !ActorIdentity(currentPed).Equals(actor)) throw new InvalidOperationException("输入期间角色已改变，未写入。");
            var current = Current(currentPed);
            if (!Identity(current).Equals(identity) || !VehicleRules.Parked(current.Speed)) throw new InvalidOperationException("输入期间换车或车辆移动，未写入。");
            return Require(vehicle, identity);
        }
        public void Suspend() { pending |= HasChanges; Confirmation.Clear(); }
        public void Tick(Ped ped)
        {
            Guard();
            var current = ped.CurrentVehicle;
            if (current == null || !current.Exists()) Confirmation.Clear();
            else Confirmation.Reconcile(true, Identity(current), DateTime.UtcNow);
            if (!HasChanges) return;
            if (current == null || !current.Exists() || !Identity(current).Equals(trackedIdentity)) pending = true;
            if (pending && DateTime.UtcNow >= nextRestore) Restore();
        }
        private bool Read(Vehicle vehicle, PlayerIdentity identity, string field)
        {
            var target = Require(vehicle, identity);
            switch (field)
            {
                case "invincible": return target.IsInvincible;
                case "engine": return target.IsEngineRunning;
                case "interior": return target.IsInteriorLightOn;
                default: throw new ArgumentException("未知车辆开关");
            }
        }
        private void Write(Vehicle vehicle, PlayerIdentity identity, string field, bool expected, bool desired)
        {
            var target = Require(vehicle, identity);
            if (Read(target, identity, field) != expected) throw new InvalidOperationException("车辆状态已被其他脚本修改，未覆盖。");
            switch (field)
            {
                case "invincible": target.IsInvincible = desired; break;
                case "engine": target.IsEngineRunning = desired; break;
                case "interior": target.IsInteriorLightOn = desired; break;
            }
        }
        public string Toggle(Ped ped, string field)
        {
            var current = Current(ped); var identity = Identity(current);
            if (HasChanges && !trackedIdentity.Equals(identity))
            {
                Restore();
                if (HasChanges) throw new InvalidOperationException("前一辆车仍有未恢复记录，先恢复后再修改新车。");
            }
            if (!HasChanges) { tracked = current; trackedIdentity = identity; changes.Clear(); pending = false; }
            if (!changes.TryGetValue(field, out var state)) { state = new OwnedBooleanState(); changes[field] = state; }
            var result = state.Set(true, identity, !Read(current, identity, field), () => Read(current, identity, field), (expected, desired) => Write(current, identity, field, expected, desired));
            return "车辆开关：" + result + "；读取=" + Read(current, identity, field);
        }
        public string Restore()
        {
            if (!HasChanges) return "没有待恢复的车辆开关。";
            if (!allowed()) { pending = true; return "故事模式守卫拒绝，车辆恢复未执行。"; }
            nextRestore = DateTime.UtcNow.AddSeconds(5);
            if (tracked == null || !tracked.Exists() || !Identity(tracked).Equals(trackedIdentity))
            {
                changes.Clear(); tracked = null; pending = false;
                log("车辆恢复未执行", "原车辆已消失或身份变化；未把旧状态写入新实体。");
                return "原车辆身份已变化，无法确认恢复。";
            }
            var summary = new List<string>();
            foreach (var change in changes)
            {
                var field = change.Key;
                try { summary.Add(field + "=" + change.Value.Restore(true, trackedIdentity, () => Read(tracked, trackedIdentity, field), (expected, desired) => Write(tracked, trackedIdentity, field, expected, desired))); }
                catch (Exception error) { summary.Add(field + "=未确认"); log("车辆恢复异常", error.Message); }
            }
            pending = HasChanges;
            var result = string.Join("; ", summary); log("车辆条件恢复", result); return result;
        }
        public string Doors(Ped ped, bool open)
        {
            var vehicle = Current(ped); var identity = Identity(vehicle);
            if (!VehicleRules.Parked(vehicle.Speed)) throw new InvalidOperationException("请先停车后操作车门。");
            var doors = vehicle.Doors.ToArray(); var requested = 0; var broken = 0;
            foreach (var door in doors)
            {
                Require(vehicle, identity);
                if (door.IsBroken) { broken++; continue; }
                if (open) door.Open(false, false); else door.Close(false);
                requested++;
            }
            if (requested == 0) return "没有可操作车门；损坏门 " + broken;
            Require(vehicle, identity);
            var openReadback = doors.Count(door => !door.IsBroken && door.IsOpen);
            return "门" + (open ? "打开" : "关闭") + "请求 " + requested + "；开启读回 " + openReadback + "；动画待观察";
        }
        public string Windows(Ped ped, bool down)
        {
            var vehicle = Current(ped); var identity = Identity(vehicle);
            if (!vehicle.Model.IsCar) throw new InvalidOperationException("当前车窗请求仅开放给汽车；无窗车型效果待验证。");
            if (down) Require(vehicle, identity).Windows.RollDownAllWindows();
            else foreach (var index in new[] { VehicleWindowIndex.FrontLeftWindow, VehicleWindowIndex.FrontRightWindow, VehicleWindowIndex.BackLeftWindow, VehicleWindowIndex.BackRightWindow })
            { Require(vehicle, identity).Windows[index].RollUp(); }
            return down ? "已请求降窗；SDK无升降位置读回。" : "已请求前后四窗升起；实际车型待观察。";
        }
        public string FixTires(Ped ped)
        {
            var vehicle = Current(ped); var identity = Identity(vehicle); var wheels = vehicle.Wheels.GetAllWheels();
            if (wheels.Length == 0) return "当前车辆未返回可维修车轮。";
            var requested = 0;
            foreach (var wheel in wheels)
            {
                Require(vehicle, identity);
                if (!wheel.IsBursted) continue;
                wheel.Fix(); requested++;
            }
            Require(vehicle, identity);
            return "修胎请求 " + requested + "；仍爆胎读回 " + wheels.Count(wheel => wheel.IsBursted) + "；外观待观察";
        }
        public string Upright(Ped ped)
        {
            var vehicle = Current(ped); var identity = Identity(vehicle); var point = vehicle.Position;
            if (vehicle.IsOnAllWheels) return "车辆已在车轮上，未调整。";
            if (!vehicle.Model.IsCar || !VehicleRules.Parked(vehicle.Speed) || !VehicleRules.NearGround(vehicle.HeightAboveGround)
                || !VehicleRules.Finite(point.X) || !VehicleRules.Finite(point.Y) || !VehicleRules.Finite(point.Z))
                throw new InvalidOperationException("车辆状态不适合翻正，未调整。");
            if (!World.GetGroundHeight(point + new Vector3(0, 0, 3), out var ground)) throw new InvalidOperationException("无法确认地面，未翻正。");
            var groundSamples = new List<float> { ground };
            foreach (var offset in new[] { new Vector3(2,0,3), new Vector3(-2,0,3), new Vector3(0,2,3), new Vector3(0,-2,3) })
            {
                Require(vehicle, identity);
                if (!World.GetGroundHeight(point + offset, out var height)) throw new InvalidOperationException("无法确认附近地形，未翻正。");
                groundSamples.Add(height);
            }
            var occupied = World.GetNearbyVehicles(point, 4).Any(other => other.Handle != vehicle.Handle)
                || World.GetNearbyPeds(point, 4).Any(other => other.Handle != ped.Handle);
            Require(vehicle, identity);
            if (!VehicleRules.CanReposition(vehicle.Model.IsCar, vehicle.Speed, vehicle.HeightAboveGround, ground - point.Z, groundSamples.Max() - groundSamples.Min(), occupied))
                throw new InvalidOperationException("仅允许停稳、低高度、平坦且周围无人的汽车翻正。");
            var rotation = vehicle.Rotation;
            if (!VehicleRules.Finite(rotation.Z)) throw new InvalidOperationException("车辆朝向无效。");
            vehicle.Rotation = new Vector3(0, 0, rotation.Z);
            return "已请求翻正；地面接触与碰撞结果仍需观察。";
        }
        public string Speed(Ped ped, int step)
        {
            var vehicle = Current(ped); var identity = Identity(vehicle);
            if (!vehicle.Model.IsCar || vehicle.Driver == null || vehicle.Driver.Handle != ped.Handle || !vehicle.IsOnAllWheels || !VehicleRules.NearGround(vehicle.HeightAboveGround))
                throw new InvalidOperationException("仅限玩家驾驶、接地的低速汽车。");
            var desired = VehicleRules.SpeedRequest(vehicle.Speed, step);
            // Entity.Speed scales the current velocity direction, which stays zero at rest.
            Require(vehicle, identity).ForwardSpeed = desired;
            return "速度请求 " + (desired * 3.6f).ToString("F1") + "km/h；读回 " + (Require(vehicle, identity).Speed * 3.6f).ToString("F1");
        }
        public string Once(Ped ped, string action)
        {
            var vehicle = Current(ped); var identity = Identity(vehicle);
            if (!VehicleRules.Parked(vehicle.Speed)) throw new InvalidOperationException("请停车后执行一次性设置。");
            if (!Confirmation.Confirm(action, identity, DateTime.UtcNow)) return "一次性设置不会自动恢复；再次执行确认。";
            Require(vehicle, identity);
            if (action == "performance")
            {
                vehicle.Mods.InstallModKit();
                log("一次性性能改装", "已调用安装改装套件；本操作不会自动恢复原套件/档位。");
                var slots = new[] { VehicleModType.Engine, VehicleModType.Brakes, VehicleModType.Transmission, VehicleModType.Armor, VehicleModType.Suspension };
                var applied = 0; var mismatched = 0; var unavailable = 0;
                foreach (var type in slots)
                {
                    Require(vehicle, identity);
                    var mod = vehicle.Mods[type];
                    if (!vehicle.Mods.Contains(type) || mod.Count <= 0) { unavailable++; continue; }
                    var index = mod.Count - 1; mod.Index = index;
                    var actual = Require(vehicle, identity).Mods[type].Index;
                    log("性能档位读回", type + " 请求=" + index + " 读回=" + actual);
                    if (actual == index) applied++; else mismatched++;
                }
                Require(vehicle, identity).Mods[VehicleToggleModType.Turbo].IsInstalled = true;
                var turbo = Require(vehicle, identity).Mods[VehicleToggleModType.Turbo].IsInstalled;
                log("涡轮请求读回", turbo.ToString());
                return "性能档位读回 " + applied + "/5；缺槽 " + unavailable + "；不匹配 " + mismatched + "；涡轮=" + turbo;
            }
            if (action == "suspension")
            {
                vehicle.Mods.InstallModKit(); var mod = Require(vehicle, identity).Mods[VehicleModType.Suspension];
                if (mod.Count <= 0) return "该车没有可用悬挂改装档位。";
                var next = VehicleRules.NextModIndex(mod.Index, mod.Count); mod.Index = next;
                return "悬挂档位请求 " + next + "；读回 " + Require(vehicle, identity).Mods[VehicleModType.Suspension].Index + "（-1为原厂）";
            }
            if (action == "lights")
            {
                var desired = !vehicle.AreLightsOn;
                vehicle.SetScriptedLightSetting(desired ? ScriptedVehicleLightSetting.SetVehicleLightsOn : ScriptedVehicleLightSetting.SetVehicleLightsOff);
                return "主灯强制请求 " + desired + "；实际灯读回 " + Require(vehicle, identity).AreLightsOn + "；原强制模式不可恢复";
            }
            throw new ArgumentException("未知一次性车辆操作。");
        }
        public string Paint(Ped ped, bool secondary)
        {
            var vehicle = Current(ped); var identity = Identity(vehicle); var actor = ActorIdentity(ped);
            if (!VehicleRules.Parked(vehicle.Speed)) throw new InvalidOperationException("请停车后更换颜色。");
            var input = Game.GetUserInput("FF0000");
            if (input == null) return "已取消改色，未写入。";
            var rgb = VehicleRules.PaintValue(input);
            var target = AfterInput(ped, actor, vehicle, identity); var color = Color.FromArgb((rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255);
            if (secondary) target.Mods.CustomSecondaryColor = color; else target.Mods.CustomPrimaryColor = color;
            target = Require(vehicle, identity);
            var actual = secondary ? target.Mods.CustomSecondaryColor : target.Mods.CustomPrimaryColor;
            var custom = secondary ? target.Mods.IsSecondaryColorCustom : target.Mods.IsPrimaryColorCustom;
            return "颜色读回 #" + (actual.ToArgb() & 0xffffff).ToString("X6") + "；自定义=" + custom + "；不自动恢复";
        }
        public string Plate(Ped ped)
        {
            var vehicle = Current(ped); var identity = Identity(vehicle); var actor = ActorIdentity(ped);
            if (!VehicleRules.Parked(vehicle.Speed)) throw new InvalidOperationException("请停车后更换车牌。");
            var input = Game.GetUserInput(vehicle.Mods.LicensePlate);
            if (input == null) return "已取消车牌修改，未写入。";
            var requested = VehicleRules.PlateValue(input);
            AfterInput(ped, actor, vehicle, identity).Mods.LicensePlate = requested;
            return "车牌实际读回：[" + Require(vehicle, identity).Mods.LicensePlate + "]；不自动恢复";
        }
    }
}
