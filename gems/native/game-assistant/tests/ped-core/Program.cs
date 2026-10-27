using System.Reflection;
using System.Text.Json;
using Gems.GameAssistant;

var root=Path.GetFullPath(args[0]);Directory.CreateDirectory(root);
var observations=new List<object>();var failures=new List<string>();
void Case(string id,Action action){try{action();observations.Add(new{id,passed=true});Console.WriteLine("PASS "+id);}catch(Exception ex){failures.Add(id+": "+ex.Message);observations.Add(new{id,passed=false,error=ex.ToString()});Console.WriteLine("FAIL "+id+": "+ex);}}
void Expect(bool condition,string detail){if(!condition)throw new Exception(detail);}
Fixture Make(string label)=>new Fixture(Path.Combine(root,label));

Case("P01 same frame and repeated confirmation do not duplicate single create",()=>{
 var f=Make("same-frame");f.Start(1);f.Controller.Tick(1);f.Controller.Tick(1);Expect(f.Port.Creates==0,"Preparation created an entity");f.Controller.Tick(2);f.Controller.Tick(2);f.Controller.Tick(3);
 Expect(f.Port.Creates==1&&f.Controller.Results.Count==1,"Expected one actual submitted create");Expect(f.Quota.Charged==1,"Observed object charge lost");Expect(f.Journal.Unconfirmed==0,"Normal audit unconfirmed");
});
Case("P02 side effect then throw stays unknown and never replayed",()=>{
 var f=Make("after-native");f.Port.ThrowAfterCreate=true;f.Start(1);f.Controller.Tick(1);f.Controller.Tick(2);var error=f.Controller.TakeError()??"";
 f.Controller.Tick(3);f.Controller.Cancel("cancel");f.Controller.Suspend("suspend");f.Controller.Tick(4);
 Expect(f.Port.Creates==1,"Create was retried or never issued");Expect(f.Quota.Charged==1,"Unknown submitted object charge lost");Expect(f.Controller.Results.Single().NativeIssued&&f.Controller.Results.Single().State=="unknown","Submission result misclassified");Expect(error.Contains("CREATE_SIDE_EFFECT_EXCEPTION"),"Original create exception missing");
});
Case("P03 final source change rejects before actual create",()=>{
 var f=Make("source-change");f.Port.BeforeFinal=()=>f.SourceValid=false;f.Start(1);f.Controller.Tick(1);f.Controller.Tick(2);
 Expect(f.Port.Creates==0,"Native issued after source invalidation");Expect(f.Quota.Charged==0,"Unsubmitted reservation remained charged");Expect(f.Controller.Results.Single().State=="not-submitted","Refusal misclassified");
});
Case("P04 create intention write fails before actual create",()=>{
 var f=Make("intent-fail");f.Start(1);f.Controller.Tick(1);f.Inner.Hook=stage=>{if(stage.StartsWith("written:")&&stage.EndsWith(".intent"))throw new IOException("CREATE_INTENT_IO_EXCEPTION");};f.Controller.Tick(2);
 Expect(f.Port.Creates==0,"Created after failed intent durability");Expect(f.Quota.Charged==0,"Unsubmitted reservation lost cleanup");Expect((f.Controller.TakeError()??"").Contains("CREATE_INTENT_IO_EXCEPTION"),"Original intent failure missing");
});
Case("P05 result write failure stops remaining batch without replay",()=>{
 var f=Make("result-fail");f.Start(4);f.Controller.Tick(1);f.Inner.Hook=stage=>{if(stage=="before-result")throw new IOException("CREATE_RESULT_IO_EXCEPTION");};f.Controller.Tick(2);f.Controller.Tick(3);f.Controller.Cancel("cancel");
 Expect(f.Port.Creates==1,"Result failure did not stop batch");Expect(f.Quota.Charged==1,"Submitted charge lost");Expect(f.Controller.Results.Single().AuditDurable==false,"Undurable result called durable");Expect((f.Controller.TakeError()??"").Contains("CREATE_RESULT_IO_EXCEPTION"),"Original result failure missing");
});
Case("P06 partial batch cancellation keeps first object and releases remaining slots",()=>{
 var f=Make("partial");f.Start(4);f.Controller.Tick(1);f.Controller.Tick(2);f.Controller.Cancel("user cancel");f.Controller.Tick(3);
 Expect(f.Port.Creates==1&&f.Controller.Results.Count==1,"Partial first item repeated/lost");Expect(f.Quota.Charged==1,"Remaining reservations not released or submitted lost");Expect(f.Port.Deletes==0,"Cancellation implicitly deleted object");
});
Case("P07 cleanup result journal failure must remain visible",()=>{
 var f=Make("cleanup-result-fail");f.Start(1);f.Controller.Tick(1);f.Controller.Tick(2);var r=f.Controller.Results.Single();f.Controller.Cleanup(r.Id);
 f.Inner.Hook=stage=>{if(stage=="before-result")throw new IOException("DELETE_RESULT_IO_EXCEPTION");};var notice=f.Controller.Cleanup(r.Id);var error=f.Controller.TakeError()??"";
 Expect(f.Port.Deletes==1&&r.Deleted,"Delete side effect was not observed");Expect(f.Journal.Unconfirmed==1,"Missing cleanup result was falsely confirmed");Expect(error.Contains("DELETE_RESULT_IO_EXCEPTION"),"Original delete result exception missing");
 Console.WriteLine("cleanup observed notice="+notice+"; unconfirmed="+f.Journal.Unconfirmed+"; oldCreationAudit="+r.AuditDurable);
 Expect(notice.Contains("日志")&&(notice.Contains("未确认")||notice.Contains("失败")),"Notice hides failed cleanup audit behind successful delete result: "+notice);
});
Case("P08 cleanup intent failure must prevent delete",()=>{
 var f=Make("cleanup-intent-fail");f.Start(1);f.Controller.Tick(1);f.Controller.Tick(2);var r=f.Controller.Results.Single();f.Controller.Cleanup(r.Id);
 f.Inner.Hook=stage=>{if(stage.StartsWith("written:")&&stage.EndsWith(".intent"))throw new IOException("DELETE_INTENT_IO_EXCEPTION");};f.Controller.Cleanup(r.Id);
 Expect(f.Port.Deletes==0,"Delete called despite intent failure");Expect(f.Quota.Charged==1,"Unchanged object charge released");Expect((f.Controller.TakeError()??"").Contains("DELETE_INTENT_IO_EXCEPTION"),"Original delete intent exception missing");
});
Case("P09 primary create error survives secondary release failure",()=>{
 var f=Make("create-release-fail");f.Port.ThrowAfterCreate=true;f.Port.ThrowRelease=true;f.Start(1);f.Controller.Tick(1);f.Controller.Tick(2);var error=f.Controller.TakeError()??"";
 Expect(error.Contains("CREATE_SIDE_EFFECT_EXCEPTION")&&error.Contains("MODEL_RELEASE_EXCEPTION"),"Original or cleanup exception lost: "+error);Expect(f.Port.Creates==1&&f.Quota.Charged==1,"Submitted unknown not conservatively retained");
});
Case("P10 ineligible suspend releases only unsubmitted reservation without game cleanup",()=>{
 var f=Make("suspend");f.Start(4);f.Port.Eligible=false;f.Controller.Suspend("guard rejected");f.Controller.Tick(1);Expect(f.Port.Creates==0&&f.Port.Releases==0&&f.Quota.Charged==0,"Ineligible suspend used game cleanup or leaked unsubmitted slots");
});
File.WriteAllText(Path.Combine(root,"results.json"),JsonSerializer.Serialize(new{checkedAt=DateTime.UtcNow,observations,failures,gameplayVerified=false,boundary="Actual production PedController/PedOperationJournal/WeaponJournal and real Windows files. IPedPort uses explicit side-effect recording substitute; no GTA API executed."},new JsonSerializerOptions{WriteIndented=true}));
Console.WriteLine($"Final cases={observations.Count}, failed={failures.Count}");return failures.Count==0?0:1;

