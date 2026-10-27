using Gems.GameAssistant;
namespace GTA
{
    [Flags] public enum GetSafePositionFlags { NotIsolated=1,NotInterior=2,NotWater=4 }
    public enum IntersectFlags { Everything=-1 }
    public enum ShapeTestOptions { Default=0 }
    public enum ShapeTestStatus { Invalid=0,NotReady=1,Ready=2 }
    public struct ShapeTestResult { public bool DidHit; }
    public struct ShapeTestHandle { public ShapeTestStatus GetResult(out ShapeTestResult result){result=new ShapeTestResult{DidHit=PedFixture.Blocked};return PedFixture.ProbeStatus;} }
    public static class ShapeTest { public static ShapeTestHandle StartTestCapsule(Math.Vector3 a,Math.Vector3 b,float r,IntersectFlags f,Entity? ignore,ShapeTestOptions o){PedFixture.Calls.Add("StartProbe");return new ShapeTestHandle();} }
    public sealed class PedFixtureComponent { public string Type="torso";public int Index=1,Count=2,TextureIndex,TextureCount=1; }
    public sealed class PedFixtureProp { public string AnchorPoint="head";public int Index,Count=1,TextureIndex,TextureCount; }
    public sealed class PedFixtureStyle { public PedFixtureComponent[] GetAllComponents()=>new[]{new PedFixtureComponent()};public PedFixtureProp[] GetAllProps()=>new[]{new PedFixtureProp()}; }
    public static class PedFixture
    {
        public static bool Loaded,Collision,Blocked,SafeGround=true,CreateZero;public static int Count=10,Capacity=100,Next=1000;
        public static readonly Dictionary<int,Vehicle> Vehicles=new();public static readonly List<string> Calls=new();public static Action? OnCreate;
        public static ShapeTestStatus ProbeStatus=ShapeTestStatus.Ready;
        public static void Clear(){Loaded=Collision=Blocked=CreateZero=false;SafeGround=true;Count=10;Capacity=100;Next=1000;Calls.Clear();Vehicles.Clear();OnCreate=null;ProbeStatus=ShapeTestStatus.Ready;}
        public static int Create(GTA.Native.Hash hash,object[] args)
        {
            Calls.Add(hash.ToString());if(CreateZero){OnCreate?.Invoke();return 0;}var handle=Next++;
            if(hash==GTA.Native.Hash.CREATE_PED){if(args.Length!=8||(int)args[0]!=26||(bool)args[6]||(bool)args[7])throw new Exception("Bad named CREATE_PED signature");var ped=new Ped{Handle=handle,Model=new Model(unchecked((int)(uint)args[1])),MemoryAddress=(IntPtr)(handle*100),Position=new Math.Vector3((float)args[2],(float)args[3],(float)args[4])};Runtime.Peds[handle]=ped;}
            else{if(args.Length!=7||(bool)args[5]||(bool)args[6])throw new Exception("Bad named CREATE_VEHICLE signature");Vehicles[handle]=new Vehicle{Handle=handle,Model=new Model((int)args[0])};}
            OnCreate?.Invoke();return handle;
        }
        public static void Delete(int handle){Calls.Add("DELETE_ENTITY");if(Runtime.Peds.TryGetValue(handle,out var p))p.Alive=false;else if(Vehicles.TryGetValue(handle,out var v))v.Alive=false;}
    }
}
