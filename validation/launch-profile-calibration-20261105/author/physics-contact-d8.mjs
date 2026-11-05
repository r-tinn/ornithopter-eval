// Withheld handwritten calibration fixture. Hypothetical reduced mechanics only.
import {E} from './environment/engineering.mjs';
import {mechanics,centre,bodyToWorld,worldToBody,add,sub,mul,dot,cross,unit} from './environment/source-mechanism.mjs';
import {wingPose} from './kinematics.mjs';
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x)),AR=7.4**2/6.61;
export const parameters={fixture_only:true,aspect_ratio:AR,wrist_span_fraction:.5,span_m:E.span_m,wing_area_m2:E.span_m**2/AR,body_length_m:E.body_length_m,pilot_mass_kg:E.pilot_mass_kg,dry_mass_kg:E.dry_mass_including_pilot_kg,mass_kg:E.dry_mass_including_pilot_kg+E.fuel.initial_kg,mass_budget:E.mass_budget,wheel_radius_m:E.wheel_radius_m,gear_centres:E.gear_centres_m};
export function polar(region,alpha,camber){
  const table=E.sections[region],xs=E.sections.alpha_rad,a=clamp(alpha,xs[0],xs.at(-1));
  let i=1;while(i<xs.length-1&&a>xs[i])i++;
  const t=(a-xs[i-1])/(xs[i]-xs[i-1]),interp=ys=>ys[i-1]*(1-t)+ys[i]*t;
  const cl=interp(table.cl_base)+table.camber_lift_gain*(camber-table.camber_reference)*Math.cos(alpha);
  return {cl,cd:interp(table.cd_base)+cl*cl/(Math.PI*E.aero.span_efficiency*AR)};
}
function evaluate(s,c,e,override){
  const fn=override?()=>override:wingPose,q=mechanics(parameters,s,fn),air=worldToBody(sub(s.velocity,e.wind),s),rho=e.rho;
  let total=[0,0,0],Qphi=0,Qpitch=0,dissipation=0,wing=[0,0,0];
  function apply(F,r,jphi,diss=0,isWing=false){total=add(total,F);Qphi+=dot(F,jphi);Qpitch+=dot(F,[-r[1],r[0],0]);dissipation+=diss;if(isWing)wing=add(wing,F);}
  for(const v of q.samples){
    if(v.area<=0)continue;
    const local=add(air,v.velocity),u=sub(local,mul(v.span,dot(local,v.span))),speed=Math.hypot(...u);
    if(speed<1e-10)continue;
    const d=mul(u,1/speed),alpha=Math.atan2(-dot(d,v.normal),dot(d,v.chord)),a=polar(v.region,alpha,v.camber),pressure=.5*rho*speed*speed*v.area;
    apply(add(mul(unit(cross(v.span,d)),pressure*a.cl),mul(d,-pressure*a.cd)),v.r,v.jphi,pressure*a.cd*speed,true);
  }
  const r0=mul(q.cg,-1),j0=mul(q.dc,-1),v0=add(air,add(mul(j0,s.omega),mul([-r0[1],r0[0],0],s.pitch_rate))),speed0=Math.hypot(...v0),bodyDrag=.5*rho*speed0**2*Object.values(E.aero.body_flat_plate_areas_m2).reduce((a,b)=>a+b,0);
  apply(mul(unit(v0),-bodyDrag),r0,j0,bodyDrag*speed0);
  const rt=sub([-E.coupled.tail_arm_m,0,0],q.cg),vt=add(air,add(mul(j0,s.omega),mul([-rt[1],rt[0],0],s.pitch_rate))),ut=[vt[0],vt[1],0],Vt=Math.hypot(...ut),dt=unit(ut),alpha=Math.atan2(-ut[1],ut[0]),tailL=.5*rho*Vt**2*E.coupled.tail_area_m2*E.coupled.tail_lift_slope*clamp(alpha+E.coupled.tail_incidence_rad,-.35,.35),tailD=.5*rho*Vt**2*E.coupled.tail_area_m2*(E.coupled.tail_drag_coefficient+.08*alpha*alpha);
  apply(add(mul(unit(cross([0,0,1],dt)),tailL),mul(dt,-tailD)),rt,j0,tailD*Vt);
  const throttle=clamp(c.throttle,0,1),cap=Math.min(E.engine.starting_torque_Nm,E.engine.continuous_shaft_limit_W*throttle/Math.max(.5,Math.abs(s.omega))),target=2*Math.PI*E.engine.maximum_wingbeat_hz*throttle;
  const shaftTorque=e.motor_enabled!==false&&s.fuel_kg>0&&throttle>0&&!s.gliding&&s.omega>=0?clamp(E.engine.governor_torque_gain_Nm_s*(target-s.omega),0,cap):0,power=shaftTorque*Math.max(0,s.omega),motorTorque=shaftTorque*E.engine.transmission_efficiency;
  const damping=e.damping_scale??1,controlTorque=E.coupled.pitch_control_torque_Nm*c.pitch;
  const force=bodyToWorld(total,s);force[1]-=q.mass*(e.gravity??E.gravity_m_s2);
  const yawForce=.5*rho*Math.hypot(...air)**2*parameters.wing_area_m2*E.controls.rudder_coefficient*c.rudder,side=unit([-s.velocity[2]+e.wind[2],0,s.velocity[0]-e.wind[0]]);
  return {force:add(force,mul(side,yawForce)),lift:bodyToWorld(wing,s)[1],thrust:wing[0],drag:bodyDrag,power,airspeed:Math.hypot(...air),wing_force_body_N:wing,aero_power_W:-Qphi*s.omega,wing_dissipation_W:dissipation,Qphi,Qpitch,motor_torque_Nm:motorTorque,control_torque_Nm:controlTorque,phase_damping_Nm:damping*E.coupled.phase_damping_Nm_s*s.omega,pitch_damping_Nm:damping*E.coupled.pitch_damping_Nm_s*s.pitch_rate,mass_kg:q.mass,_mechanics:q};
}
export function forces(s,c,e,override){const {_mechanics,...result}=evaluate(s,c,e,override);return result;}
export function accelerations(s,c,e){
  const f=evaluate(s,c,e),q=f._mechanics,w=s.omega,v=s.pitch_rate;
  const r1=f.motor_torque_Nm+f.Qphi-q.Up-f.phase_damping_Nm-.5*q.Ap*w*w+.5*q.Cp*v*v;
  const r2=f.Qpitch+f.control_torque_Nm-f.pitch_damping_Nm-q.Bp*w*w-q.Cp*w*v;
  const det=q.A*q.C-q.B*q.B;
  const phase_accel=s.gliding?0:e.pitch_locked?r1/q.A:(r1*q.C-q.B*r2)/det,pitch_accel=e.pitch_locked?0:s.gliding?r2/q.C:(q.A*r2-q.B*r1)/det;
  let phaseResult=phase_accel,pitchResult=pitch_accel,grounded=false,normal=0;
  if((s.status==='grounded'||s.status==='landed')&&!e.pitch_locked){
    const Ag=q.A+q.mass*q.dc[1]**2,Agp=q.Ap+2*q.mass*q.dc[1]*q.ddc[1];
    const ag=(f.motor_torque_Nm+f.Qphi-q.Up-f.phase_damping_Nm-.5*Agp*w*w+f.force[1]*q.dc[1])/Ag;
    normal=q.mass*(q.ddc[1]*w*w+q.dc[1]*ag)-f.force[1];
    if(normal>=0){phaseResult=ag;pitchResult=0;grounded=true;}
  }
  return {phase_accel:phaseResult,pitch_accel:pitchResult,grounded,normal_N:normal,force:f.force,power:f.power,dissipation_W:f.wing_dissipation_W,heat_W:f.phase_damping_Nm*w+f.pitch_damping_Nm*v+f.power*(1-E.engine.transmission_efficiency),control_work_W:f.control_torque_Nm*v};
}
export function contactHeight(s,e){const cg=centre(parameters,s,wingPose);return Math.max(...parameters.gear_centres.map(p=>{const r=bodyToWorld(sub(p,cg),s);return e.surfaceHeight(s.position[0]+r[0],s.position[2]+r[2])+parameters.wheel_radius_m-r[1];}));}
function tick(s,c,e,h){
  if(s.status==='crashed')return {...s,time:s.time+h};
  const mass=parameters.dry_mass_kg+s.fuel_kg,a=accelerations(s,c,e),mid={...s,phase:s.phase+s.omega*h/2,omega:s.omega+a.phase_accel*h/2,pitch:s.pitch+s.pitch_rate*h/2,pitch_rate:s.pitch_rate+a.pitch_accel*h/2,position:add(s.position,mul(s.velocity,h/2)),velocity:add(s.velocity,mul(a.force,h/(2*mass)))};
  if(a.grounded){mid.pitch=0;mid.pitch_rate=0;mid.position[1]=contactHeight(mid,e);const qm=mechanics(parameters,mid,wingPose);mid.velocity[1]=qm.dc[1]*mid.omega;}
  const b=accelerations(mid,c,e),v=add(s.velocity,mul(b.force,h/mass)),p=add(s.position,mul(mid.velocity,h)),out={...s,velocity:v,position:p,phase:s.phase+mid.omega*h,omega:s.omega+b.phase_accel*h,pitch:s.pitch+mid.pitch_rate*h,pitch_rate:s.pitch_rate+b.pitch_accel*h,time:s.time+h};
  out.roll_rate=s.roll_rate+(E.controls.roll_accel_rad_s2*c.bank-E.controls.roll_damping_per_s*s.roll_rate)*h;out.roll=clamp(s.roll+out.roll_rate*h,-E.controls.bank_limit_rad,E.controls.bank_limit_rad);
  if(Math.hypot(v[0],v[2])>.1)out.heading=Math.atan2(v[2],v[0]);
  const fuel=Math.min(s.fuel_kg,(b.power*E.fuel.bsfc_kg_kWh/3600000+(c.throttle>0&&s.fuel_kg>0?E.fuel.idle_kg_s:0))*h);
  out.fuel_kg=Math.max(0,s.fuel_kg-fuel);out.shaft_work_J=(s.shaft_work_J??0)+b.power*h;out.aero_work_J=(s.aero_work_J??0)+b.dissipation_W*h;out.drive_heat_J=(s.drive_heat_J??0)+b.heat_W*h;out.control_work_J=(s.control_work_J??0)+b.control_work_W*h;
  const floor=contactHeight(out,e),ground=s.position[1]<=contactHeight(s,e)+1e-4;
  if(out.position[1]<=floor){
    const impact={...out,position:out.position.slice(),velocity:out.velocity.slice()};
    out.position[1]=floor;out.velocity[1]=Math.max(0,out.velocity[1]);out.pitch=s.pitch;out.pitch_rate=0;out.position[1]=contactHeight(out,e);
    if(s.status==='flying'){
      const q=mechanics(parameters,impact,wingPose),wheelSink=Math.min(...parameters.gear_centres.flatMap(g=>{
        const r=sub(g,q.cg),wr=bodyToWorld(r,impact),clearance=impact.position[1]+wr[1]-parameters.wheel_radius_m-e.surfaceHeight(impact.position[0]+wr[0],impact.position[2]+wr[2]);
        if(clearance>1e-7)return [];
        const local=sub(mul([-r[1],r[0],0],impact.pitch_rate),mul(q.dc,impact.omega));
        return [impact.velocity[1]+bodyToWorld(local,impact)[1]];
      }));
      (globalThis.__launchContacts??=[]).push({time:impact.time,sink_m_s:-wheelSink,speed_m_s:Math.hypot(impact.velocity[0],impact.velocity[2])});out.status=wheelSink>=-E.controls.safe_touchdown_sink_m_s&&Math.abs(impact.roll)<E.controls.safe_touchdown_bank_rad&&Math.hypot(impact.velocity[0],impact.velocity[2])<=E.controls.safe_touchdown_speed_m_s?'landed':'crashed';
    }
    if(s.status==='flying'&&out.status==='landed'){
      const qi=mechanics(parameters,impact,wingPose),before=.5*qi.mass*impact.velocity[1]**2+.5*qi.A*impact.omega**2+qi.B*impact.omega*impact.pitch_rate+.5*qi.C*impact.pitch_rate**2;
      out.omega=(qi.A*impact.omega+qi.B*impact.pitch_rate+qi.mass*qi.dc[1]*impact.velocity[1])/(qi.A+qi.mass*qi.dc[1]**2);
      out.pitch=0;out.pitch_rate=0;out.position[1]=contactHeight(out,e);
      const qn=mechanics(parameters,out,wingPose);out.velocity[1]=qn.dc[1]*out.omega;
      const after=.5*(qn.A+qn.mass*qn.dc[1]**2)*out.omega**2;
      out.drive_heat_J+=Math.max(0,before-after);
    }
    const horizontal=Math.hypot(v[0],v[2]);if(horizontal>0){const loss=Math.min(horizontal,(.015*(e.gravity??E.gravity_m_s2)+c.brake*500/mass)*h);out.velocity[0]*=1-loss/horizontal;out.velocity[2]*=1-loss/horizontal;}
  }else out.status='flying';
  if(a.grounded&&b.grounded){out.pitch=0;out.pitch_rate=0;out.position[1]=contactHeight(out,e);const q=mechanics(parameters,out,wingPose);out.velocity[1]=q.dc[1]*out.omega;out.status='grounded';}
  out.wheel_angle=(s.wheel_angle??0)+(ground?Math.hypot(s.velocity[0],s.velocity[2])*h/parameters.wheel_radius_m:0);
  return out;
}
export function step(s,c,e,dt){if(!Number.isFinite(dt)||dt<=0||dt>.05)throw Error('dt outside (0,.05]');let out=s;for(let t=0;t<dt-1e-12;){const h=Math.min(E.coupled.integration_dt_max/8,dt-t);out=tick(out,c,e,h);t+=h;}return out;}
