using System;
using System.Collections.Generic;

namespace GTA.Math
{
 public struct Vector3
 {
  public float X,Y,Z;public Vector3(float x,float y,float z){X=x;Y=y;Z=z;}
  public static Vector3 operator +(Vector3 a,Vector3 b)=>new(a.X+b.X,a.Y+b.Y,a.Z+b.Z);
 }
}
namespace GTA
{
 using GTA.Math;
 public static class Shim
 {
  public static readonly Dictionary<int,Entity> Entities=new();public static readonly List<string> Calls=new();public static readonly List<string> Reads=new();
  public static Action<string>? OnRead;public static Action? OnCreate;public static Action? OnDelete;public static bool Loaded=true,Collision=true,Human=true,Animal=false,Recognized=true,Nav=true,Ground=true,Nearby=false,CreateZero=false,DeleteRemains=false;
  public static ShapeTestStatus ProbeStatus=ShapeTestStatus.Ready;public static bool ProbeHit;public static int Count=10,Capacity=100,Next=50,ProbeNext=1;
  public static float GroundZ=0,NormalZ=1;public static Vector3 Min=new(-.2f,-.2f,0),Max=new(.2f,.2f,1.8f);
  public static void Read(string key){Reads.Add(key);OnRead?.Invoke(key);}
  public static void Reset(){Entities.Clear();Calls.Clear();Reads.Clear();OnRead=null;OnCreate=null;OnDelete=null;Loaded=Collision=Human=Recognized=Nav=Ground=true;Animal=Nearby=CreateZero=DeleteRemains=ProbeHit=false;ProbeStatus=ShapeTestStatus.Ready;Count=10;Capacity=100;Next=50;ProbeNext=1;GroundZ=0;NormalZ=1;Min=new(-.2f,-.2f,0);Max=new(.2f,.2f,1.8f);Game.PlayerValue=new Player{Handle=1,CharacterValue=new Ped(2,777,new Vector3(0,0,0))};}
 }
 public static class Game
 {
  public static Player PlayerValue=new();public static Player Player{get{Shim.Read("Game.Player");return PlayerValue;}}
  public static Version FileVersion{get{Shim.Read("Game.FileVersion");return new Version(1,0,1,0);}}
 }
 public sealed class Player
 {
  public int Handle;public Ped CharacterValue=null!;public Ped Character{get{Shim.Read("Player.Character");return CharacterValue;}}
 }
 public class Entity
 {
  public int Handle;public int ModelHash;public bool Alive=true,Persistent=true,Owned=true;public long AddressValue;public Vector3 PositionValue;
  public Entity(int handle,int model,Vector3 position){Handle=handle;ModelHash=model;AddressValue=handle*100;PositionValue=position;Shim.Entities[handle]=this;}
  public bool Exists(){Shim.Read("Entity.Exists:"+Handle);return Alive;}
  public IntPtr MemoryAddress{get{Shim.Read("Entity.Address:"+Handle);return (IntPtr)AddressValue;}}
  public Model Model{get{Shim.Read("Entity.Model:"+Handle);return new Model(ModelHash);}}
  public Vector3 Position{get{Shim.Read("Entity.Position:"+Handle);return PositionValue;}}
  public bool IsPersistent{get{Shim.Read("Entity.Persistent:"+Handle);return Persistent;}}
  public bool IsOwnedByShvdnScript{get{Shim.Read("Entity.Owned:"+Handle);return Owned;}}
  public static Entity? FromHandle(int handle){Shim.Read("Entity.FromHandle");return Shim.Entities.TryGetValue(handle,out var e)?e:null;}
 }
 public sealed class Ped : Entity
 {
  public bool PlayerFlag,Dead,Attached,InVehicle,Combat,Ragdoll,Frozen;public float SpeedValue,HeadingValue;public readonly PedStyle StyleValue=new();
  public Ped(int handle,int model,Vector3 position):base(handle,model,position){}
  public bool IsDead{get{Shim.Read("Ped.Dead:"+Handle);return Dead;}}
  public bool IsPlayer{get{Shim.Read("Ped.Player:"+Handle);return PlayerFlag;}}
  public bool IsInCombat{get{Shim.Read("Ped.Combat:"+Handle);return Combat;}}
  public bool IsRagdoll{get{Shim.Read("Ped.Ragdoll:"+Handle);return Ragdoll;}}
  public bool IsPositionFrozen{get{Shim.Read("Ped.Frozen:"+Handle);return Frozen;}}
  public float Speed{get{Shim.Read("Ped.Speed:"+Handle);return SpeedValue;}}
  public float Heading{get{Shim.Read("Ped.Heading:"+Handle);return HeadingValue;}}
  public bool IsAttached(){Shim.Read("Ped.Attached:"+Handle);return Attached;}
  public bool IsInVehicle(){Shim.Read("Ped.InVehicle:"+Handle);return InVehicle;}
  public PedStyle Style{get{Shim.Read("Ped.Style:"+Handle);return StyleValue;}}
 }
 public sealed class PedStyle
 {
  public Component[] GetAllComponents(){Shim.Read("Style.Components");return Array.Empty<Component>();}
  public Prop[] GetAllProps(){Shim.Read("Style.Props");return Array.Empty<Prop>();}
 }
 public sealed class Component {public string Type="fixture";public int Index,Count,TextureIndex,TextureCount;}
 public sealed class Prop {public string AnchorPoint="fixture";public int Index,Count,TextureIndex,TextureCount;}
 public readonly struct Model
 {
  public readonly int Hash;public Model(int hash){Hash=hash;}
  public bool IsValid{get{Shim.Read("Model.Valid");return Shim.Recognized;}}
  public bool IsInCdImage{get{Shim.Read("Model.CdImage");return Shim.Recognized;}}
  public bool IsPed{get{Shim.Read("Model.Ped");return Shim.Recognized;}}
  public bool IsHumanPed{get{Shim.Read("Model.Human");return Shim.Human;}}
  public bool IsAnimalPed{get{Shim.Read("Model.Animal");return Shim.Animal;}}
  public bool IsLoaded{get{Shim.Read("Model.Loaded");return Shim.Loaded;}}
  public bool IsCollisionLoaded{get{Shim.Read("Model.Collision");return Shim.Collision;}}
  public void GetDimensions(out Vector3 min,out Vector3 max){Shim.Read("Model.Dimensions");min=Shim.Min;max=Shim.Max;}
  public void Request(){Shim.Calls.Add("REQUEST_MODEL");}
  public void RequestCollision(){Shim.Calls.Add("REQUEST_COLLISION_FOR_MODEL");}
  public void MarkAsNoLongerNeeded(){Shim.Calls.Add("RELEASE_MODEL");}
 }
 [Flags]public enum GetSafePositionFlags{NotIsolated=1,NotInterior=2,NotWater=4}
 [Flags]public enum IntersectFlags{Everything=-1}
 public enum ShapeTestOptions{Default=0}
 public enum ShapeTestStatus{Invalid=0,NotReady=1,Ready=2}
 public struct ShapeTestResult{public bool DidHit;}
 public readonly struct ShapeTestHandle
 {
  public readonly int Id;public ShapeTestHandle(int id){Id=id;}
  public ShapeTestStatus GetResult(out ShapeTestResult result){Shim.Read("Probe.Result");result=new(){DidHit=Shim.ProbeHit};return Shim.ProbeStatus;}
 }
 public static class ShapeTest
 {
  public static ShapeTestHandle StartTestCapsule(Vector3 bottom,Vector3 top,float radius,IntersectFlags flags,Entity? ignored,ShapeTestOptions options){Shim.Calls.Add("START_CAPSULE");return new(Shim.ProbeNext++);}
 }
 public static class World
 {
  public static int PedCount{get{Shim.Read("World.PedCount");return Shim.Count;}}
  public static int PedCapacity{get{Shim.Read("World.PedCapacity");return Shim.Capacity;}}
  public static bool GetSafePositionForPed(Vector3 desired,out Vector3 safe,GetSafePositionFlags flags){Shim.Read("World.SafePosition");safe=desired;return Shim.Nav;}
  public static bool GetGroundHeightAndNormal(Vector3 p,out float height,out Vector3 normal){Shim.Read("World.Ground");height=Shim.GroundZ;normal=new(0,0,Shim.NormalZ);return Shim.Ground;}
  public static Entity[] GetNearbyEntities(Vector3 p,float radius){Shim.Read("World.Nearby");return Shim.Nearby?new Entity[]{Game.PlayerValue.CharacterValue}:Array.Empty<Entity>();}
 }
}
namespace GTA.Native
{
 using GTA.Math;
 public enum Hash{CREATE_PED,DELETE_ENTITY}
 public sealed class OutputArgument:IDisposable{public readonly int Value;public OutputArgument(int value){Value=value;}public void Dispose(){}}
 public static class Function
 {
  public static T Call<T>(Hash hash,params object[] args)
  {
   if(hash!=Hash.CREATE_PED)throw new Exception("Unsupported named call");GTA.Shim.Calls.Add("CREATE_PED");
   if(args.Length!=8||(int)args[0]!=26||(bool)args[6]||(bool)args[7])throw new Exception("Incorrect CREATE_PED parameters");
   if(GTA.Shim.CreateZero){GTA.Shim.OnCreate?.Invoke();return (T)(object)0;}
   var handle=GTA.Shim.Next++;_ =new GTA.Ped(handle,unchecked((int)(uint)args[1]),new Vector3((float)args[2],(float)args[3],(float)args[4]));GTA.Shim.OnCreate?.Invoke();return (T)(object)handle;
  }
  public static void Call(Hash hash,params object[] args)
  {
   if(hash!=Hash.DELETE_ENTITY)throw new Exception("Unsupported named call");GTA.Shim.Calls.Add("DELETE_ENTITY");var handle=((OutputArgument)args[0]).Value;
   if(!GTA.Shim.DeleteRemains)GTA.Shim.Entities[handle].Alive=false;GTA.Shim.OnDelete?.Invoke();
  }
 }
}