sealed class Fixture
{
 public readonly SpawnQuota Quota=new();public readonly Port Port;public readonly PedOperationJournal Journal;public readonly WeaponJournal Inner;public readonly PedController Controller;
 public bool SourceValid=true;public long Clock=100;
 public readonly PedChoice Choice=new("builtin-fixture","fixture",1,"fixture-v1","builtin",true,"fixture");
 public Fixture(string path){Journal=new PedOperationJournal(path);Inner=(WeaponJournal)typeof(PedOperationJournal).GetField("journal",BindingFlags.NonPublic|BindingFlags.Instance)!.GetValue(Journal)!;Port=new Port(Quota);Controller=new PedController(Port,Journal,Quota,_=>{if(!SourceValid)throw new InvalidOperationException("SOURCE_CHANGED");},()=>Clock);}
 public void Start(int count){Controller.PrepareOrConfirm(Choice,count);Controller.PrepareOrConfirm(Choice,count);if(!Controller.Pending)throw new Exception("Fixture batch did not start: "+Controller.Notice+" "+Controller.TakeError());}
}
sealed class Port : IPedPort
{
 readonly SpawnQuota quota;public int Creates,Deletes,Releases;public bool Eligible=true,ThrowAfterCreate,ThrowRelease;long epoch;public Action? BeforeFinal;
 public Port(SpawnQuota quota){this.quota=quota;}
 public bool TrySession(out PedSession s){s=new PedSession(new PlayerIdentity(1,2,3,4),"fixture-build",epoch);return Eligible;}
 public void ForgetSession(){epoch++;}
 public PedModelState ReadModel(PedSession s,PedChoice c)=>new(){Recognized=true,Human=true,Loaded=true,Collision=true,Radius=.3f,Height=1.8f};
 public void Request(PedSession s,uint hash){}
 public void Release(PedSession s,uint hash){Releases++;if(ThrowRelease)throw new IOException("MODEL_RELEASE_EXCEPTION");}
 public void CheckPool(PedSession s,int remaining){}
 public PedSite FindSite(PedSession s,PedModelState m,int ordinal,IReadOnlyList<PedSite> p)=>new(new PedPoint(ordinal*5,7,1),0,m.Radius,m.Height,100);
 public PedProbe StartProbe(PedSession s,PedSite site)=>new(Guid.NewGuid().ToString("N"),site);
 public PedProbeResult PollProbe(PedSession s,PedProbe p)=>new(){State="ready-clear"};
 public PedReceipt Create(PedCreateTicket t,Action check){BeforeFinal?.Invoke();check();if(t.Consumed)throw new Exception("Ticket replay");t.Consumed=true;quota.Issue(t.Reservation,t.Index);t.NativeIssued=true;Creates++;if(ThrowAfterCreate)throw new IOException("CREATE_SIDE_EFFECT_EXCEPTION");return new PedReceipt(t){NativeIssued=true,CallReturned=true,Eligible=true,State="created-observed",Reason="Fixture created",Handle=10+Creates,Address=100+Creates};}
 public string ReadCreated(PedSession s,PedReceipt r)=>"fixture style";
 public PedCleanupResult Delete(PedSession s,PedReceipt r){Deletes++;r.Eligible=false;r.Deleted=true;r.State="deleted-observed";quota.ConfirmDeleted(r.Reservation,r.Index);return new(){Issued=true,Absent=true,Reason="已观察原对象消失；不表示完整世界恢复。"};}
}
