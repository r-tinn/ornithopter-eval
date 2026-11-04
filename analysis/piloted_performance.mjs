// Trusted handwritten fixture diagnostics, never a generator trial or empirical flight data.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const [packet,output]=process.argv.slice(2),root=path.resolve(packet),submission=path.join(root,'submission');
const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
if(!manifest.reference_fixture||!manifest.not_a_model_submission)throw Error('Select only a labelled handwritten reference packet');
try{await fs.access(output);throw Error('Use a fresh output path');}catch(e){if(e.code!=='ENOENT')throw e;}
const moduleURL=n=>pathToFileURL(path.join(submission,n)).href;
const P=await import(moduleURL('physics.mjs')),K=await import(moduleURL('kinematics.mjs')),{E}=await import(moduleURL('environment/engineering.mjs'));
if(!P.parameters.fixture_only)throw Error('This diagnostic executes only the trusted fixture');
const env={wind:[0,0,0],rho:1.225,surfaceHeight:()=>0},c={throttle:1,pitch:0,bank:0,rudder:0,brake:0};
const initial=()=>({position:[0,1.43,0],velocity:[0,0,0],pitch:0,roll:0,heading:0,phase:E.wing.parked_phase_rad,omega:0,fuel_kg:E.fuel.initial_kg,pitch_rate:0,roll_rate:0,wheel_angle:0,shaft_work_J:0,aero_work_J:0,drive_heat_J:0,time:0,status:'grounded'});
const cycles=[];
for(const V of [0,12,16,20]){
  let axial=0,load=0,dissipation=0,body=0;
  for(let i=0;i<256;i++){
    const s={...initial(),position:[0,1000,0],velocity:[V,0,0],omega:2*Math.PI*1.1,phase:(i+.37)/256*2*Math.PI},f=P.forces(s,c,env,K.wingPose(s));
    axial+=f.thrust/256;load+=f.aero_power_W/256;dissipation+=f.wing_dissipation_W/256;body=f.drag;
  }
  cycles.push({speed_m_s:V,imposed_wingbeat_hz:1.1,mean_wing_axial_N:axial,mean_aero_load_W:load,mean_wing_dissipation_W:dissipation,
    body_drag_N:body,net_forward_force_N:axial-body,net_wing_propulsion_efficiency:V*axial/load,
    wing_power_identity_residual_W:load-dissipation-V*axial});
}
const sensitivity=[],original=structuredClone(E),dry=P.parameters.dry_mass_kg,baseArea=Object.values(E.aero.body_flat_plate_areas_m2).reduce((a,b)=>a+b,0);
for(const [name,eta,area,delta=0] of [['baseline',.85,.9],['lower_transmission_efficiency',.75,.9],['higher_transmission_efficiency',.92,.9],['lower_body_drag',.85,.6],['higher_body_drag',.85,1.2],['lighter_nonpilot_airframe',.85,.9,-.2*(dry-55)],['heavier_nonpilot_airframe',.85,.9,.2*(dry-55)]]){
  E.engine.transmission_efficiency=eta;
  P.parameters.dry_mass_kg=dry+delta;P.parameters.mass_kg=dry+delta+E.fuel.initial_kg;
  E.aero.body_flat_plate_areas_m2=Object.fromEntries(Object.entries(original.aero.body_flat_plate_areas_m2).map(([k,v])=>[k,v*area/baseArea]));
  let s=initial(),start=null,firstFlying=null,error=null;
  try{for(let i=1;i<=7200;i++){
    s=P.step(s,c,env,1/120);if(firstFlying===null&&s.status==='flying')firstFlying={time_s:s.time,distance_m:s.position[0]};
    if(i===3600)start=structuredClone(s);
  }}catch(e){error=String(e);}
  sensitivity.push({scenario:name,transmission_efficiency:eta,body_flat_plate_area_m2:area,dry_mass_kg:dry+delta,error,
    first_airborne_sample:firstFlying,note:'First airborne sample can be a hop; sustained takeoff is a separate browser predicate.',
    mean_climb_30_to_60_s_m_s:start?(s.position[1]-start.position[1])/(s.time-start.time):null,
    shaft_work_J:s.shaft_work_J,fuel_used_kg:E.fuel.initial_kg-s.fuel_kg,final_state:s});
}
Object.assign(E.engine,original.engine);E.aero.body_flat_plate_areas_m2=original.aero.body_flat_plate_areas_m2;
P.parameters.dry_mass_kg=dry;P.parameters.mass_kg=dry+E.fuel.initial_kg;
const pairedBank=[];let straight=structuredClone(sensitivity[0].final_state),banked=structuredClone(straight);
for(let i=1;i<=600;i++){
  straight=P.step(straight,c,env,1/120);banked=P.step(banked,{...c,bank:i<=240?1:0},env,1/120);
  if([120,240,360,600].includes(i))pairedBank.push({elapsed_s:i/120,bank_input:i<=240?1:0,
    straight:{height_m:straight.position[1],climb_m_s:straight.velocity[1],bank_rad:straight.roll},
    banked:{height_m:banked.position[1],climb_m_s:banked.velocity[1],bank_rad:banked.roll},
    height_difference_m:banked.position[1]-straight.position[1]});
}
const sha=async name=>createHash('sha256').update(await fs.readFile(path.join(submission,name))).digest('hex');
const report={kind:'v5 handwritten reference performance and sensitivity',model_trial:false,empirically_validated:false,
  cycles,sensitivity,paired_full_power_bank:pairedBank,full_power_endurance_minutes:60*E.fuel.initial_kg/(E.engine.continuous_shaft_limit_W/1000*E.fuel.bsfc_kg_kWh+E.fuel.idle_kg_s*3600),
  full_power_endurance_with_planning_reserve_minutes:60*E.fuel.initial_kg*(1-E.fuel.planning_reserve_fraction)/(E.engine.continuous_shaft_limit_W/1000*E.fuel.bsfc_kg_kWh+E.fuel.idle_kg_s*3600),
  source_sha256:Object.fromEntries(await Promise.all(['physics.mjs','kinematics.mjs','environment/engineering.mjs','environment/mechanism.mjs'].map(async n=>[n,await sha(n)])))};
await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({cycles,sensitivity:sensitivity.map(x=>({scenario:x.scenario,mean_climb_m_s:x.mean_climb_30_to_60_s_m_s,error:x.error}))},null,2));
