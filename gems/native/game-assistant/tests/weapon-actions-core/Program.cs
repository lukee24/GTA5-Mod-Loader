using Gems.GameAssistant;
using System.Security.Cryptography;

int checks=0;var now=DateTime.UtcNow;
void Check(bool ok,string why){checks++;if(!ok)throw new Exception("FAIL "+why);}
(ActionPort p,ActionJournal j,WeaponActionsController c,List<string> revoked) Setup(){var p=new ActionPort();var j=new ActionJournal();var revoke=new List<string>();return(p,j,new WeaponActionsController(p,j,revoke.Add),revoke);}
void Twice(WeaponActionsController c,string action,uint weapon=0,uint component=0,int value=0){var d=weapon==0?"":(c.Snapshot?.Find(weapon)?.Definition??"");c.Execute(action,weapon,component,value,d,now);c.Execute(action,weapon,component,value,d,now);}
{
 var(p,j,c,r)=Setup();c.Refresh();c.Execute("clear",0,0,0,"",now);
 Check(p.Writes.Count==0&&c.Confirmation=="clear","clear first confirm never writes");
 c.Execute("clear",0,0,0,"",now);Check(p.Writes.SequenceEqual(new[]{"clear"})&&c.Pending,"clear submits once and waits");
 Check(j.Events.SequenceEqual(new[]{"begin:clear"})&&r.Count==1,"intent before submission, old authority revoked");
 c.Tick(now);Check(c.Pending,"first post-observation cannot finish");
 c.Tick(now.AddMilliseconds(1));Check(!c.Pending&&j.Events.Last()=="finish:observed-not-game-tested","two post ticks audit observed clear");
 c.Tick(now.AddSeconds(10));Check(p.Writes.Count==1,"finished clear never replays");
 Twice(c,"clear");Check(p.Writes.Count==1,"only unarmed is a real no-op");
}
foreach(var end in new[]{"cancel","suspend","timeout","guard"})
{
 var(p,j,c,r)=Setup();p.NoEffect=end=="timeout";c.Refresh();Twice(c,"clear");
 if(end=="cancel")c.Cancel("hidden");else if(end=="suspend")c.Suspend("abort");else if(end=="timeout")c.Tick(now.AddSeconds(4));else{p.Allowed=false;c.Tick(now);}
 Check(!c.Pending&&j.Events.Last()=="finish:unknown-partial","pending clear finalizes intent on "+end);
 Check(p.Writes.Count==1&&j.Events.Count(e=>e.StartsWith("finish:"))==1,"no repeated clear/finish on "+end);
 c.Cancel("again");c.Tick(now.AddSeconds(5));Check(p.Writes.Count==1,"later frames do not replay "+end);
}
{
 var(p,j,c,r)=Setup();p.State.Find(5)!.MaxAmmo=WeaponReading<int>.Unknown("melee not supported");p.State.Find(5)!.Clip=WeaponReading<int>.Unknown("no clip");c.Refresh();Twice(c,"clear");
 Check(p.Writes.Contains("clear"),"optional unreadable ammo does not block clear");
}
{
 var(p,j,c,r)=Setup();c.Refresh();j.OnBegin=()=>throw new IOException("intent");Twice(c,"clear");
 Check(p.Writes.Count==0&&r.Count==0&&!c.Pending,"intent failure neither writes nor revokes old authority");
}
{
 var(p,j,c,r)=Setup();c.Refresh();j.OnBegin=()=>p.State.Current=5;Twice(c,"clear");
 Check(p.Writes.Count==0&&r.Count==0&&j.Events.Last()=="finish:not-submitted","changed inventory during intent rejects before native");
}
{
 var(p,j,c,r)=Setup();c.Refresh();p.ThrowAfter=true;Twice(c,"clear");
 Check(p.State.Items.Length==1&&p.Writes.Count==1,"clear throw may follow actual removal");
 Check(!c.Pending&&j.Events.Last()=="finish:unknown-partial","clear throw closes audit as unknown");
 c.Tick(now);Check(p.Writes.Count==1,"clear throw not retried");
}
foreach(var action in new[]{"clip-on","clip-off","pool-on","pool-off"})
{
 var(p,j,c,r)=Setup();c.Refresh();Twice(c,action,action.StartsWith("pool")?5u:0u);
 var request=c.Requests.Single();Check(request.Desired==action.EndsWith("on")&&request.ActualState=="unknown","explicit requested value independent from actual "+action);
 Check(request.Submission=="returned"&&request.AuditDurable&&p.Writes.Count==1,"request call returned and audit separate "+action);
 c.Cancel("close");c.Tick(now);c.Suspend("abort");
 Check(p.Writes.Count==1&&!request.CurrentSession&&c.LastResult.Contains("可能仍生效"),"no implicit false/replay on close/abort "+action);
}
{
 var(p,j,c,r)=Setup();c.Refresh();j.OnFinish=()=>throw new IOException("result");Twice(c,"clip-off");
 var request=c.Requests.Single();Check(request.Submission=="returned"&&!request.AuditDurable&&request.ActualState=="unknown","returned flag survives result journal failure without fake success");
 Check(p.Writes.SequenceEqual(new[]{"clip:False"}),"explicit off only once despite audit error");
}
{
 var(p,j,c,r)=Setup();c.Refresh();j.OnBegin=()=>p.State.Find(5)!.AmmoType=WeaponReading<uint>.Of(99);Twice(c,"pool-on",5);
 Check(p.Writes.Count==0,"pool type changed in durable intent rejects");
}
{
 var(p,j,c,r)=Setup();c.Refresh();c.Inspect(5);Twice(c,"component-install",5,11);
 Check(p.State.Find(5)!.Find(11)!.Installed&&!p.State.Find(5)!.Find(12)!.Installed,"single component can replace observed sibling");
 var record=c.Changes.Single();Check(record.Eligible&&record.After.Find(5)!.Find(12)!.Installed==false,"observed replacement recorded for conditional restoration");
 c.PreviewRestore(record.Id,now);Check(p.Writes.Count==1,"restore first confirm does not mutate");
 c.PreviewRestore(record.Id,now);
 Check(p.State.Find(5)!.Find(12)!.Installed&&!p.State.Find(5)!.Find(11)!.Installed,"inverse removes own addition then reinstalls old sibling");
 Check(record.Restored&&!record.Eligible&&p.Writes.Count==3,"restore exact observed state, old ticket consumed");
 c.PreviewRestore(record.Id,now);c.PreviewRestore(record.Id,now);Check(p.Writes.Count==3,"restored ticket cannot replay");
}
{
 var(p,j,c,r)=Setup();c.Refresh();c.Inspect(5);Twice(c,"component-remove",5,12);
 var record=c.Changes.Single();p.State.Find(5)!.Ammo=WeaponReading<int>.Of(19);
 c.PreviewRestore(record.Id,now);c.PreviewRestore(record.Id,now);Check(p.Writes.Count==1,"external ammo change rejects component restore");
}
{
 var(p,j,c,r)=Setup();c.Refresh();c.Inspect(5);Twice(c,"tint",5,0,2);var record=c.Changes.Single();
 Check(record.Eligible&&p.State.Find(5)!.Tint.Value==2,"actual weapon tint action records previous known value");
 c.PreviewRestore(record.Id,now);c.PreviewRestore(record.Id,now);Check(record.Restored&&p.State.Find(5)!.Tint.Value==0,"conditional tint restoration uses captured value");
}
{
 var(p,j,c,r)=Setup();c.Refresh();c.Inspect(5);p.NoEffect=true;Twice(c,"component-remove",5,12);
 Check(!c.Changes.Single().Eligible&&j.Events.Last()=="finish:unknown-partial","void component no effect cannot become success");
}
{
 var(p,j,c,r)=Setup();c.Refresh();c.Inspect(5);Twice(c,"component-install",5,11);
 var record=c.Changes.Single();int starts=0;j.OnBegin=()=>{if(++starts==2)throw new IOException("second restore step");};
 c.PreviewRestore(record.Id,now);c.PreviewRestore(record.Id,now);
 Check(p.Writes.Count==2&&!p.State.Find(5)!.Find(11)!.Installed&&!p.State.Find(5)!.Find(12)!.Installed,"multi-step restore stops after first success when second intent fails");
 Check(!record.Restored&&!record.Eligible,"partial inverse never claims restored and cannot reuse ticket");
 Check(c.LastResult.Contains("1")||c.TakeError()!=null,"partial inverse remains diagnosable");
}
{
 var(p,j,c,r)=Setup();c.Refresh();c.Inspect(5);var menu=new WeaponActionsMenu(c);
 menu.Execute("wa-inventory",0,now);var row=menu.Rows().First(x=>x.Key.StartsWith("wa-item:"));menu.Execute(row.Key,0,now);
 Check(menu.Page==2,"menu selects stable weapon hash");
 menu.Execute("wa-components",0,now);var component=menu.Rows().First(x=>x.Key.StartsWith("wa-component:"));menu.Execute(component.Key,0,now);
 Check(menu.Page==4&&menu.Rows().Any(x=>x.Key=="wa-livery"&&x.Value.Contains("未知")),"actual component page exposes raw and unknown restore colour");
 menu.Execute("wa-install",1,now);Check(p.Writes.Count==0,"numeric arrows do not convert unknown flags into writes");
 menu.Execute("wa-install",0,now);menu.Cancel();menu.Execute("wa-install",0,now);Check(p.Writes.Count==0,"leaving row invalidates first confirmation");
}
{
 var(p,j,c,r)=Setup();c.Refresh();var menu=new WeaponActionsMenu(c);menu.Execute("wa-inventory",0,now);menu.Execute(menu.Rows().First(x=>x.Key.StartsWith("wa-item:")).Key,0,now);
 c.Snapshot!.Find(5)!.ComponentsKnown=false;c.Snapshot.Find(5)!.ComponentIssue="components:elapsed-budget-75ms";
 Check(menu.Execute("wa-components",0,now).Contains("75毫秒")&&menu.Page==2&&p.Writes.Count==0,"component timeout visible through real menu without partial editing");
 c.Snapshot.Find(5)!.ComponentIssue="components:global-definitions-exceed-1024";
 Check(menu.Execute("wa-components",0,now).Contains("1024项")&&menu.Page==2,"definition limit has specific visible reason");
}
{
 var(p,j,c,r)=Setup();c.Refresh();Twice(c,"clip-on");c.Inspect(5);Twice(c,"component-install",5,11);
 var record=c.Changes.Single();int finishes=0;j.OnFinish=()=>{if(++finishes==2)throw new IOException("second inverse result failed");};
 c.PreviewRestore(record.Id,now);c.PreviewRestore(record.Id,now);
 Check(c.LastResult.Contains("已完成 1 步")&&c.LastResult.Contains("未回滚")&&c.LastResult.Contains("可能仍生效"),"partial inverse progress survives older infinite request warning");
 Check(c.TakeError()?.Contains("second inverse result failed")==true,"result failure original diagnostic retained with restore context");
 var message=c.LastResult;c.Suspend("repeat");Check(c.LastResult==message,"repeated suspension does not duplicate persistent warning");
}
var area=Path.Combine(Path.GetFullPath("native/game-assistant/artifacts"),"0.1.84-stage7-core-fixtures",Guid.NewGuid().ToString("N"));Directory.CreateDirectory(area);
{
 var journal=new WeaponJournal(Path.Combine(area,"mixed"));var legacy=new WeaponSnapshot{Session=new WeaponSession(new PlayerIdentity(1,2,3,4),0)};
 var id=journal.Begin("ammo",legacy,5,1,"runtime:5");journal.Finish(id,"not-submitted",null,"fixture");var oldFiles=Directory.GetFiles(Path.Combine(area,"mixed")).ToDictionary(f=>f,f=>SHA256.HashData(File.ReadAllBytes(f)));
 var next=journal.BeginAction("clip-on","known+unknown","explicit request");journal.FinishAction(next,"request-returned-effect-unknown",null,"flag unknown");
 new WeaponJournal(Path.Combine(area,"mixed")).Verify();Check(oldFiles.All(p=>SHA256.HashData(File.ReadAllBytes(p.Key)).SequenceEqual(p.Value)),"real mixed v1/v2 reader preserves old bytes");
 var port=new ActionPort();var c=new WeaponActionsController(port,journal,_=>{});c.Refresh();Twice(c,"clear");c.Cancel("hide");
 Check(journal.UnconfirmedCount==1,"real pending clear audit remains unknown after hide");
 var reopened=new WeaponJournal(Path.Combine(area,"mixed"));reopened.Verify();Check(reopened.UnconfirmedCount==1,"real canceled pending intent readable on restart");
 // Write exclusive locks released after cancellation, no leaked pinned open intent.
 foreach(var path in Directory.GetFiles(Path.Combine(area,"mixed")))using(File.Open(path,FileMode.Open,FileAccess.ReadWrite,FileShare.None)){}
 Check(true,"all real intent handles released after clear cancel");
 var before=Directory.GetFiles(Path.Combine(area,"mixed")).Length;
 try{journal.BeginAction("oversize",new string('中',400000),"budget");Check(false,"oversize rejected");}catch(InvalidDataException){Check(Directory.GetFiles(Path.Combine(area,"mixed")).Length==before,"UTF8+base64 oversized intent creates no file");}
 var result=journal.BeginAction("result-size","before","test");try{journal.FinishAction(result,"observed-not-game-tested",new string('中',400000),"big");Check(false,"result limit");}catch(InvalidDataException){Check(true,"oversized result rejected");}
 reopened=new WeaponJournal(Path.Combine(area,"mixed"));reopened.Verify();Check(reopened.UnconfirmedCount==2,"oversized result leaves readable unknown intent");
}
{
 var dir=Path.Combine(area,"copied-intent");var journal=new WeaponJournal(dir);var id=journal.BeginAction("clip-on","before","explicit");
 journal.FinishAction(id,"unknown-partial",null,"fixture closes handle");
 File.Copy(Path.Combine(dir,id+".intent"),Path.Combine(dir,id+".result"),true);
 try{new WeaponJournal(dir).Verify();Check(false,"copied intent cannot count as completion");}
 catch(InvalidDataException){Check(true,"real copied intent with valid checksum rejected by result phase contract");}
}
Console.WriteLine("STAGE7 ACTION CORE: "+checks+" assertions passed. Production controller/menu/journal; game boundary fake; no gameplay PASS. Fixtures "+area);

