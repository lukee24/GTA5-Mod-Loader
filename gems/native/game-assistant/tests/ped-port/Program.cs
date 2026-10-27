using System.Collections;
using System.Reflection;
using System.Text.Json;
using Gems.GameAssistant;
using GTA;

var root=Path.GetFullPath(args[0]);Directory.CreateDirectory(root);var observations=new List<object>();int failed=0;
void Expect(bool c,string text){if(!c)throw new Exception(text);}
void Case(string id,Action a){try{a();observations.Add(new{id,passed=true});Console.WriteLine("PASS "+id);}catch(Exception ex){failed++;observations.Add(new{id,passed=false,error=ex.ToString()});Console.WriteLine("FAIL "+id+": "+ex);}}
bool Reject(Action a){try{a();return false;}catch{return true;}}
Fixture Make()=>new();

Case("G01 exact named create once and no implicit model request",()=>{
 var f=Make();var t=f.Ready();var r=f.Port.Create(t,()=>{});Expect(r.State=="created-observed"&&r.NativeIssued&&r.CallReturned&&r.Eligible,"Create readback failed");Expect(Shim.Calls.Count(c=>c=="CREATE_PED")==1,"Expected one create");Expect(!Shim.Calls.Contains("REQUEST_MODEL"),"Create submitted hidden request");Expect(Reject(()=>f.Port.Create(t,()=>{})),"Consumed ticket replay accepted");Expect(Shim.Calls.Count(c=>c=="CREATE_PED")==1,"Replay submitted native");
});
Case("G02 independent collision is required",()=>{
 var f=Make();var t=f.Ready();Shim.Collision=false;var r=f.Port.Create(t,()=>{});Expect(!r.NativeIssued&&Shim.Calls.All(c=>c!="CREATE_PED"),"Created while only model loaded");
});
Case("G03 nonblocking model and collision request are separate",()=>{
 var f=Make();f.Port.Request(f.Session,1);Expect(Shim.Calls.SequenceEqual(new[]{"REQUEST_MODEL","REQUEST_COLLISION_FOR_MODEL"}),"Unexpected request sequence");
});
Case("G04 safe position false is not valid out coordinate",()=>{var f=Make();Shim.Nav=false;Expect(Reject(()=>f.Site()),"False navmesh treated as valid");Expect(Shim.Calls.Count==0,"Issued probe/native after navmesh refusal");});
Case("G05 ground false NaN and steep slope reject",()=>{
 foreach(var mode in new[]{"false","nan","slope"}){var f=Make();if(mode=="false")Shim.Ground=false;if(mode=="nan")Shim.GroundZ=float.NaN;if(mode=="slope")Shim.NormalZ=.5f;Expect(Reject(()=>f.Site()),"Bad ground accepted: "+mode);Expect(!Shim.Calls.Contains("CREATE_PED"),"Created on bad ground");}
});
Case("G06 pending shape is never clear and Ready cannot be read twice",()=>{
 var f=Make();var p=f.Port.StartProbe(f.Session,f.Site());Shim.ProbeStatus=ShapeTestStatus.NotReady;Expect(f.Port.PollProbe(f.Session,p).State=="pending","Pending misreported clear");Shim.ProbeStatus=ShapeTestStatus.Ready;Expect(f.Port.PollProbe(f.Session,p).State=="ready-clear","Ready not read");Expect(Reject(()=>f.Port.PollProbe(f.Session,p)),"Ready read twice");
});
Case("G07 blocked or invalid shape cannot create",()=>{
 foreach(var invalid in new[]{false,true}){var f=Make();var p=f.Port.StartProbe(f.Session,f.Site());Shim.ProbeHit=!invalid;Shim.ProbeStatus=invalid?ShapeTestStatus.Invalid:ShapeTestStatus.Ready;var seen=f.Port.PollProbe(f.Session,p);var reservation=f.Quota.Reserve("ped",1);var t=new PedCreateTicket(f.Session,f.Choice,p,reservation,0);var r=f.Port.Create(t,()=>{});Expect(!r.NativeIssued&&Shim.Calls.All(x=>x!="CREATE_PED"),"Bad probe allowed create "+seen.State);}
});
Case("G08 changed actor in source callback rejects native",()=>{
 var f=Make();var t=f.Ready();var r=f.Port.Create(t,()=>Game.PlayerValue.CharacterValue=new Ped(3,777,new GTA.Math.Vector3()));Expect(!r.NativeIssued&&Shim.Calls.All(x=>x!="CREATE_PED"),"Stale actor passed source callback");
});
Case("G09 changed capacity at final admission rejects",()=>{
 var f=Make();var t=f.Ready();Shim.Capacity=10;var r=f.Port.Create(t,()=>{});Expect(!r.NativeIssued&&Shim.Calls.All(x=>x!="CREATE_PED"),"Insufficient final capacity accepted");
});
Case("G10 create returned zero remains unknown and charged",()=>{
 var f=Make();var t=f.Ready();Shim.CreateZero=true;var r=f.Port.Create(t,()=>{});Expect(r.NativeIssued&&r.CallReturned&&r.State=="unknown"&&!r.Eligible&&f.Quota.Charged==1,"Zero result misreported safe/retryable");
});
Case("G11 create effect then throw keeps unknown charge",()=>{
 var f=Make();var t=f.Ready();Shim.OnCreate=()=>throw new IOException("CREATE_POST_EFFECT");var r=f.Port.Create(t,()=>{});Expect(r.NativeIssued&&!r.CallReturned&&r.State=="unknown"&&r.Reason.Contains("CREATE_POST_EFFECT")&&f.Quota.Charged==1,"Side effect failure lost");Expect(Shim.Entities.Count==2,"Fixture side effect did not occur");
});
Case("G12 visible ownership loss permanently revokes cleanup",()=>{
 var f=Make();var r=f.Port.Create(f.Ready(),()=>{});var target=(Ped)Shim.Entities.Values.Single(x=>x.Handle>=50);target.Owned=false;Expect(Reject(()=>f.Port.ReadCreated(f.Session,r)),"Ownership loss was not rejected");target.Owned=true;Expect(Reject(()=>f.Port.ReadCreated(f.Session,r)),"Cleanup authority revived after observed loss");var d=f.Port.Delete(f.Session,r);Expect(!d.Issued&&!Shim.Calls.Contains("DELETE_ENTITY"),"Deleted revoked receipt");
});
Case("G13 handle address change revokes old receipt",()=>{
 var f=Make();var r=f.Port.Create(f.Ready(),()=>{});var target=(Ped)Shim.Entities.Values.Single(x=>x.Handle>=50);target.AddressValue++;var d=f.Port.Delete(f.Session,r);Expect(!d.Issued&&!r.Eligible&&!Shim.Calls.Contains("DELETE_ENTITY"),"Deleted address-reused entity");
});
Case("G14 occupied attached combat ragdoll frozen moving or player is not cleaned",()=>{
 foreach(var mode in new[]{"occupied","attached","combat","ragdoll","frozen","moving","player"}){var f=Make();var r=f.Port.Create(f.Ready(),()=>{});var p=(Ped)Shim.Entities.Values.Single(x=>x.Handle>=50);if(mode=="occupied")p.InVehicle=true;if(mode=="attached")p.Attached=true;if(mode=="combat")p.Combat=true;if(mode=="ragdoll")p.Ragdoll=true;if(mode=="frozen")p.Frozen=true;if(mode=="moving")p.SpeedValue=2;if(mode=="player")p.PlayerFlag=true;var d=f.Port.Delete(f.Session,r);Expect(!d.Issued&&!Shim.Calls.Contains("DELETE_ENTITY"),"Deleted disallowed state: "+mode);}
});
Case("G15 clean uses direct named delete with actual absence readback",()=>{
 var f=Make();var r=f.Port.Create(f.Ready(),()=>{});f.Quota.End(r.Reservation);var d=f.Port.Delete(f.Session,r);Expect(d.Issued&&d.Absent&&r.Deleted&&f.Quota.Charged==0,"Normal delete readback/charge failed");Expect(Shim.Calls.Count(c=>c=="DELETE_ENTITY")==1,"Delete count wrong");Expect(Shim.Calls.All(c=>!c.Contains("MISSION")&&!c.Contains("TASK")),"Cleanup took over entity");
});
Case("G16 delete return without absence never releases charge",()=>{
 var f=Make();var r=f.Port.Create(f.Ready(),()=>{});f.Quota.End(r.Reservation);Shim.DeleteRemains=true;var d=f.Port.Delete(f.Session,r);Expect(d.Issued&&!d.Absent&&!r.Deleted&&!r.Eligible&&f.Quota.Charged==1,"Remaining object marked deleted or charge cleared");
});
Case("G17 session loss never revives old cleanup",()=>{
 var f=Make();var r=f.Port.Create(f.Ready(),()=>{});f.Eligible=false;Expect(!f.Port.TrySession(out _),"Ineligible accepted");f.Eligible=true;Expect(f.Port.TrySession(out var renewed)&&!renewed.Equals(f.Session),"Same actor reused broken session epoch");var d=f.Port.Delete(renewed,r);Expect(!d.Issued&&!Shim.Calls.Contains("DELETE_ENTITY"),"Lost-session receipt deleted");
});
Case("G18 completed blocked probe history stays bounded",()=>{
 var f=Make();for(int i=0;i<128;i++){var p=f.Port.StartProbe(f.Session,f.Site());Shim.ProbeHit=true;Expect(f.Port.PollProbe(f.Session,p).State=="blocked","Fixture not blocked");}
 var count=((IDictionary)typeof(GtaPedPort).GetField("probes",BindingFlags.NonPublic|BindingFlags.Instance)!.GetValue(f.Port)!).Count;Console.WriteLine("retained terminal blocked probes="+count);Expect(count<=16,"Completed blocked probe history unbounded: "+count);
});
File.WriteAllText(Path.Combine(root,"results.json"),JsonSerializer.Serialize(new{checkedAt=DateTime.UtcNow,observations,failed,gameplayVerified=false,boundary="Actual production GtaPedPort/PedContracts/SpawnQuota. All GTA/native/model/shape/entity surfaces are independent recording substitutes, not a game host."},new JsonSerializerOptions{WriteIndented=true}));Console.WriteLine($"Final cases={observations.Count}, failed={failed}");return failed==0?0:1;

sealed class Fixture
{
 public readonly SpawnQuota Quota=new();public readonly GtaPedPort Port;public readonly PedSession Session;public readonly PedChoice Choice=new("builtin-fixture","fixture",1,"v1","builtin",true,"fixture");public bool Eligible=true;public long Clock=100;
 public Fixture(){Shim.Reset();Port=new GtaPedPort(()=>Eligible,Quota,()=>Clock);if(!Port.TrySession(out Session))throw new Exception("Fixture session failed");}
 public PedSite Site()=>Port.FindSite(Session,Port.ReadModel(Session,Choice),0,Array.Empty<PedSite>());
 public PedCreateTicket Ready(){var site=Site();var p=Port.StartProbe(Session,site);if(Port.PollProbe(Session,p).State!="ready-clear")throw new Exception("Fixture probe not clear");return new PedCreateTicket(Session,Choice,p,Quota.Reserve("ped",1),0);}
}
