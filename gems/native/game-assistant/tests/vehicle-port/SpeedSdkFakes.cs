// Only the speed boundary is exercised. Other SDK members exist to compile the
// unmodified production controller and throw if the regression reaches them.
// Speed semantics are pinned to SHVDNE v1.1.0.6 Entity.cs:743-769 and
// Vehicle.cs:1334-1347: Entity.Speed scales the current velocity direction;
// Vehicle.ForwardSpeed submits a vehicle-forward request, including at rest.
using System.Drawing;

namespace GTA.Math
{
    public readonly struct Vector3
    {
        public readonly float X, Y, Z;
        public Vector3(float x, float y, float z) { X=x; Y=y; Z=z; }
        public float Length => (float)System.Math.Sqrt(X*X+Y*Y+Z*Z);
        public Vector3 Normalized => Length == 0 ? this : this * (1 / Length);
        public static Vector3 operator *(Vector3 v,float f) => new(v.X*f,v.Y*f,v.Z*f);
        public static Vector3 operator +(Vector3 a,Vector3 b) => new(a.X+b.X,a.Y+b.Y,a.Z+b.Z);
        public static Vector3 operator -(Vector3 a,Vector3 b) => new(a.X-b.X,a.Y-b.Y,a.Z-b.Z);
    }
}
namespace GTA
{
    public class Entity
    {
        public int Handle { get; }
        public Model Model { get; set; } = new();
        public IntPtr MemoryAddress { get; set; }
        public bool Alive { get; set; } = true;
        public int GenericSpeedWrites { get; private set; }
        public Math.Vector3 Velocity { get; set; }
        public Math.Vector3 Position { get; set; }
        public Math.Vector3 Rotation { get; set; }
        public float Speed { get => Velocity.Length; set { GenericSpeedWrites++; Velocity=Velocity.Normalized*value; } }
        public Entity(int handle) { Handle=handle; MemoryAddress=new IntPtr(handle*16); }
        public bool Exists() => Alive;
    }
    public sealed class Model { public int Hash { get; set; }=100; public bool IsCar { get; set; }=true; }
    public sealed class Ped : Entity { public Ped(int handle):base(handle) {} public Vehicle? CurrentVehicle { get; set; } }
    public sealed class Player { public Ped Character { get; set; }=null!; }
    public static class Game
    {
        public static Player Player { get; }=new();
        public static string? GetUserInput(string text) => throw new NotSupportedException();
    }
    public sealed class Vehicle : Entity
    {
        public Vehicle(int handle):base(handle) {}
        public Ped? Driver { get; set; }
        public bool IsOnAllWheels { get; set; }=true;
        public float HeightAboveGround { get; set; }=.1f;
        public bool IsInvincible { get; set; }
        public bool IsEngineRunning { get; set; }
        public bool IsInteriorLightOn { get; set; }
        public bool AreLightsOn => throw new NotSupportedException();
        public int ForwardSpeedWrites { get; private set; }
        public float ForwardSpeed { set { ForwardSpeedWrites++; Velocity=new Math.Vector3(0,1,0)*value; } }
        public VehicleDoor[] Doors => throw new NotSupportedException();
        public VehicleWindows Windows => throw new NotSupportedException();
        public VehicleWheels Wheels => throw new NotSupportedException();
        public VehicleMods Mods => throw new NotSupportedException();
        public void SetScriptedLightSetting(ScriptedVehicleLightSetting value) => throw new NotSupportedException();
    }
    public sealed class VehicleDoor
    {
        public bool IsBroken => throw new NotSupportedException();
        public bool IsOpen => throw new NotSupportedException();
        public void Open(bool a,bool b) => throw new NotSupportedException();
        public void Close(bool a) => throw new NotSupportedException();
    }
    public enum VehicleWindowIndex { FrontLeftWindow,FrontRightWindow,BackLeftWindow,BackRightWindow }
    public sealed class VehicleWindows
    {
        public VehicleWindow this[VehicleWindowIndex index] => throw new NotSupportedException();
        public void RollDownAllWindows() => throw new NotSupportedException();
    }
    public sealed class VehicleWindow { public void RollUp() => throw new NotSupportedException(); }
    public sealed class VehicleWheels { public VehicleWheel[] GetAllWheels() => throw new NotSupportedException(); }
    public sealed class VehicleWheel { public bool IsBursted => throw new NotSupportedException(); public void Fix() => throw new NotSupportedException(); }
    public enum VehicleModType { Engine,Brakes,Transmission,Armor,Suspension }
    public enum VehicleToggleModType { Turbo }
    public enum ScriptedVehicleLightSetting { SetVehicleLightsOn,SetVehicleLightsOff }
    public sealed class VehicleMod { public int Count => throw new NotSupportedException(); public int Index { get; set; } }
    public sealed class VehicleToggleMod { public bool IsInstalled { get; set; } }
    public sealed class VehicleMods
    {
        public VehicleMod this[VehicleModType type] => throw new NotSupportedException();
        public VehicleToggleMod this[VehicleToggleModType type] => throw new NotSupportedException();
        public void InstallModKit() => throw new NotSupportedException();
        public bool Contains(VehicleModType type) => throw new NotSupportedException();
        public Color CustomSecondaryColor { get; set; }
        public Color CustomPrimaryColor { get; set; }
        public bool IsSecondaryColorCustom => throw new NotSupportedException();
        public bool IsPrimaryColorCustom => throw new NotSupportedException();
        public string LicensePlate { get; set; }="";
    }
    public static class World
    {
        public static bool GetGroundHeight(Math.Vector3 p,out float ground) { ground=0; throw new NotSupportedException(); }
        public static Vehicle[] GetNearbyVehicles(Math.Vector3 p,float radius) => throw new NotSupportedException();
        public static Ped[] GetNearbyPeds(Math.Vector3 p,float radius) => throw new NotSupportedException();
    }
}
