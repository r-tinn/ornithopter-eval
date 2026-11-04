// Independent binary probes; serialized into an isolated browser with trusted assumptions.
export async function pilotedNumeric({E}){
  const out={source:[],physics:[]};
  const add=(group,id,fn)=>{try{const r=fn();out[group].push({id,pass:r.pass===true,detail:r.detail});}catch(e){out[group].push({id,pass:false,detail:{error:String(e)}});}};
  try{
    const P=await import('./physics.mjs'),K=await import('./kinematics.mjs'),p=P.parameters;
    const AR=7.4**2/6.61,S=E.span_m**2/AR,g=E.gravity_m_s2;
    const near=(a,b,t=1e-6)=>Number.isFinite(a)&&Math.abs(a-b)<=t*Math.max(1,Math.abs(b));
    const scalar=(x,name)=>{if(typeof x!=='number'||!Number.isFinite(x))throw Error(name+' must be a finite scalar');return x;};
    const c={throttle:0,pitch:0,bank:0,rudder:0,brake:0},env={wind:[0,0,0],rho:E.rho_kg_m3,surfaceHeight:()=>0};
    const initial=()=>({position:[0,1000,0],velocity:[16,0,0],pitch:0,roll:0,heading:0,phase:E.wing.parked_phase_rad,omega:0,
      fuel_kg:E.fuel.initial_kg,pitch_rate:0,roll_rate:0,wheel_angle:0,shaft_work_J:0,aero_work_J:0,drive_heat_J:0,time:0,status:'flying'});
    add('source','aspect_ratio_from_study',()=>({pass:near(p.aspect_ratio,AR,.005),detail:{actual:p.aspect_ratio,expected:AR}}));
    add('source','wrist_fraction_from_study',()=>({pass:near(p.wrist_span_fraction,.5,.005),detail:{actual:p.wrist_span_fraction,expected:.5}}));
    add('source','mechanical_area_consistent',()=>({pass:near(p.span_m,E.span_m,.005)&&near(p.wing_area_m2,S,.005),detail:{span:p.span_m,area:p.wing_area_m2,expected:S}}));
    add('physics','mass_budget_complete',()=>{
      const actual=Object.fromEntries((p.mass_budget??[]).map(x=>[x.id,x.kg])),sum=E.mass_budget.reduce((a,b)=>a+b.kg,0);
      return {pass:Object.keys(actual).length===E.mass_budget.length&&E.mass_budget.every(x=>near(actual[x.id],x.kg))&&near(p.pilot_mass_kg,55)&&near(p.dry_mass_kg,sum)&&near(p.mass_kg,sum+E.fuel.initial_kg),detail:{actual,dry:p.dry_mass_kg,wet:p.mass_kg,expected_dry:sum}};
    });
    add('physics','fuel_mass_affects_weight',()=>{
      const a=P.forces({...initial(),velocity:[0,0,0],fuel_kg:1},c,env),b=P.forces({...initial(),velocity:[0,0,0],fuel_kg:2},c,env);
      return {pass:near(b.mass_kg-a.mass_kg,1)&&near(b.force[1]-a.force[1],-g),detail:{mass_delta:b.mass_kg-a.mass_kg,vertical_force_delta:b.force[1]-a.force[1]}};
    });
    function run(s,controls,seconds){for(let i=0;i<Math.round(seconds*120);i++)s=P.step(s,controls,env,1/120);return s;}
    add('physics','fuel_accounting',()=>{
      const start=initial(),s=run(start,{...c,throttle:1},1),used=start.fuel_kg-s.fuel_kg;
      const expected=s.shaft_work_J*E.fuel.bsfc_kg_kWh/3600000+E.fuel.idle_kg_s;
      return {pass:s.shaft_work_J>0&&near(used,expected,1e-7)&&start.fuel_kg===E.fuel.initial_kg,detail:{used,expected,shaft_work_J:s.shaft_work_J}};
    });
    add('physics','empty_tank_stops_drive',()=>{
      const start={...initial(),fuel_kg:.00003},s=run(start,{...c,throttle:1},.5),after=run(structuredClone(s),{...c,throttle:1},.5),f=P.forces(after,{...c,throttle:1},env);
      return {pass:s.fuel_kg>=0&&s.fuel_kg<1e-10&&Math.abs(f.power)<1e-9&&Math.abs(after.omega)<1e-9&&near(s.phase,after.phase)&&s.shaft_work_J<=start.fuel_kg*3600000/E.fuel.bsfc_kg_kWh,detail:{fuel:s.fuel_kg,power:f.power,omega:after.omega,phase_before:s.phase,phase_after:after.phase,shaft_work_J:s.shaft_work_J}};
    });
    add('physics','drive_lock_preserves_pose',()=>{
      const samples=[];
      for(const phase of [.17,1.01,2.23,4.48]){
        const moving=K.wingPose({...initial(),phase,omega:6}),stopped=K.wingPose({...initial(),phase,omega:0});
        for(const name of Object.keys(moving))samples.push({phase,panel:name,
          angle_error:Math.max(Math.abs(moving[name].stroke-stopped[name].stroke),Math.abs(moving[name].twist-stopped[name].twist)),
          stopped_rate:Math.max(Math.abs(stopped[name].rate),Math.abs(stopped[name].twistRate))});
      }
      return {pass:samples.length===16&&samples.every(x=>x.angle_error<1e-9&&x.stopped_rate<1e-9),detail:samples};
    });
    function cycle(change){
      let thrust=0,load=0;
      for(let i=0;i<64;i++){
        const s={...initial(),velocity:[12,0,0],omega:2*Math.PI*1.1,phase:(i+.3)/64*2*Math.PI},pose=K.wingPose(s);
        change?.(pose);const f=P.forces(s,{...c,throttle:1},env,pose);
        thrust+=scalar(f.thrust,'thrust')/64;load+=scalar(f.aero_power_W,'aero_power_W')/64;
      }
      return {thrust_N:thrust,aero_power_W:load};
    }
    add('physics','locked_wings_no_propulsion',()=>{
      const locked=cycle(pose=>Object.values(pose).forEach(v=>{v.rate=0;v.twistRate=0;}));
      return {pass:locked.thrust_N<=1e-8&&Math.abs(locked.aero_power_W)<1e-8,detail:locked};
    });
    add('physics','outer_motion_changes_propulsion',()=>{
      const moving=cycle(),locked=cycle(pose=>{for(const n of ['leftOuter','rightOuter'])pose[n].rate=0;});
      return {pass:Math.abs(moving.thrust_N-locked.thrust_N)>1,detail:{moving,outer_locked:locked}};
    });
    add('physics','stroke_rate_changes_propulsion',()=>{
      const moving=cycle(),slow=cycle(pose=>Object.values(pose).forEach(v=>{v.rate*=.5;v.twistRate*=.5;}));
      return {pass:Math.abs(moving.thrust_N-slow.thrust_N)>1,detail:{moving,half_rate:slow}};
    });
    add('physics','shaft_power_limited',()=>{
      const samples=[];
      for(const throttle of [0,.2,1])for(const omega of [0,3,7,10]){
        const f=P.forces({...initial(),omega},{...c,throttle},env);samples.push({throttle,omega,power:scalar(f.power,'power')});
      }
      return {pass:samples.every(x=>x.power>=0&&x.power<=16000*x.throttle+1e-8)&&samples.some(x=>x.power>1000),detail:samples};
    });
    add('physics','drive_energy_balance',()=>{
      const s=run(initial(),{...c,throttle:1},3),drive=.5*E.engine.equivalent_drive_inertia_kg_m2*s.omega**2;
      const residual=s.shaft_work_J-s.aero_work_J-s.drive_heat_J-drive;
      return {pass:s.shaft_work_J>0&&s.drive_heat_J>=0&&Number.isFinite(residual)&&Math.abs(residual)<.01,detail:{shaft_work_J:s.shaft_work_J,aero_work_J:s.aero_work_J,heat_J:s.drive_heat_J,drive_J:drive,residual_J:residual}};
    });
    add('physics','bank_reduces_vertical_force',()=>{
      const s=initial(),flat=P.forces(s,c,env),banked=P.forces({...s,roll:Math.PI/3},c,env),weight=(E.dry_mass_including_pilot_kg+s.fuel_kg)*g;
      const a=flat.force[1]+weight,b=banked.force[1]+weight;
      return {pass:a>0&&near(b/a,.5,1e-5),detail:{level_vertical_N:a,banked_vertical_N:b,ratio:b/a}};
    });
    add('physics','banked_trim_loses_height',()=>{
      const base=initial(),unit=P.forces({...base,velocity:[1,0,0]},c,env).lift;
      const V=Math.sqrt((E.dry_mass_including_pilot_kg+base.fuel_kg)*g/unit);
      const a=run({...base,velocity:[V,0,0]},c,1),b=run({...base,velocity:[V,0,0],roll:Math.PI/4},c,1);
      return {pass:b.position[1]<a.position[1]-.15&&b.velocity[1]<a.velocity[1]-.3,detail:{initial_speed:V,height_difference:b.position[1]-a.position[1],straight_vy:a.velocity[1],banked_vy:b.velocity[1]}};
    });
    add('physics','neutral_bank_retains_bank',()=>{
      const s=run({...initial(),roll:.5},c,1);return {pass:Math.abs(s.roll-.5)<.01,detail:{initial:.5,after:s.roll}};
    });
    add('physics','post_stall_lift_reduces',()=>{
      const a=P.polar(E.aero.stall_alpha_rad),b=P.polar(E.aero.post_stall_transition_rad);
      return {pass:a.cl>b.cl+.2&&b.cd>a.cd+.1,detail:{at_stall:a,after_stall:b}};
    });
    add('physics','glide_ratio_in_envelope',()=>{
      let s=run({...initial(),pitch:-.08,velocity:[16,-1.2,0]},c,10),start=structuredClone(s);s=run(s,c,5);
      const lost=start.position[1]-s.position[1],distance=Math.hypot(s.position[0]-start.position[0],s.position[2]-start.position[2]),ratio=distance/lost;
      return {pass:lost>0&&ratio>=6&&ratio<=14&&near(s.fuel_kg,start.fuel_kg),detail:{distance_m:distance,height_lost_m:lost,ratio,envelope:[6,14],note:'Hypothetical model envelope, not measured flight data'}};
    });
    add('physics','locked_wings_matching_wind',()=>{
      const s=initial(),a=P.forces(s,c,env),b=P.forces(s,c,{...env,wind:s.velocity.slice()}),weight=(E.dry_mass_including_pilot_kg+s.fuel_kg)*g;
      return {pass:a.lift>0&&Math.hypot(b.force[0],b.force[1]+weight,b.force[2])<1e-7,detail:{force:b.force,weight_N:weight}};
    });
  }catch(e){out.error=String(e);}
  return out;
}
