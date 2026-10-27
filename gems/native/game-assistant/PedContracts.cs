using System;
using System.Collections.Generic;
using System.Linq;

namespace Gems.GameAssistant
{
    public readonly struct PedPoint
    {
        public readonly float X, Y, Z;
        public PedPoint(float x, float y, float z) { X = x; Y = y; Z = z; }
        public bool Finite => WorldOptions.Finite(X) && WorldOptions.Finite(Y) && WorldOptions.Finite(Z);
        public float Distance(PedPoint p) { var x=X-p.X;var y=Y-p.Y;var z=Z-p.Z;return (float)Math.Sqrt(x*x+y*y+z*z); }
        public override string ToString() => string.Join(",",new[]{X,Y,Z}.Select(v=>v.ToString("R",System.Globalization.CultureInfo.InvariantCulture)));
    }
    public readonly struct PedSession : IEquatable<PedSession>
    {
        public readonly PlayerIdentity Actor; public readonly string Build; public readonly long Epoch;
        public PedSession(PlayerIdentity actor,string build,long epoch){Actor=actor;Build=build;Epoch=epoch;}
        public bool Equals(PedSession other)=>Actor.Equals(other.Actor)&&Build==other.Build&&Epoch==other.Epoch;
        public string Key=>Actor.PlayerHandle+":"+Actor.PedHandle+":"+Actor.ModelHash+":"+Actor.Address+":"+Build+":"+Epoch;
    }
    public sealed class PedChoice
    {
        public readonly string Id, Name, Token, Source, Reason, Category;public readonly string[] Tags; public readonly uint Hash; public readonly bool Allowed, GroundAnimal, DesktopFavorite;
        public PedChoice(string id,string name,uint hash,string token,string source,bool allowed,string reason,string category="civilian",bool groundAnimal=false,bool desktopFavorite=false,string[]? tags=null)
        {Id=id;Name=name;Hash=hash;Token=token;Source=source;Allowed=allowed;Reason=reason;Category=category;GroundAnimal=groundAnimal;DesktopFavorite=desktopFavorite;Tags=(tags??new[]{category}).ToArray();}
    }
    public sealed class PedModelState
    {
        public bool Recognized, Human, Animal, Loaded, Collision; public float Radius, Height,MinZ; public string Reason="";
        public bool GroundEligible(PedChoice c)=>Recognized&&(Human||(Animal&&c.GroundAnimal))&&WorldOptions.Finite(Radius)&&Radius>=0.1f&&Radius<=1.5f&&WorldOptions.Finite(Height)&&Height>=0.2f&&Height<=3.5f;
    }
    public sealed class PedSite
    {
        public readonly PedPoint Point; public readonly float Heading,Radius,Height,MinZ; public readonly long CreatedAt;
        public PedSite(PedPoint point,float heading,float radius,float height,long createdAt,float minZ=0){Point=point;Heading=heading;Radius=radius;Height=height;CreatedAt=createdAt;MinZ=minZ;}
    }
    public sealed class PedProbe
    {
        public readonly string Id; public readonly PedSite Site; internal PedProbe(string id,PedSite site){Id=id;Site=site;}
    }
    public sealed class PedProbeResult
    {
        public string State="pending",Reason=""; // ready-clear / blocked / failed / pending
    }
    public sealed class PedCreateTicket
    {
        internal readonly string Id=Guid.NewGuid().ToString("N"); internal bool Consumed,NativeIssued;
        public readonly PedSession Session; public readonly PedChoice Choice; public readonly PedProbe Probe; public readonly string Reservation; public readonly int Index;
        internal PedCreateTicket(PedSession session,PedChoice choice,PedProbe probe,string reservation,int index){Session=session;Choice=choice;Probe=probe;Reservation=reservation;Index=index;}
    }
    public sealed class PedReceipt
    {
        public readonly string Id; public readonly PedSession Session; public readonly uint Model; public readonly string Reservation; public readonly int Index;
        public string State="not-submitted",Reason="",Style="未读取"; public bool Eligible,Deleted,NativeIssued,CallReturned,AuditDurable,CleanupAuditDurable;
        internal int Handle; internal long Address;
        internal PedReceipt(PedCreateTicket ticket){Id=ticket.Id;Session=ticket.Session;Model=ticket.Choice.Hash;Reservation=ticket.Reservation;Index=ticket.Index;}
    }
    public sealed class PedCleanupResult { public bool Issued,Absent;public string Reason=""; }
    // Local cancellation is separate from a native shape-test cancellation, which the SDK does not expose.
    public interface IPedProbeMaintenance { void AbandonProbe(PedProbe? probe); }
    public interface IPedPort
    {
        bool TrySession(out PedSession session); void ForgetSession();
        PedModelState ReadModel(PedSession session,PedChoice choice);
        void Request(PedSession session,uint hash); void Release(PedSession session,uint hash);
        void CheckPool(PedSession session,int remaining);
        PedSite FindSite(PedSession session,PedModelState model,int ordinal,IReadOnlyList<PedSite> previous);
        PedProbe StartProbe(PedSession session,PedSite site);
        PedProbeResult PollProbe(PedSession session,PedProbe probe);
        PedReceipt Create(PedCreateTicket ticket,Action finalSourceCheck);
        string ReadCreated(PedSession session,PedReceipt receipt);
        PedCleanupResult Delete(PedSession session,PedReceipt receipt);
    }
    public interface IPedJournal
    {
        string Begin(string action,string detail); void Finish(string id,string state,string detail);
        void Verify(); int Unconfirmed { get; }
    }
}
