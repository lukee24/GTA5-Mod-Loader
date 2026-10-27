using Gems.GameAssistant;

internal sealed class ActionPort : IWeaponActionsPort
{
    internal WeaponActionSnapshot State;
    internal readonly List<string> Writes = new();
    internal bool Allowed=true, NoEffect=false, ThrowAfter=false; internal Action? OnObserve=null; internal long Epoch;
    internal ActionPort()
    {
        State=new WeaponActionSnapshot{Session=new WeaponSession(new PlayerIdentity(1,2,3,4),0),Current=WeaponActionsController.Unarmed,Items=new[]{
            new WeaponActionItem{Hash=WeaponActionsController.Unarmed,Slot=WeaponReading<int>.Of(1)},
            new WeaponActionItem{Hash=5,Slot=WeaponReading<int>.Of(2),AmmoType=WeaponReading<uint>.Of(10),Ammo=WeaponReading<int>.Of(20),Pool=WeaponReading<int>.Of(20),Clip=WeaponReading<int>.Of(6),MaxAmmo=WeaponReading<int>.Of(100),Tint=WeaponReading<int>.Of(0),TintCount=WeaponReading<int>.Of(4),ComponentsKnown=true,Components=new[]{
                new WeaponComponentObservation{Hash=11,Attachment=7,Compatible=true,Installed=false,Active=WeaponReading<bool>.Of(false),Livery=WeaponReading<int>.Unknown("not confirmed"),LiveryRaw=WeaponReading<int>.Of(0)},
                new WeaponComponentObservation{Hash=12,Attachment=7,Compatible=true,Installed=true,Active=WeaponReading<bool>.Of(true),Livery=WeaponReading<int>.Unknown("not confirmed"),LiveryRaw=WeaponReading<int>.Of(0)}
            }}
        }};
    }
    public bool TrySession(out WeaponSession session){if(!Allowed){Epoch++;session=default;return false;}session=new WeaponSession(State.Session.Actor,Epoch);return true;}
    public void ForgetSession(){Epoch++;}
    internal static WeaponActionItem Copy(WeaponActionItem i)=>new(){Hash=i.Hash,Slot=i.Slot,AmmoType=i.AmmoType,Ammo=i.Ammo,Pool=i.Pool,Clip=i.Clip,MaxAmmo=i.MaxAmmo,Tint=i.Tint,TintCount=i.TintCount,ComponentsKnown=i.ComponentsKnown,ComponentIssue=i.ComponentIssue,Components=i.Components.Select(c=>new WeaponComponentObservation{Hash=c.Hash,Attachment=c.Attachment,Compatible=c.Compatible,Installed=c.Installed,Active=c.Active,Livery=c.Livery,LiveryRaw=c.LiveryRaw}).ToArray()};
    public WeaponActionSnapshot Observe(WeaponSession session,uint detailWeapon=0,bool diagnostics=false)
    {
        OnObserve?.Invoke();if(!TrySession(out var now)||!now.Equals(session))throw new InvalidOperationException("fixture guard");
        var items=State.Items.Select(Copy).ToArray();
        foreach(var item in items.Where(i=>i.Hash!=detailWeapon)){item.ComponentsKnown=false;item.ComponentIssue="not requested";item.Components=Array.Empty<WeaponComponentObservation>();}
        return new WeaponActionSnapshot{Session=now,Current=State.Current,DetailWeapon=detailWeapon,Diagnostics=diagnostics||detailWeapon!=0,Items=items};
    }
    private void Write(string action,Action work){Writes.Add(action);if(!NoEffect)work();if(ThrowAfter)throw new IOException("fixture after apply");}
    public void Clear(WeaponSession s,WeaponActionSnapshot before)=>Write("clear",()=>{State.Items=State.Items.Where(i=>i.Hash==WeaponActionsController.Unarmed).ToArray();State.Current=WeaponActionsController.Unarmed;});
    public void InfinitePool(WeaponSession s,WeaponActionSnapshot b,uint w,bool v)=>Write("pool:"+w+":"+v,()=>{});
    public void InfiniteClip(WeaponSession s,WeaponActionSnapshot b,bool v)=>Write("clip:"+v,()=>{});
    public void Component(WeaponSession s,WeaponActionSnapshot b,uint w,uint c,bool v)=>Write("component:"+c+":"+v,()=>{
        var item=State.Find(w)!;var part=item.Find(c)!;
        if(v)foreach(var sibling in item.Components.Where(x=>x.Hash!=c&&x.Attachment==part.Attachment)){sibling.Installed=false;sibling.Active=WeaponReading<bool>.Of(false);}
        part.Installed=v;part.Active=WeaponReading<bool>.Of(v);
    });
    public void WeaponTint(WeaponSession s,WeaponActionSnapshot b,uint w,int tint)=>Write("tint:"+tint,()=>State.Find(w)!.Tint=WeaponReading<int>.Of(tint));
    public void ComponentLivery(WeaponSession s,WeaponActionSnapshot b,uint w,uint c,int tint)=>Write("livery:"+tint,()=>State.Find(w)!.Find(c)!.Livery=WeaponReading<int>.Of(tint));
}
internal sealed class ActionJournal : IWeaponActionJournal
{
    internal readonly List<string> Events=new();internal Action? OnBegin=null,OnFinish=null;internal int Counter;
    public int UnconfirmedCount{get;private set;}
    public void Verify(){}
    public string BeginAction(string a,string b,string d){OnBegin?.Invoke();Events.Add("begin:"+a);UnconfirmedCount++;return (++Counter).ToString();}
    public void FinishAction(string id,string state,string? after,string detail){OnFinish?.Invoke();Events.Add("finish:"+state);if(state!="unknown-partial")UnconfirmedCount--;}
}

