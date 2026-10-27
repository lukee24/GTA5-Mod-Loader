using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Linq;
using GTA;
using GTA.Math;
using GTA.Native;

namespace Gems.GameAssistant
{
    public sealed class GtaPedPort : IPedPort,IPedProbeMaintenance
    {
        private readonly Func<bool> allowed; private readonly SpawnQuota quota; private readonly Func<long> clock;
        private PedSession? last; private long epoch;
        private sealed class ProbeState { internal PedSession Session;internal PedProbe Probe=null!;internal ShapeTestHandle Handle;internal bool Ready,Clear,Abandoned;internal long ReadyAt; }
        private readonly Dictionary<string,ProbeState> probes=new Dictionary<string,ProbeState>();
        private readonly Dictionary<string,PedReceipt> created=new Dictionary<string,PedReceipt>();
        public GtaPedPort(Func<bool> allowed,SpawnQuota quota,Func<long>? clock=null){this.allowed=allowed;this.quota=quota;this.clock=clock??(()=>Stopwatch.GetTimestamp()*1000/Stopwatch.Frequency);}
        private static PlayerIdentity Identity(Player p,Ped ped)=>new PlayerIdentity(p.Handle,ped.Handle,ped.Model.Hash,ped.MemoryAddress.ToInt64());
        private static PedPoint Point(Vector3 p)=>new PedPoint(p.X,p.Y,p.Z);
        private static Vector3 Vector(PedPoint p)=>new Vector3(p.X,p.Y,p.Z);
        public void ForgetSession(){epoch=checked(epoch+1);last=null;foreach(var r in created.Values)r.Eligible=false;foreach(var p in probes.Values)p.Abandoned=true;foreach(var key in probes.Where(p=>p.Value.Ready).Select(p=>p.Key).ToArray())probes.Remove(key);}
        public void AbandonProbe(PedProbe? probe){if(probe==null||!probes.TryGetValue(probe.Id,out var p)||!ReferenceEquals(p.Probe,probe))return;if(p.Ready)probes.Remove(probe.Id);else p.Abandoned=true;}
        private void DrainAbandoned(PedSession session){foreach(var pair in probes.Where(p=>p.Value.Abandoned&&!p.Value.Ready).Take(16).ToArray()){Require(session);var status=pair.Value.Handle.GetResult(out var ignored);Require(session);if(status!=ShapeTestStatus.NotReady)probes.Remove(pair.Key);}}
        public bool TrySession(out PedSession session)
        {
            session=default;
            try
            {
                if(!allowed()){ForgetSession();return false;}
                var player=Game.Player;var ped=player.Character;
                if(ped==null||!ped.Exists()||ped.IsDead||ped.MemoryAddress==IntPtr.Zero){ForgetSession();return false;}
                session=new PedSession(Identity(player,ped),Game.FileVersion.ToString(),epoch);
                if(last.HasValue&&!last.Value.Equals(session)){ForgetSession();session=new PedSession(Identity(player,ped),Game.FileVersion.ToString(),epoch);}
                last=session;return true;
            }catch{ForgetSession();throw;}
        }
        private Ped Require(PedSession expected)
        {
            if(!TrySession(out var now)||!now.Equals(expected))throw new InvalidOperationException("人物操作的连续角色/输入资格已失效。");
            var player=Game.Player;var ped=player.Character;
            if(!Identity(player,ped).Equals(expected.Actor)){ForgetSession();throw new InvalidOperationException("人物最终角色身份改变。");}return ped;
        }
        private void FinalIdentity(PedSession session,Ped captured)
        {
            var p=Game.Player;
            if(epoch!=session.Epoch||!Identity(p,captured).Equals(session.Actor)||!Identity(p,p.Character).Equals(session.Actor))
            {ForgetSession();throw new InvalidOperationException("最终检查期间角色改变。");}
        }
        public PedModelState ReadModel(PedSession session,PedChoice choice)
        {
            Require(session);var m=new Model(unchecked((int)choice.Hash));
            var result=new PedModelState{Recognized=m.IsValid&&m.IsInCdImage&&m.IsPed};
            if(result.Recognized)
            {
                result.Human=m.IsHumanPed;result.Animal=m.IsAnimalPed;result.Loaded=m.IsLoaded;result.Collision=m.IsCollisionLoaded;
                m.GetDimensions(out var min,out var max);
                result.Radius=(float)Math.Sqrt(Math.Pow(Math.Max(Math.Abs(min.X),Math.Abs(max.X)),2)+Math.Pow(Math.Max(Math.Abs(min.Y),Math.Abs(max.Y)),2))+0.15f;
                result.Height=max.Z-min.Z;
                result.MinZ=min.Z;if(!Point(min).Finite||!Point(max).Finite||min.X>max.X||min.Y>max.Y||min.Z>max.Z)result.Recognized=false;
            }
            Require(session);return result;
        }
        public void Request(PedSession session,uint hash){Require(session);new Model(unchecked((int)hash)).Request();Require(session);new Model(unchecked((int)hash)).RequestCollision();Require(session);}
        public void Release(PedSession session,uint hash){Require(session);new Model(unchecked((int)hash)).MarkAsNoLongerNeeded();}
        public void CheckPool(PedSession session,int remaining)
        {
            Require(session);var count=World.PedCount;var capacity=World.PedCapacity;
            if(remaining<1||remaining>4||count<0||capacity<1||capacity>100000||count>capacity||capacity-count<remaining+8)throw new InvalidOperationException("人物池未知或余量不足（需另保留8项）。");Require(session);
        }
        private static bool Ground(Vector3 point,float anchorZ,out float height)
        {
            if(!World.GetGroundHeightAndNormal(point+new Vector3(0,0,3),out height,out var normal))return false;
            return WorldOptions.Finite(height)&&Point(normal).Finite&&normal.Z>=0.9f&&Math.Abs(height-anchorZ)<=1.5f;
        }
        private void Empty(PedSession session,PedSite site)
        {
            var actor=Require(session);var p=Vector(site.Point);var distance=Point(actor.Position).Distance(site.Point);
            if(!site.Point.Finite||!WorldOptions.Finite(site.Heading)||!WorldOptions.Finite(site.MinZ)||distance<4||distance>10||!Ground(p,actor.Position.Z,out var h)||Math.Abs(h-(site.Point.Z+site.MinZ-0.1f))>0.3f)
                throw new InvalidOperationException("人物生成点已越界或地面发生变化。");
            // Conservative sphere catches dynamic entities as well as the capsule's static collision query.
            if(World.GetNearbyEntities(p,site.Radius+1.2f).Length!=0)throw new InvalidOperationException("人物生成点附近有实体，未自动挪动位置。");Require(session);
        }
        public PedSite FindSite(PedSession session,PedModelState model,int ordinal,IReadOnlyList<PedSite> previous)
        {
            var actor=Require(session);var angle=(actor.Heading+ordinal*90)*Math.PI/180;var anchor=actor.Position;
            var desired=anchor+new Vector3(-(float)Math.Sin(angle)*7,(float)Math.Cos(angle)*7,0);
            if(!World.GetSafePositionForPed(desired,out var safe,GetSafePositionFlags.NotIsolated|GetSafePositionFlags.NotInterior|GetSafePositionFlags.NotWater)||!Point(safe).Finite||!Ground(safe,anchor.Z,out var ground))
                throw new InvalidOperationException("未找到满足地面/坡度条件的人物位置。");
            safe.Z=ground-model.MinZ+0.1f;var site=new PedSite(Point(safe),actor.Heading,model.Radius,model.Height,clock(),model.MinZ);
            if(previous.Any(p=>p.Point.Distance(site.Point)<p.Radius+site.Radius+1.2f))throw new InvalidOperationException("批次人物位置过近，未生成重叠样本。");Empty(session,site);return site;
        }
        public PedProbe StartProbe(PedSession session,PedSite site)
        {
            DrainAbandoned(session);Empty(session,site);if(probes.Count>=16)throw new InvalidOperationException("未终结或未消费空间探测达到16项，未继续请求。");
            var bottom=Vector(site.Point)+new Vector3(0,0,site.MinZ+site.Radius+0.02f);var top=Vector(site.Point)+new Vector3(0,0,site.MinZ+Math.Max(site.Radius,site.Height-site.Radius)+0.02f);
            Require(session);var handle=ShapeTest.StartTestCapsule(bottom,top,site.Radius,IntersectFlags.Everything,null,ShapeTestOptions.Default);
            var probe=new PedProbe(Guid.NewGuid().ToString("N"),site);probes.Add(probe.Id,new ProbeState{Session=session,Probe=probe,Handle=handle});Require(session);return probe;
        }
        public PedProbeResult PollProbe(PedSession session,PedProbe probe)
        {
            Require(session);if(!probes.TryGetValue(probe.Id,out var state)||!ReferenceEquals(state.Probe,probe)||!state.Session.Equals(session)||state.Ready||state.Abandoned)throw new InvalidOperationException("空间探测票据已失效或结果已经读取。");
            var status=state.Handle.GetResult(out var result);Require(session);
            if(status==ShapeTestStatus.NotReady)return new PedProbeResult();
            state.Ready=true;state.ReadyAt=clock();state.Clear=status==ShapeTestStatus.Ready&&!result.DidHit;
            if(!state.Clear)probes.Remove(probe.Id);
            return new PedProbeResult{State=state.Clear?"ready-clear":status==ShapeTestStatus.Ready?"blocked":"failed",Reason=state.Clear?"已观察空间探测未命中":"空间探测失败或命中障碍"};
        }
        public PedReceipt Create(PedCreateTicket ticket,Action finalSourceCheck)
        {
            if(ticket.Consumed)throw new InvalidOperationException("人物创建票据已消费。");ticket.Consumed=true;
            if(created.Count>=128)throw new InvalidOperationException("本实例人物结果账本达到128项，未提交新对象。");
            var receipt=new PedReceipt(ticket);created.Add(receipt.Id,receipt);
            try
            {
                quota.Require(ticket.Reservation,ticket.Index);finalSourceCheck();
                var model=ReadModel(ticket.Session,ticket.Choice);if(!model.GroundEligible(ticket.Choice)||!model.Loaded||!model.Collision)throw new InvalidOperationException("模型/碰撞或地面类型尚未就绪。");
                if(!probes.TryGetValue(ticket.Probe.Id,out var probe)||!ReferenceEquals(probe.Probe,ticket.Probe)||!probe.Session.Equals(ticket.Session)||!probe.Ready||!probe.Clear||probe.Abandoned||clock()-probe.ReadyAt>750)throw new InvalidOperationException("空间证明未就绪或过期。");
                if(Math.Abs(model.Radius-probe.Probe.Site.Radius)>0.001||Math.Abs(model.Height-probe.Probe.Site.Height)>0.001||Math.Abs(model.MinZ-probe.Probe.Site.MinZ)>0.001)throw new InvalidOperationException("人物模型包络改变。");
                Empty(ticket.Session,ticket.Probe.Site);CheckPool(ticket.Session,1);finalSourceCheck();
                var actor=Require(ticket.Session);var m=new Model(unchecked((int)ticket.Choice.Hash));
                if(!m.IsLoaded||!m.IsCollisionLoaded||!m.IsPed)throw new InvalidOperationException("提交前模型或碰撞已失效。");
                Empty(ticket.Session,ticket.Probe.Site);CheckPool(ticket.Session,1);actor=Require(ticket.Session);FinalIdentity(ticket.Session,actor);
                quota.Issue(ticket.Reservation,ticket.Index);ticket.NativeIssued=receipt.NativeIssued=true;probes.Remove(ticket.Probe.Id);
                var point=ticket.Probe.Site.Point;
                receipt.Handle=Function.Call<int>(Hash.CREATE_PED,26,ticket.Choice.Hash,point.X,point.Y,point.Z,ticket.Probe.Site.Heading,false,false);
                receipt.CallReturned=true;
                if(receipt.Handle==0)throw new InvalidOperationException("人物接口返回0，未认领对象，也不重试。");
                var ped=Entity.FromHandle(receipt.Handle) as Ped??throw new InvalidOperationException("创建返回的句柄不是可读取人物。");Require(ticket.Session);
                if(!ped.Exists()||ped.MemoryAddress==IntPtr.Zero||unchecked((uint)ped.Model.Hash)!=receipt.Model||ped.IsPlayer||!ped.IsPersistent||!ped.IsOwnedByShvdnScript||Point(ped.Position).Distance(point)>2)
                    throw new InvalidOperationException("创建后对象或归属读回未确认。");
                receipt.Address=ped.MemoryAddress.ToInt64();receipt.Eligible=true;receipt.State="created-observed";
                receipt.Style=ReadStyle(ticket.Session,ped);Require(ticket.Session);
                receipt.Reason="已观察创建对象；外观、动作、模型来源效果均待游戏验证。";
            }
            catch(Exception ex){receipt.Eligible=false;receipt.State=receipt.NativeIssued?"unknown":"not-submitted";receipt.Reason=ex.ToString();ForgetSession();}
            return receipt;
        }
        private string ReadStyle(PedSession session,Ped ped)
        {
            var parts=new List<string>();
            try
            {
                Require(session);var components=ped.Style.GetAllComponents();var props=ped.Style.GetAllProps();
                if(components.Length>12||props.Length>9)throw new InvalidOperationException("服装槽数量超限。");
                foreach(var item in components){Require(session);parts.Add("组件"+item.Type+"="+item.Index+"/"+item.Count+" 纹理"+item.TextureIndex+"/"+item.TextureCount);}
                foreach(var item in props){Require(session);parts.Add("配饰"+item.AnchorPoint+"="+item.Index+"/"+item.Count+" 纹理"+item.TextureIndex+"/"+item.TextureCount+"（SDK0未戴）");}
            }catch(Exception ex){Require(session);return "组件读取未确认："+ex.Message;}return string.Join(";",parts);
        }
        private Ped Target(PedSession session,PedReceipt receipt)
        {
            Require(session);if(!created.TryGetValue(receipt.Id,out var owned)||!ReferenceEquals(owned,receipt)||!receipt.Session.Equals(session)||!receipt.Eligible||receipt.Deleted)throw new InvalidOperationException("人物不在当前实例有效创建账本。");
            var ped=Entity.FromHandle(receipt.Handle) as Ped;
            if(ped==null||!ped.Exists()||ped.MemoryAddress.ToInt64()!=receipt.Address||unchecked((uint)ped.Model.Hash)!=receipt.Model||ped.IsPlayer||!ped.IsPersistent||!ped.IsOwnedByShvdnScript)
            {receipt.Eligible=false;throw new InvalidOperationException("人物身份/归属失联，旧清理权限永久失效。");}return ped;
        }
        public string ReadCreated(PedSession session,PedReceipt receipt){var target=Target(session,receipt);receipt.Style=ReadStyle(session,target);return receipt.Style;}
        private void CleanupSafe(PedSession session,PedReceipt receipt,Ped ped)
        {
            var actor=Require(session);
            if(!ped.Exists()||ped.MemoryAddress.ToInt64()!=receipt.Address||unchecked((uint)ped.Model.Hash)!=receipt.Model||ped.IsPlayer||!ped.IsPersistent||!ped.IsOwnedByShvdnScript||ped.IsAttached()||ped.IsInVehicle()||ped.IsInCombat||ped.IsRagdoll||ped.IsPositionFrozen||!WorldOptions.Finite(ped.Speed)||ped.Speed>0.5f||Point(ped.Position).Distance(Point(actor.Position))>10)
                throw new InvalidOperationException("人物当前不满足近距、空闲、身份及归属清理条件。");FinalIdentity(session,actor);
        }
        public PedCleanupResult Delete(PedSession session,PedReceipt receipt)
        {
            var result=new PedCleanupResult();
            try
            {
                var ped=Target(session,receipt);CleanupSafe(session,receipt,ped);CleanupSafe(session,receipt,ped);
                receipt.Eligible=false;result.Issued=true;
                using(var handle=new OutputArgument(receipt.Handle)){Function.Call(Hash.DELETE_ENTITY,handle);}
                Require(session);result.Absent=!ped.Exists();receipt.Deleted=result.Absent;
                if(result.Absent){quota.ConfirmDeleted(receipt.Reservation,receipt.Index);receipt.State="deleted-observed";}
                result.Reason=result.Absent?"已观察原对象消失；不表示完整世界恢复。":"删除调用后对象仍在，未重试。";
            }catch(Exception ex){result.Reason=ex.ToString();if(result.Issued){receipt.Eligible=false;receipt.State="delete-unknown";}ForgetSession();}return result;
        }
    }
}
