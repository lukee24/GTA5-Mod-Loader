using Gems.GameAssistant;
using System;
using System.IO;
using System.Collections.Generic;
using System.Linq;
internal sealed class MemoryJournal : IWeaponJournal
{
    internal int Begins, Finishes; internal bool FailBegin=false,FailFinish=false; internal Action? OnBegin=null;
    public int UnconfirmedCount {get;private set;}
    public void Verify() { }
    public string Begin(string a,WeaponSnapshot b,uint h,int n,string s) { if(FailBegin)throw new IOException("intent fault"); Begins++;UnconfirmedCount++; OnBegin?.Invoke();return Begins.ToString(); }
    public void Finish(string id,string state,WeaponSnapshot? after,string detail) {if(FailFinish)throw new IOException("result fault"); Finishes++;UnconfirmedCount--;}
}
internal sealed class FakePort : IWeaponPort
{
    internal bool Allowed=true,HasTarget,Shared=false,SlotOccupied=false,Loaded=true,DefinitionValid=true,ThrowBefore=false,ThrowAfter=false,WrongAfter=false,UnknownProbeAfterRemove=false;
    internal int Gives,Adds,Removes,Requests,Releases,Pool,OriginalAmmo=20,Tint=0,TargetSlot=2,Actor=1,DefinitionReads,InventoryReads; internal long Epoch;
    internal uint Selected=1; internal string Component="base";
    internal WeaponSession Session=>new(new PlayerIdentity(1,Actor,1,123),Epoch);
    public bool TrySession(out WeaponSession session){session=Session; if(!Allowed){ForgetSession();return false;}return true;}
    public void ForgetSession(){Epoch++;}
    void Require(WeaponSession s){if(!Allowed||!s.Equals(Session))throw new Exception("session denied");}
    public WeaponDefinition[] Definitions(WeaponSession s){Require(s);DefinitionReads++;return new[]{new WeaponDefinition{Hash=1,Slot=1,AmmoType=11,Valid=true},new WeaponDefinition{Hash=2,Slot=2,AmmoType=22,Valid=DefinitionValid},new WeaponDefinition{Hash=3,Slot=3,AmmoType=22,Valid=true}};}
    public WeaponDefinition InspectDefinition(WeaponSession s,uint h)=>Definitions(s).Single(d=>d.Hash==h);
    public WeaponSnapshot Read(WeaponSession s,uint probeHash=0)
    {
        Require(s); InventoryReads++; var items=new List<WeaponState>{new(){Hash=1,Slot=SlotOccupied?2:1,AmmoType=11,Ammo=OriginalAmmo,PoolAmmo=OriginalAmmo,MaxAmmo=100,ClipKnown=true,Clip=5}};
        if(HasTarget)items.Add(new(){Hash=2,Slot=TargetSlot,AmmoType=22,Ammo=Pool,PoolAmmo=Pool,MaxAmmo=100,ClipKnown=true,Clip=0,Tint=Tint,Components=Component});
        if(Shared)items.Add(new(){Hash=3,Slot=3,AmmoType=22,Ammo=Pool,PoolAmmo=Pool,MaxAmmo=100,ClipKnown=true,Clip=0});
        return new(){Session=s,Current=Selected,Items=items.ToArray(),ProbeHash=probeHash,ProbeAmmoType=probeHash==0||UnknownProbeAfterRemove&&Removes>0?0:probeHash==1?11u:22u,ProbePoolAmmo=probeHash==0||UnknownProbeAfterRemove&&Removes>0?0:probeHash==1?OriginalAmmo:Pool};
    }
    public bool AssetLoaded(WeaponSession s,uint h){Require(s);return Loaded;}
    public void RequestAsset(WeaponSession s,uint h){Require(s);Requests++;}
    public void ReleaseAsset(WeaponSession s,uint h){Require(s);Releases++;}
    public void GiveZero(WeaponSession s,WeaponSnapshot expected,uint h){Require(s);Gives++;if(ThrowBefore)throw new Exception("before");HasTarget=true;if(WrongAfter)OriginalAmmo++;if(ThrowAfter)throw new Exception("after");}
    public void AddAmmo(WeaponSession s,WeaponSnapshot expected,uint h,int n){Require(s);Adds++;Pool+=n;}
    public void RemoveOwned(WeaponSession s,WeaponSnapshot expected,uint h){Require(s);Removes++;HasTarget=false;}
}
