using GTA;
using GTA.Math;
using Gems.GameAssistant;

int checks=0;
void Check(bool value,string name) { if(!value) throw new Exception("FAIL: "+name); checks++; Console.WriteLine("PASS: "+name); }
bool Close(float a,float b) => System.Math.Abs(a-b)<.00001f;
(Ped Ped,Vehicle Vehicle) Fixture()
{
    var ped=new Ped(10); var vehicle=new Vehicle(20) { Driver=ped };
    ped.CurrentVehicle=vehicle; Game.Player.Character=ped; return(ped,vehicle);
}
VehicleController Controller(Func<bool>? allowed=null) => new(allowed??(()=>true),(_,_)=>{});
void Reject(Action action,string name)
{
    try { action(); } catch(InvalidOperationException) { Check(true,name); return; }
    throw new Exception("FAIL: "+name);
}

// Fixture control: the exact old SDK boundary cannot move a zero-velocity entity.
var baseline=new Vehicle(90); baseline.Speed=5f/3.6f;
Check(baseline.Speed==0,"pinned SDK generic Speed retains zero direction at rest");

var f=Fixture(); var controller=Controller();
var result=controller.Speed(f.Ped,1);
Check(Close(f.Vehicle.Speed,5f/3.6f),"actual VehicleController starts a resting car at requested 5 km/h");
Check(f.Vehicle.ForwardSpeedWrites==1 && f.Vehicle.GenericSpeedWrites==0,"controller uses vehicle forward boundary rather than generic velocity scaling");
Check(result.Contains("5.0"),"controller returns requested speed and corresponding readback");
controller.Speed(f.Ped,0);
Check(f.Vehicle.Speed==0 && f.Vehicle.ForwardSpeedWrites==2,"zero-step stop still submits zero and stops the same car");

f=Fixture(); f.Vehicle.Velocity=new Vector3(0,29f/3.6f,0); Controller().Speed(f.Ped,1);
Check(Close(f.Vehicle.Speed,30f/3.6f),"actual controller keeps 30 km/h clamp");
f=Fixture(); Reject(()=>Controller(()=>false).Speed(f.Ped,1),"story guard refuses request");
Check(f.Vehicle.ForwardSpeedWrites==0,"guard refusal performs no vehicle write");
f=Fixture(); f.Vehicle.Driver=new Ped(11); Reject(()=>Controller().Speed(f.Ped,1),"non-driver rejected");
f=Fixture(); f.Vehicle.IsOnAllWheels=false; Reject(()=>Controller().Speed(f.Ped,1),"ungrounded car rejected");
f=Fixture(); f.Vehicle.HeightAboveGround=3; Reject(()=>Controller().Speed(f.Ped,1),"high vehicle rejected");
f=Fixture(); f.Vehicle.Model.IsCar=false; Reject(()=>Controller().Speed(f.Ped,1),"non-car rejected");
f=Fixture(); int guards=0; var changed=f.Vehicle;
Reject(()=>Controller(()=>{ if(++guards==2) changed.MemoryAddress=new IntPtr(9999); return true; }).Speed(f.Ped,1),"identity rechecked at final write boundary");
Check(f.Vehicle.ForwardSpeedWrites==0,"changed identity performs no vehicle write");
Console.WriteLine($"Vehicle controller speed regression: {checks} checks passed. SDK boundary simulation; not game evidence.");
