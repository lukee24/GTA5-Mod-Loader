using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;

namespace Gems.GameAssistant
{
    public sealed class PedController
    {
        private readonly IPedPort port;private readonly IPedJournal journal;private readonly SpawnQuota quota;private readonly Action<PedChoice> validate;private readonly Func<long> clock;
        private sealed class Plan {internal PedChoice Choice=null!;internal PedSession Session;internal int Count;internal long Until;internal string Id=Guid.NewGuid().ToString("N");}
        private sealed class Batch {internal Plan Plan=null!;internal string Reservation="",Audit="";internal int Index;internal long Until,ProbeUntil;internal PedProbe? Probe;internal readonly List<PedSite> Sites=new List<PedSite>();}
        private Plan? preview;private Batch? pending;private string cleanup="";private long cleanupUntil,lastFrame=-1;private string? error;
        private readonly List<PedReceipt> results=new List<PedReceipt>();
        public IReadOnlyList<PedReceipt> Results=>results.AsReadOnly();public bool Pending=>pending!=null;public bool Confirming=>preview!=null||cleanup.Length!=0;
        public string Notice{get;private set;}="人物候选尚未加载；效果未实测。";
        public string? TakeError(){var result=error;error=null;return result;}
        public void ReadStyle(string id){var r=results.Single(x=>x.Id==id);var s=Session();if(!r.Session.Equals(s)||!r.Eligible)throw new InvalidOperationException("人物读取会话或权限已失效。");r.Style=port.ReadCreated(s,r);}
        public PedController(IPedPort port,IPedJournal journal,SpawnQuota quota,Action<PedChoice> validate,Func<long>? clock=null)
        {this.port=port;this.journal=journal;this.quota=quota;this.validate=validate;this.clock=clock??(()=>Stopwatch.GetTimestamp()*1000/Stopwatch.Frequency);}
        private PedSession Session(){if(!port.TrySession(out var session))throw new InvalidOperationException("人物操作当前不可用。");return session;}
        private void Check(Plan p){if(!Session().Equals(p.Session))throw new InvalidOperationException("人物连续会话已变化。");validate(p.Choice);if(!p.Choice.Allowed)throw new InvalidOperationException(p.Choice.Reason);}
        public string PrepareOrConfirm(PedChoice choice,int count)
        {
            try
            {
                if(Pending)throw new InvalidOperationException("已有批次正在执行，请先取消。");
                if(preview!=null&&preview.Choice.Id==choice.Id&&preview.Choice.Token==choice.Token&&preview.Count==count&&clock()<=preview.Until)
                {
                    var plan=preview;preview=null;Check(plan);journal.Verify();var reservation=quota.Reserve("ped",count);
                    try{var audit=journal.Begin("batch",plan.Session.Key+"|"+choice.Id+"|"+choice.Token+"|count="+count);pending=new Batch{Plan=plan,Reservation=reservation,Audit=audit,Until=clock()+5000};}
                    catch{quota.End(reservation);throw;}
                    Notice="人物批次已请求；逐个检查，取消不删除已创建对象。";return Notice;
                }
                Cancel("选择新人物计划");if(count<1||count>4||results.Count+count>128)throw new InvalidOperationException("批次数量须1至4，当前实例结果最多128项。");
                var p=new Plan{Choice=choice,Count=count,Session=Session(),Until=clock()+10000};Check(p);
                var model=port.ReadModel(p.Session,choice);if(!model.Recognized||(!model.Human&&!(model.Animal&&choice.GroundAnimal)))throw new InvalidOperationException("模型未识别或不在已实现地面人物候选范围。");
                port.CheckPool(p.Session,count);journal.Verify();preview=p;
                Notice="再确认生成 "+count+" 个；逐个提交，失败保留已创建对象，效果待测。";
            }catch(Exception ex){preview=null;error=ex.ToString();Notice="人物计划未提交；详情见日志。";}return Notice;
        }
        private bool Finish(string id,string state,string detail)
        {try{journal.Finish(id,state,detail);return true;}catch(Exception ex){error=(error??"")+"\n人物结果日志失败："+ex;return false;}}
        private void End(string reason,bool observed)
        {
            var b=pending;pending=null;if(b==null)return;
            (port as IPedProbeMaintenance)?.AbandonProbe(b.Probe);
            var durable=Finish(b.Audit,observed?"observed-not-game-tested":"unknown-partial",reason+"|completed="+b.Index+"/"+b.Plan.Count);
            quota.End(b.Reservation);Notice=reason+"；已提交结果保留"+(durable?"。":"，日志未确认。");
            try{if(port.TrySession(out var s)&&s.Equals(b.Plan.Session))port.Release(s,b.Plan.Choice.Hash);else Notice+="模型释放未执行。";}
            catch(Exception ex){error=(error??"")+"\n模型释放未确认："+ex;Notice+="模型释放未确认。";}
        }
        public void Cancel(string reason){preview=null;cleanup="";if(pending!=null)End(reason,false);}
        public void Suspend(string reason)
        {
            // Ineligible callbacks cannot query the game for model cleanup.
            preview=null;cleanup="";var b=pending;pending=null;
            if(b!=null){(port as IPedProbeMaintenance)?.AbandonProbe(b.Probe);var durable=Finish(b.Audit,"unknown-partial",reason+"|completed="+b.Index);quota.End(b.Reservation);Notice=reason+"；已创建/未知结果保留，未为释放调用游戏。"+(durable?"":"结果日志未确认。");}
            foreach(var r in results)r.Eligible=false;port.ForgetSession();
        }
        public void Tick(long frame)
        {
            if(frame<=lastFrame)return;lastFrame=frame;var b=pending;
            if(b==null){if(preview!=null)try{Check(preview);if(clock()>preview.Until)preview=null;}catch(Exception ex){error=ex.ToString();Suspend("人物预览会话中断");}return;}
            try
            {
                Check(b.Plan);if(clock()>b.Until)throw new InvalidOperationException("模型/碰撞/批次准备超过5秒。");
                var model=port.ReadModel(b.Plan.Session,b.Plan.Choice);
                if(!model.Recognized)throw new InvalidOperationException("人物模型不再可识别。");
                if(!model.Loaded||!model.Collision){port.Request(b.Plan.Session,b.Plan.Choice.Hash);Notice="等待模型与碰撞分别就绪。";return;}
                if(!model.GroundEligible(b.Plan.Choice))throw new InvalidOperationException("人物模型尺寸或地面类型超出当前支持范围。");
                port.CheckPool(b.Plan.Session,b.Plan.Count-b.Index);
                if(b.Probe==null){var site=port.FindSite(b.Plan.Session,model,b.Index,b.Sites);b.Probe=port.StartProbe(b.Plan.Session,site);b.ProbeUntil=clock()+1500;return;}
                var result=port.PollProbe(b.Plan.Session,b.Probe);
                if(result.State=="pending"){if(clock()>b.ProbeUntil)throw new InvalidOperationException("空间探测超时；未当空地处理。");return;}
                if(result.State!="ready-clear")throw new InvalidOperationException(result.Reason);
                Check(b.Plan);var ticket=new PedCreateTicket(b.Plan.Session,b.Plan.Choice,b.Probe,b.Reservation,b.Index);string? audit=null;PedReceipt? receipt=null;
                try
                {
                    audit=journal.Begin("create",b.Plan.Session.Key+"|"+b.Plan.Choice.Token+"|"+b.Probe.Site.Point+"|"+b.Index);Check(b.Plan);
                    receipt=port.Create(ticket,()=>Check(b.Plan));results.Add(receipt);
                }
                catch(Exception ex)
                {
                    if(receipt==null){receipt=new PedReceipt(ticket){State=ticket.NativeIssued?"unknown":"not-submitted",NativeIssued=ticket.NativeIssued,Reason=ex.ToString()};results.Add(receipt);}error=ex.ToString();
                }
                finally
                {
                    if(audit!=null&&receipt!=null)receipt.AuditDurable=Finish(audit,receipt.State=="created-observed"?"observed-not-game-tested":receipt.NativeIssued?"unknown-partial":"not-submitted",receipt.Reason+"|id="+receipt.Id+"|issued="+receipt.NativeIssued+"|returned="+receipt.CallReturned);
                }
                if(receipt==null||receipt.State!="created-observed"||!receipt.AuditDurable){if(receipt!=null)receipt.Eligible=false;throw new InvalidOperationException("本项创建或审计未确认；停止剩余批次，不重发。");}
                b.Sites.Add(b.Probe.Site);b.Probe=null;b.Index++;
                if(b.Index==b.Plan.Count)End("已观察本批 "+b.Index+" 个人物；游戏外观未实测",true);
                else Notice="已观察 "+b.Index+"/"+b.Plan.Count+"；下一Tick再处理下一项。";
            }
            catch(Exception ex){error=(error??"")+"\n"+ex;End("人物批次中止，可能部分完成",false);Suspend("人物批次已失权");}
        }
        public string Cleanup(string id)
        {
            try
            {
                if(Pending)throw new InvalidOperationException("创建批次尚未结束。");var r=results.Single(x=>x.Id==id);var session=Session();
                if(!r.Session.Equals(session)||!r.Eligible||r.Deleted)throw new InvalidOperationException("本次记录不可清理。");
                port.ReadCreated(session,r);
                if(cleanup!=id||clock()>cleanupUntil){preview=null;cleanup=id;cleanupUntil=clock()+10000;Notice="再确认删除本实例此人物；不可撤销，条件变化将拒绝。";return Notice;}
                cleanup="";var audit=journal.Begin("delete",session.Key+"|"+r.Id);PedCleanupResult? outcome=null;
                try{if(!Session().Equals(session))throw new InvalidOperationException("清理意图后会话失效。");outcome=port.Delete(session,r);}
                catch(Exception ex){error=ex.ToString();throw;}
                finally{r.CleanupAuditDurable=Finish(audit,outcome?.Absent==true?"observed-not-game-tested":outcome?.Issued==true?"unknown-partial":"not-submitted",outcome?.Reason??"清理未提交，资格检查拒绝。");}
                Notice=outcome.Reason+(r.CleanupAuditDurable?"":"；清理结果日志未确认，审计不能视为完成。");
            }catch(Exception ex){cleanup="";error=(error??"")+"\n"+ex;Notice="人物清理未确认；保留对象/记录，不重试。";}return Notice;
        }
    }
    // Reuses the verified immutable v2 audit envelope in its own ped-only directory.
    // The envelope name remains GEMS.WeaponAction.v2; it is not a game ownership token.
    public sealed class PedOperationJournal : IPedJournal
    {
        private readonly WeaponJournal journal;public PedOperationJournal(string directory){journal=new WeaponJournal(directory);}
        public int Unconfirmed=>journal.UnconfirmedCount;public void Verify()=>journal.Verify();
        public string Begin(string action,string detail)=>journal.BeginAction("ped-"+action,detail,"GEMS.PedOperation.v1;effect-not-tested");
        public void Finish(string id,string state,string detail)=>journal.FinishAction(id,state,null,detail);
    }
}
