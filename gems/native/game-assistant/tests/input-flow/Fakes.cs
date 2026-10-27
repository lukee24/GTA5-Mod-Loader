using System.Windows.Forms;
using Gems.GameAssistant;

namespace GTA
{
    // Test-only ASCII hash port. Real fixed-SDK hash vectors are exercised by weapon-catalog.
    public static class StringHash
    {
        public static uint AtStringHashUtf8(string value, uint seed)
        {
            uint hash=seed;
            foreach(var b in System.Text.Encoding.UTF8.GetBytes(value.ToLowerInvariant())) { hash+=b; hash+=hash<<10; hash^=hash>>6; }
            hash+=hash<<3; hash^=hash>>11; hash+=hash<<15; return hash;
        }
    }
    public class Script
    {
        public int Interval;
        public event EventHandler? Tick, Aborted;
        public event KeyEventHandler? KeyDown, KeyUp;
        public void RaiseTick() => Tick?.Invoke(this, EventArgs.Empty);
        public void RaiseDown(Keys key) => KeyDown?.Invoke(this, new KeyEventArgs(key));
        public void RaiseUp(Keys key) => KeyUp?.Invoke(this, new KeyEventArgs(key));
        public void RaiseAbort() => Aborted?.Invoke(this, EventArgs.Empty);
    }
    public static class Game
    {
        public static Player Player = new Player();
        public static bool Allowed = true, IsPaused;
        public static Version FileVersion=>new Version(1,0,1158,16);public static int FrameCount=>GtaInputPort.Frame.Number;
        public static List<string> MotionCalls = new List<string>();
        public static Action<string>? DuringMotion;
        public static HashSet<Keys> Held = new HashSet<Keys>();
        public static bool IsKeyPressed(Keys key) => Held.Contains(key);
        public static string UserText = ""; public static Action? DuringUserInput;
        public static string GetUserInput(string initial) { DuringUserInput?.Invoke(); return UserText; }
    }
    public class Player
    {
        public int Handle = 1, MaxArmor = 100;
        public Ped Character = new Ped();
        public bool IsInvincible;
        public Wanted Wanted = new Wanted();
        private void Submit(string value) { Game.MotionCalls.Add(value); Game.DuringMotion?.Invoke(value); }
        public void SetSuperJumpThisFrame() => Submit("jump");
        public void SetRunSpeedMultThisFrame(float value) => Submit("run:" + value.ToString("F3", System.Globalization.CultureInfo.InvariantCulture));
        public void SetSwimSpeedMultThisFrame(float value) => Submit("swim:" + value.ToString("F3", System.Globalization.CultureInfo.InvariantCulture));
    }
    public class Wanted
    {
        public int WantedLevel;
        public void SetWantedLevel(int value, bool delayed) { WantedLevel = value; }
        public void ApplyWantedLevelChangeNow(bool delayed) { }
    }
    public class Entity { public static Entity? FromHandle(int handle)=>Runtime.Peds.TryGetValue(handle,out var ped)?ped:PedFixture.Vehicles.TryGetValue(handle,out var v)?v:null; }
    public class Ped : Entity
    {
        public int Handle = 2, Health = 90, MaxHealth = 100, Armor;
        public int HandleValue => Handle;
        public readonly Dictionary<uint, Item> Items = new(); public readonly Dictionary<uint, int> Pools = new();
        public uint CurrentValue = (uint)WeaponHash.Unarmed; public uint[]? HashOverride;
        public WeaponCollection Weapons { get; }
        public Ped() { Weapons = new WeaponCollection(this); Runtime.Peds[Handle] = this; Items[(uint)WeaponHash.Unarmed] = new Item { Hash = (uint)WeaponHash.Unarmed }; }
        public Model Model = new Model(3);
        public IntPtr MemoryAddress = new IntPtr(4000);
        public bool IsDead, IsVisible = true;
        public Vehicle CurrentVehicle = new Vehicle();
        public Math.Vector3 Position, ForwardVector;
        public float Heading;
        public bool Alive=true,IsPlayer,IsPersistent=true,IsOwnedByShvdnScript=true,IsInCombat,IsRagdoll,IsPositionFrozen;public float Speed;public bool Attached,InVehicle;public bool IsAttached()=>Attached;public bool IsInVehicle()=>InVehicle;public PedFixtureStyle Style=new PedFixtureStyle();
        public bool Exists() => Alive;
    }
    public class Vehicle : Entity
    {
        public bool IsEngineRunning, IsInvincible;
        public float Speed, EngineHealth = 500, BodyHealth = 500, DirtLevel = 8;
        public int Handle = 5;
        public Model Model = new Model(100);
        public bool Alive=true;public bool Exists() => Alive;
        public void Repair() { EngineHealth = BodyHealth = 1000; VehicleController.Calls.Add("repair"); }
    }
    public struct Model
    {
        public int Hash;
        public Model(int hash) { Hash = hash; }
        public Model(string name) { Hash = name.GetHashCode(); }
        public bool IsValid => true;
        public bool IsInCdImage => true;
        public bool IsVehicle => true;
        public bool IsLoaded => PedFixture.Loaded;public bool IsPed=>true;public bool IsHumanPed=>true;public bool IsAnimalPed=>false;public bool IsCollisionLoaded=>PedFixture.Collision;
        public void GetDimensions(out Math.Vector3 min,out Math.Vector3 max){min=new Math.Vector3(-.2f,-.2f,0);max=new Math.Vector3(.2f,.2f,1.8f);}
        public void RequestCollision(){PedFixture.Calls.Add("RequestCollision");}
        public void Request() { PedFixture.Calls.Add("RequestModel"); }
        public void MarkAsNoLongerNeeded() { }
    }
    public static class World
    {
        public static int PedCount=>PedFixture.Count;public static int PedCapacity=>PedFixture.Capacity;public static int VehicleCount=>0;public static int VehicleCapacity=>100;
        public static bool GetSafePositionForPed(Math.Vector3 p,out Math.Vector3 safe,GetSafePositionFlags flags){safe=p;return PedFixture.SafeGround;}
        public static bool GetGroundHeightAndNormal(Math.Vector3 p,out float ground,out Math.Vector3 normal){ground=0;normal=new Math.Vector3(0,0,1);return PedFixture.SafeGround;}
        public static Entity[] GetNearbyEntities(Math.Vector3 p,float radius)=>PedFixture.Blocked?new Entity[]{Game.Player.Character}:Array.Empty<Entity>();
        public static bool GetGroundHeight(Math.Vector3 p, out float ground) { ground = 0; return true; }
        public static Vehicle[] GetNearbyVehicles(Math.Vector3 p, float radius) => Array.Empty<Vehicle>();
        public static Ped[] GetNearbyPeds(Math.Vector3 p, float radius) => Array.Empty<Ped>();
        public static Vehicle CreateVehicle(Model model, Math.Vector3 p, float heading) => new Vehicle();
    }
}
namespace GTA.Math
{
    public struct Vector3
    {
        public float X, Y, Z;
        public Vector3(float x, float y, float z) { X = x; Y = y; Z = z; }
        public static Vector3 operator +(Vector3 a, Vector3 b) => new Vector3(a.X+b.X,a.Y+b.Y,a.Z+b.Z);
        public static Vector3 operator *(Vector3 a, float b) => new Vector3(a.X*b,a.Y*b,a.Z*b);
    }
}
namespace GTA.Native
{
    public enum Hash { NETWORK_IS_GAME_IN_PROGRESS, NETWORK_IS_SESSION_ACTIVE, NETWORK_IS_SESSION_STARTED, GET_IS_LOADING_SCREEN_ACTIVE, GET_PED_AMMO_TYPE_FROM_WEAPON, GET_PED_AMMO_BY_TYPE, GET_AMMO_IN_CLIP, GET_MAX_AMMO, ADD_AMMO_TO_PED, DOES_WEAPON_TAKE_WEAPON_COMPONENT, IS_PED_WEAPON_COMPONENT_ACTIVE, GET_PED_WEAPON_COMPONENT_TINT_INDEX, CREATE_PED, CREATE_VEHICLE, DELETE_ENTITY }
    public sealed class OutputArgument : IDisposable { public object Value = 0;public OutputArgument(){}public OutputArgument(int value){Value=value;} public T GetResult<T>() => (T)Value; public void Dispose() { } }
    public static class Function
    {
        public static T Call<T>(Hash hash, params object[] args) => hash==Hash.CREATE_PED||hash==Hash.CREATE_VEHICLE?(T)(object)PedFixture.Create(hash,args):args.Length == 0 ? (T)(object)!GTA.Game.Allowed : WeaponNative.Call<T>(hash,args);
        public static void Call(Hash hash,params object[] args){if(hash==Hash.DELETE_ENTITY){PedFixture.Delete(((OutputArgument)args[0]).GetResult<int>());return;}WeaponNative.Call(hash,args);}
    }
}
namespace Gems.GameAssistant
{
    // Fixture-only environment substitutes constructor paths and host identity, never the production dispatcher.
    public static class Environment
    {
        public enum SpecialFolder { LocalApplicationData }
        private static string FixtureRoot()
        {
            var d = new DirectoryInfo(AppContext.BaseDirectory);
            while (d != null && !Directory.Exists(Path.Combine(d.FullName,"gems-acceptance","gems"))) d = d.Parent;
            return Path.Combine(d == null ? Path.GetTempPath() : Path.Combine(d.FullName,".oss-private"),"flow81-"+Guid.NewGuid().ToString("N").Substring(0,8));
        }
        public static string Root = FixtureRoot();
        public static string GetFolderPath(SpecialFolder f) => Root;
        public static string NewLine => System.Environment.NewLine;
    }
    public class Process : IDisposable
    {
        public string ProcessName => "GTA5_Enhanced"; public static Process GetCurrentProcess() => new Process();
        public static string ExecutableFile = ""; public Module MainModule => new Module(); public void Dispose() {}
        public class Module { public string FileName => ExecutableFile; }
    }
    public class GtaInputPort
    {
        private readonly Func<bool> allowed;
        public static InputFrame Frame = new InputFrame();
        public static bool Focused = true;
        public static int Suppressions;
        public static Action? AfterRead;
        public GtaInputPort(Func<bool> allowed) { this.allowed = allowed; }
        public bool Eligible() => Focused && !GTA.Game.IsPaused && allowed();
        public InputFrame Read(string session) { Frame.Eligible = Eligible(); Frame.Session = session; AfterRead?.Invoke(); return Frame; }
        public void Suppress(InputProfile profile) { if (Eligible()) Suppressions++; }
    }
    internal class ChinesePanel
    {
        public static bool Legible = true;
        public static string ActionHint = "", NavigationHint = "", Detail = "";
        public static MenuRow[] Rows = Array.Empty<MenuRow>();
        public ChinesePanel(string directory) { }
        public bool Draw(string title, string subtitle, MenuRow[] rows, MenuViewport viewport, string notice, string detail = "", string navigationHint = "", string actionHint = "")
        { Rows = rows; ActionHint = actionHint; NavigationHint = navigationHint; Detail = detail; return Legible; }
    }
    public class ConfirmationFake { public string Key = ""; public void Clear() { Key = ""; } }
    public class VehicleController
    {
        public static List<string> Calls = new List<string>();
        public static Action? DuringText;
        public ConfirmationFake Confirmation = new ConfirmationFake();
        public bool HasChanges => false;
        public VehicleController(Func<bool> allowed, Action<string,string> log) { }
        public void Tick(GTA.Ped ped) { }
        public void Suspend() { Confirmation.Clear(); }
        public string Restore() => "restore";
        public GTA.Vehicle Current(GTA.Ped ped) => ped.CurrentVehicle;
        private string Call(string value) { Calls.Add(value); return value; }
        public string Speed(GTA.Ped ped,int delta) => Call("speed:"+delta);
        public string Toggle(GTA.Ped ped,string key) => Call(key);
        public string Upright(GTA.Ped ped) => Call("upright");
        public string Doors(GTA.Ped ped,bool open) => Call("doors:"+open);
        public string Windows(GTA.Ped ped,bool down) => Call("windows:"+down);
        public string Once(GTA.Ped ped,string key) { if (Confirmation.Key != key) { Confirmation.Key=key; return "confirm"; } Confirmation.Clear(); return Call(key); }
        public string Paint(GTA.Ped ped,bool secondary) { DuringText?.Invoke(); return Call("paint:"+secondary); }
        public string Plate(GTA.Ped ped) { DuringText?.Invoke(); return Call("plate"); }
        public string FixTires(GTA.Ped ped) => Call("tires");
    }
    public class GtaWorldPort
    {
        public GtaWorldPort(Func<bool> allowed,Action<string,string> log,SpawnQuota? quota=null) { }
        public void ForgetSession() { }
        public bool TrySession(out WorldSession session) { session=default; return false; }
        public PlayerIdentity TrackCreated(WorldSession session,GTA.Vehicle vehicle,string reservation="") => default;
    }
    public class WorldController
    {
        public WorldView View = new WorldView();
        public static List<string> Calls = new List<string>();
        public WorldController(GtaWorldPort port) { }
        public void Tick() { }
        public void Suspend() { }
        public void Abort() { }
        public void ClearConfirmation() { }
        public void RegisterManaged(WorldSession session,PlayerIdentity identity) { }
        public string Execute(string key,int delta=0) { Calls.Add(key+":"+delta); return "world called"; }
    }
}
