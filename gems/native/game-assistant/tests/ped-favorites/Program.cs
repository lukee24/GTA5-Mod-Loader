using System.Text.Json;
using System.Runtime.InteropServices;
using Gems.GameAssistant;

var root=Path.GetFullPath(args[0]);Directory.CreateDirectory(root);var checks=new List<object>();var failed=0;
void Case(string id,Action action){try{action();checks.Add(new{id,passed=true});Console.WriteLine("PASS "+id);}catch(Exception ex){failed++;checks.Add(new{id,passed=false,error=ex.ToString()});Console.WriteLine("FAIL "+id+": "+ex);}}
void Expect(bool c,string message){if(!c)throw new Exception(message);}
bool Reject(Action a){try{a();return false;}catch{return true;}}
PedChoice Choice(string id="builtin:a",string token="builtin-v1:00000001")=>new(id,"fixture",1,token,"builtin",true,"fixture");
Case("F01 empty read writes nothing",()=>{var dir=Path.Combine(root,"empty");var s=new PedFavoriteStore(dir);var r=s.Read();Expect(r.Revision=="empty"&&r.Entries.Count==0&&!Directory.Exists(dir),"Empty read created a fake saved state");});
Case("F02 one favorite can be removed and empty history remains readable",()=>{
 var dir=Path.Combine(root,"remove-last");var s=new PedFavoriteStore(dir);var first=s.Toggle("empty",Choice());Expect(first.Has(Choice()),"Initial favorite not saved");var second=s.Toggle(first.Revision,Choice());Expect(second.Entries.Count==0&&!second.Has(Choice()),"Last favorite not removed");var reread=new PedFavoriteStore(dir).Read();Expect(reread.Entries.Count==0&&reread.Revision==second.Revision,"Empty history did not survive fresh reader");
});
Case("F03 unrelated toggle retains first identity and stale token does not bind",()=>{
 var dir=Path.Combine(root,"multiple");var s=new PedFavoriteStore(dir);var first=s.Toggle("empty",Choice());var second=s.Toggle(first.Revision,Choice("catalog:b","revision-b"));Expect(second.Has(Choice())&&second.Has(Choice("catalog:b","revision-b")),"Other entry lost");Expect(!second.Has(Choice("catalog:b","revision-c")),"Same id stale token silently rebound");
});
Case("F04 stale revision fails while prior bytes remain",()=>{
 var dir=Path.Combine(root,"revision");var s=new PedFavoriteStore(dir);var first=s.Toggle("empty",Choice());var file=Directory.GetFiles(dir,"*.txt").Single();var before=File.ReadAllBytes(file);Expect(Reject(()=>s.Toggle("empty",Choice("catalog:b","other"))),"Stale revision accepted");Expect(before.SequenceEqual(File.ReadAllBytes(file))&&Directory.GetFiles(dir,"*.txt").Length==1,"Prior history changed");Expect(s.Read().Revision==first.Revision,"Prior revision unreadable");
});
Case("F05 bad history remains and is not reset",()=>{
 var dir=Path.Combine(root,"corrupt");var s=new PedFavoriteStore(dir);s.Toggle("empty",Choice());var file=Directory.GetFiles(dir,"*.txt").Single();File.WriteAllText(file,"FOREIGN CORRUPT HISTORY");Expect(Reject(()=>s.Read())&&Reject(()=>s.Toggle("empty",Choice())),"Bad history accepted/reset");Expect(File.ReadAllText(file)=="FOREIGN CORRUPT HISTORY","Bad history removed or replaced");
});
Case("F06 publish hook failure keeps old active revision and foreign files",()=>{
 var dir=Path.Combine(root,"publish-fail");var s=new PedFavoriteStore(dir);var first=s.Toggle("empty",Choice());s.BeforePublish=()=>throw new IOException("FAVORITE_PUBLISH_HOOK_EXCEPTION");Expect(Reject(()=>s.Toggle(first.Revision,Choice("catalog:b","other"))),"Publish fault ignored");var r=new PedFavoriteStore(dir).Read();Expect(r.Revision==first.Revision&&r.Has(Choice())&&!r.Has(Choice("catalog:b","other")),"Failed publish changed active state");Expect(Directory.GetFiles(dir,"*.tmp").Length==1,"Expected owned incomplete file retained for diagnosis");
});
Case("F07 outstanding exclusive transaction rejects concurrent reader",()=>{
 var dir=Path.Combine(root,"concurrent");var s=new PedFavoriteStore(dir);var first=s.Toggle("empty",Choice());var rejected=false;s.BeforePublish=()=>{rejected=Reject(()=>new PedFavoriteStore(dir).Read());};var r=s.Toggle(first.Revision,Choice("catalog:b","other"));Expect(rejected&&r.Entries.Count==2,"Concurrent exclusive lock not enforced");
});
Case("F08 open owned temporary cannot be overwritten or renamed externally",()=>{
 var dir=Path.Combine(root,"temp-replacement");var s=new PedFavoriteStore(dir);var first=s.Toggle("empty",Choice());var writeBlocked=false;var renameBlocked=false;
 s.BeforePublish=()=>{var temp=Directory.GetFiles(dir,"*.tmp").Single();writeBlocked=Reject(()=>File.WriteAllText(temp,"FOREIGN REPLACEMENT"));renameBlocked=Reject(()=>File.Move(temp,temp+".foreign"));};
 var result=s.Toggle(first.Revision,Choice("catalog:b","other"));Expect(writeBlocked&&renameBlocked,"Owned open temporary did not block foreign replacement");Expect(result.Entries.Count==2&&Directory.GetFiles(dir,"*.tmp.foreign").Length==0,"Publication did not preserve intended identity");
});
Case("F09 failure never deletes a foreign allowed temporary",()=>{
 var dir=Path.Combine(root,"foreign-temp");var s=new PedFavoriteStore(dir);var first=s.Toggle("empty",Choice());var foreign=Path.Combine(dir,"ped-favorites-foreign.tmp");File.WriteAllText(foreign,"USER FOREIGN TEMP");
 s.BeforePublish=()=>throw new IOException("EXPECTED_PUBLISH_REFUSAL");Expect(Reject(()=>s.Toggle(first.Revision,Choice("catalog:b","other"))),"Fault did not fire");Expect(File.ReadAllText(foreign)=="USER FOREIGN TEMP","Foreign temporary was deleted/replaced");Expect(new PedFavoriteStore(dir).Read().Revision==first.Revision,"Previous active state lost");
});
Case("F10 duplicate history branch rejects without deleting either file",()=>{
 var dir=Path.Combine(root,"history-branch");var s=new PedFavoriteStore(dir);s.Toggle("empty",Choice());var original=Directory.GetFiles(dir,"*.txt").Single();var copy=Path.Combine(dir,"ped-favorites-00000001-"+new string('f',64)+".txt");File.Copy(original,copy);var before=File.ReadAllBytes(original);
 Expect(Reject(()=>s.Read()),"Duplicate history branch accepted");Expect(Directory.GetFiles(dir,"*.txt").Length==2&&before.SequenceEqual(File.ReadAllBytes(original))&&before.SequenceEqual(File.ReadAllBytes(copy)),"Rejected branch was modified");
});
Case("F11 hard-linked history refuses without touching linked bytes",()=>{
 var dir=Path.Combine(root,"history-hardlink");var s=new PedFavoriteStore(dir);s.Toggle("empty",Choice());var original=Directory.GetFiles(dir,"*.txt").Single();var outside=Path.Combine(root,"foreign-hardlink.txt");var before=File.ReadAllBytes(original);
 if(!Links.CreateHardLink(outside,original,IntPtr.Zero))throw new IOException("Hardlink fixture unavailable, Win32="+Marshal.GetLastWin32Error());
 Expect(Reject(()=>s.Read()),"Hard-linked history accepted");Expect(before.SequenceEqual(File.ReadAllBytes(original))&&before.SequenceEqual(File.ReadAllBytes(outside)),"Hardlink rejection changed bytes");
});
File.WriteAllText(Path.Combine(root,"results.json"),JsonSerializer.Serialize(new{checkedAt=DateTime.UtcNow,checks,failed,gameplayVerified=false,boundary="Actual PedFavoriteStore/Win32 handles/history publisher and actual Windows files. Only explicit BeforePublish fault hook is substituted; no GTA/native calls."},new JsonSerializerOptions{WriteIndented=true}));Console.WriteLine($"Final cases={checks.Count}, failed={failed}");return failed==0?0:1;

static class Links
{
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]
 [return:MarshalAs(UnmanagedType.Bool)]
 internal static extern bool CreateHardLink(string name,string existing,IntPtr security);
}
