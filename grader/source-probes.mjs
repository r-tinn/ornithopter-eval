// Browser-only independent implementation of the published reduced model.
// Never imports candidate geometry, mass helpers, counters or section functions as an oracle.
export async function sourceProbe({E,scenario='all'}){
  const result={physics:[],diagnostics:{},geometry:[]};
  const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),scale=(a,k)=>a.map(x=>x*k),dot=(a,b)=>a.reduce((v,x,i)=>v+x*b[i],0),norm=a=>Math.hypot(...a),unit=a=>norm(a)>1e-12?scale(a,1/norm(a)):[1,0,0],cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const names=['leftInner','leftOuter','rightInner','rightOuter'],AR=7.4**2/6.61,p={aspect_ratio:AR,wrist_span_fraction:.5,span_m:14,wing_area_m2:196/AR,dry_mass_kg:E.dry_mass_including_pilot_kg},h=E.coupled.derivative_step;
  const controls={throttle:0,pitch:0,bank:0,rudder:0,brake:0},env={rho:1.225,wind:[0,0,0],surfaceHeight:()=>0};
  const initial=(changes={})=>({position:[0,100,0],velocity:[18,0,0],pitch:0,roll:0,heading:0,pitch_rate:0,roll_rate:0,phase:.7,omega:4,fuel_kg:3.6,wheel_angle:0,shaft_work_J:0,aero_work_J:0,drive_heat_J:0,control_work_J:0,time:0,status:'flying',gliding:false,timing_bias:0,sweep_scale:1,...changes});
  const check=async(id,fn)=>{try{const detail=await fn();result.physics.push({id,pass:detail.pass===true,detail});}catch(error){result.physics.push({id,pass:false,detail:{error:String(error)}});}};
  const near=(a,b,abs=1e-4,rel=1e-4)=>Number.isFinite(a)&&Math.abs(a-b)<=abs+rel*Math.abs(b);
  function pose(s){
    const w=E.wing,theta=s.phase-(s.timing_bias??w.timing_bias_low_speed)*Math.sin(s.phase),v=Math.sin(theta),c=Math.cos(theta),out={};
    for(const name of names){const outer=name.endsWith('Outer');out[name]=s.gliding?{stroke:outer?0:w.dihedral_rad,twist:w.incidence_rad,sweep:0,exposure:1,camber:outer?w.camber_outer_base:w.camber_inner_base}:{stroke:(outer?0:w.dihedral_rad)-(outer?w.outer_amplitude_rad:w.inner_amplitude_rad)*v,twist:w.incidence_rad-(outer?w.outer_twist_amplitude_rad:w.inner_twist_amplitude_rad)*c,sweep:-w.sweep_amplitude_m*(outer?1:.5)*v*(s.sweep_scale??1),exposure:outer?1-(1-w.recovery_exposure)*(.5-.5*Math.tanh(4*c)/Math.tanh(4)):1,camber:(outer?w.camber_outer_base:w.camber_inner_base)+(outer?w.camber_outer_amplitude:w.camber_inner_amplitude)*c};}return out;
  }
  const half=7,hinge=E.wing.hinge_offset_m,inner=3.5-hinge,outer=3.5,tip=t=>E.wing.taper_ratio+(1-E.wing.taper_ratio)*Math.sqrt(Math.max(0,1-t*t));
  let integral=0;for(let i=0;i<4;i++)integral+=(tip(i/4)+tip((i+1)/4))/8;
  const chord=p.wing_area_m2/(2*(inner+outer*integral));
  function chordAt(t){const k=Math.min(3,Math.floor(t*4));return chord*(tip(k/4)+(tip((k+1)/4)-tip(k/4))*(t*4-k));}
  function at(q,name,leaf,t,u){
    const isOuter=name.endsWith('Outer'),left=name.startsWith('left'),sign=left?-1:1,inside=q[left?'leftInner':'rightInner'],v=q[name],stroke=inside.stroke+(isOuter?v.stroke:0),c=isOuter?chordAt(leaf/2+t/2):chord;
    const span=isOuter?outer*(leaf===0?t/2:v.exposure-.5+t/2):inner*t;
    const x=(.25-u)*c,y=4*u*(1-u)*c*v.camber-(isOuter&&leaf===1?.008:0),a=x*Math.cos(v.twist)-y*Math.sin(v.twist),b=x*Math.sin(v.twist)+y*Math.cos(v.twist);
    return [a+v.sweep,E.wing.root_height_m+(isOuter?inner*Math.sin(inside.stroke):0)+span*Math.sin(stroke)+b*Math.cos(stroke),sign*(hinge+(isOuter?inner*Math.cos(inside.stroke):0)+span*Math.cos(stroke)-b*Math.sin(stroke))];
  }
  function cloud(s){
    const q=pose(s),masses=[],samples=[];
    for(const name of names){const out=name.endsWith('Outer'),n=out?2:4,v=q[name],sign=name.startsWith('left')?-1:1,a=q[sign<0?'leftInner':'rightInner'].stroke+(out?v.stroke:0);
      for(let leaf=0;leaf<(out?2:1);leaf++)for(let i=0;i<n;i++){
        for(const u of [.2,.8])masses.push({kg:(out?E.coupled.mass_outer_per_side_kg:E.coupled.mass_inner_per_side_kg)/8,r:at(q,name,leaf,(i+.5)/n,u)});
        const lo=Math.min((i+1)/n,out&&leaf===1?Math.max(i/n,2*(1-v.exposure)):i/n),hi=(i+1)/n,t=(lo+hi)/2;
        samples.push({name,leaf,t,region:out?'outer':'inner',camber:v.camber,area:out?outer*(hi-lo)/4*(chordAt(leaf/2+lo/2)+chordAt(leaf/2+hi/2)):inner*(hi-lo)*chord,r:at(q,name,leaf,t,.25),chord:[Math.cos(v.twist),Math.sin(v.twist)*Math.cos(a),-sign*Math.sin(v.twist)*Math.sin(a)],normal:[-Math.sin(v.twist),Math.cos(v.twist)*Math.cos(a),-sign*Math.cos(v.twist)*Math.sin(a)],span:[0,sign*Math.sin(a),Math.cos(a)]});
      }
    }
    const mass=p.dry_mass_kg+s.fuel_kg,cg=masses.reduce((v,m)=>add(v,scale(m.r,m.kg/mass)),[0,0,0]);return {q,masses,samples,mass,cg,bodyMass:mass-masses.reduce((v,m)=>v+m.kg,0)};
  }
  function matrix(s){
    const mid=cloud(s),lo=cloud({...s,phase:s.phase-h}),hi=cloud({...s,phase:s.phase+h}),dc=scale(sub(hi.cg,lo.cg),1/(2*h));let A=E.engine.equivalent_drive_inertia_kg_m2,B=0,C=E.coupled.body_pitch_inertia_kg_m2;
    const rows=mid.masses.map((m,i)=>({m:m.kg,r:sub(m.r,mid.cg),j:sub(scale(sub(hi.masses[i].r,lo.masses[i].r),1/(2*h)),dc)}));rows.push({m:mid.bodyMass,r:scale(mid.cg,-1),j:scale(dc,-1)});
    for(const {m,r,j} of rows){const jtheta=[-r[1],r[0],0];A+=m*dot(j,j);B+=m*dot(j,jtheta);C+=m*dot(jtheta,jtheta);}return {...mid,A,B,C,dc};
  }
  function mechanism(s){
    const q=matrix(s),lo=matrix({...s,phase:s.phase-h}),hi=matrix({...s,phase:s.phase+h}),spring=s=>E.coupled.spring_stiffness_Nm_rad*(pose(s).leftInner.stroke-E.wing.dihedral_rad)**2;
    const plo=pose({...s,phase:s.phase-h}),phi=pose({...s,phase:s.phase+h});
    return {...q,U:spring(s),Up:(spring({...s,phase:s.phase+h})-spring({...s,phase:s.phase-h}))/(2*h),Ap:(hi.A-lo.A)/(2*h),Bp:(hi.B-lo.B)/(2*h),Cp:(hi.C-lo.C)/(2*h),samples:q.samples.map(v=>{const r=sub(v.r,q.cg),j=sub(scale(sub(at(phi,v.name,v.leaf,v.t,.25),at(plo,v.name,v.leaf,v.t,.25)),1/(2*h)),q.dc),jt=[-r[1],r[0],0];return {...v,r,j,jt,velocity:add(scale(j,s.omega),scale(jt,s.pitch_rate))};})};
  }
  function toWorld(v,s){const cr=Math.cos(s.roll),sr=Math.sin(s.roll),cp=Math.cos(s.pitch),sp=Math.sin(s.pitch),ch=Math.cos(s.heading),sh=Math.sin(s.heading),y=cr*v[1]-sr*v[2],z=sr*v[1]+cr*v[2],x=cp*v[0]-sp*y;return [ch*x-sh*z,sp*v[0]+cp*y,sh*x+ch*z];}
  const toBody=(v,s)=>[[1,0,0],[0,1,0],[0,0,1]].map(axis=>dot(v,toWorld(axis,s)));
  function polar(region,alpha,camber){const t=E.sections[region],xs=E.sections.alpha_rad,a=clamp(alpha,xs[0],xs.at(-1));let i=1;while(i<xs.length-1&&a>xs[i])i++;const f=(a-xs[i-1])/(xs[i]-xs[i-1]),cl=t.cl_base[i-1]*(1-f)+t.cl_base[i]*f+t.camber_lift_gain*(camber-t.camber_reference)*Math.cos(a);return {cl,cd:t.cd_base[i-1]*(1-f)+t.cd_base[i]*f+cl*cl/(Math.PI*E.aero.span_efficiency*AR)};}
  function expected(s,c,e){
    const q=mechanism(s),air=toBody(sub(s.velocity,e.wind),s);let F=[0,0,0],wing=[0,0,0],Qphi=0,Qpitch=0,D=0;
    function apply(f,r,j,loss,isWing=false){F=add(F,f);Qphi+=dot(f,j);Qpitch+=dot(f,[-r[1],r[0],0]);D+=loss;if(isWing)wing=add(wing,f);}
    for(const v of q.samples){const local=add(air,v.velocity),u=sub(local,scale(v.span,dot(local,v.span))),speed=norm(u);if(speed<1e-10||v.area<=0)continue;const d=scale(u,1/speed),a=Math.atan2(-dot(d,v.normal),dot(d,v.chord)),{cl,cd}=polar(v.region,a,v.camber),pressure=.5*e.rho*speed*speed*v.area;apply(add(scale(unit(cross(v.span,d)),pressure*cl),scale(d,-pressure*cd)),v.r,v.j,pressure*cd*speed,true);}
    const r0=scale(q.cg,-1),j0=scale(q.dc,-1),v0=add(air,add(scale(j0,s.omega),scale([-r0[1],r0[0],0],s.pitch_rate))),V=norm(v0),drag=.5*e.rho*V*V*Object.values(E.aero.body_flat_plate_areas_m2).reduce((a,b)=>a+b,0);apply(scale(unit(v0),-drag),r0,j0,drag*V);
    const rt=sub([-E.coupled.tail_arm_m,0,0],q.cg),vt=add(air,add(scale(j0,s.omega),scale([-rt[1],rt[0],0],s.pitch_rate))),ut=[vt[0],vt[1],0],vtm=norm(ut),d=unit(ut),alpha=Math.atan2(-ut[1],ut[0]),press=.5*e.rho*vtm*vtm*E.coupled.tail_area_m2,L=press*E.coupled.tail_lift_slope*clamp(alpha+E.coupled.tail_incidence_rad,-.35,.35),tailD=press*(E.coupled.tail_drag_coefficient+.08*alpha*alpha);apply(add(scale(unit(cross([0,0,1],d)),L),scale(d,-tailD)),rt,j0,tailD*vtm);
    const thr=clamp(c.throttle,0,1),cap=Math.min(E.engine.starting_torque_Nm,E.engine.continuous_shaft_limit_W*thr/Math.max(.5,Math.abs(s.omega))),torque=e.motor_enabled!==false&&s.fuel_kg>0&&thr>0&&!s.gliding&&s.omega>=0?clamp(E.engine.governor_torque_gain_Nm_s*(2*Math.PI*E.engine.maximum_wingbeat_hz*thr-s.omega),0,cap):0,power=torque*Math.max(0,s.omega),damping=e.damping_scale??1;
    const R1=torque*E.engine.transmission_efficiency+Qphi-q.Up-damping*E.coupled.phase_damping_Nm_s*s.omega-.5*q.Ap*s.omega*s.omega+.5*q.Cp*s.pitch_rate*s.pitch_rate,R2=Qpitch+E.coupled.pitch_control_torque_Nm*c.pitch-damping*E.coupled.pitch_damping_Nm_s*s.pitch_rate-q.Bp*s.omega*s.omega-q.Cp*s.omega*s.pitch_rate,det=q.A*q.C-q.B*q.B;
    const force=toWorld(F,s);force[1]-=q.mass*(e.gravity??E.gravity_m_s2);const side=unit([-s.velocity[2]+e.wind[2],0,s.velocity[0]-e.wind[0]]),rudder=.5*e.rho*norm(air)**2*p.wing_area_m2*E.controls.rudder_coefficient*c.rudder;
    return {force:add(force,scale(side,rudder)),lift:toWorld(wing,s)[1],thrust:wing[0],drag,power,motor_torque_Nm:torque*E.engine.transmission_efficiency,airspeed:norm(air),Qphi,Qpitch,aero_power_W:-Qphi*s.omega,wing_dissipation_W:D,mass_kg:q.mass,phase_accel:s.gliding?0:e.pitch_locked?R1/q.A:(q.C*R1-q.B*R2)/det,pitch_accel:e.pitch_locked?0:s.gliding?R2/q.C:(q.A*R2-q.B*R1)/det,q};
  }
  const energy=s=>{const q=matrix(s),U=E.coupled.spring_stiffness_Nm_rad*(pose(s).leftInner.stroke-E.wing.dihedral_rad)**2;return .5*q.mass*dot(s.velocity,s.velocity)+q.mass*E.gravity_m_s2*s.position[1]+.5*q.A*s.omega*s.omega+q.B*s.omega*s.pitch_rate+.5*q.C*s.pitch_rate*s.pitch_rate+U;};
  let P,K;
  try{P=await import('/physics.mjs');K=await import('/kinematics.mjs');}catch(error){for(const id of ['wing_cycle_force_coupling','elastic_inertial_exchange','wing_body_pitch_coupling','power_limited_flight','unpowered_glide_balance'])result.physics.push({id,pass:false,detail:{error:'Submission import: '+String(error)}});return result;}
  if(scenario==='all'||scenario==='wing')await check('wing_cycle_force_coupling',async()=>{
    const cases=[],errors=[];
    for(const bias of [0,.3])for(const phase of [0,.7,1.8,3.2,4.9])for(const omega of [0,4]){
      const s=initial({phase,omega,timing_bias:bias,velocity:[18,-.4,.3],pitch:.07,pitch_rate:.08}),want=expected(s,controls,env),actual=P.forces(s,controls,env),actualPose=K.wingPose(s),wantPose=pose(s);
      const fields=['lift','thrust','drag','Qphi','Qpitch','aero_power_W','wing_dissipation_W','mass_kg'];
      const valid=fields.every(k=>near(actual[k],want[k]))&&actual.force?.every((x,i)=>near(x,want.force[i]))&&names.every(n=>Object.keys(wantPose[n]).every(k=>near(actualPose[n]?.[k],wantPose[n][k],1e-7,1e-7)));
      cases.push({phase,omega,bias,pass:valid,expected:Object.fromEntries(fields.map(k=>[k,want[k]])),actual:Object.fromEntries(fields.map(k=>[k,actual[k]]))});
    }
    const T=await import('/environment/vendor/three.module.min.js'),A=await import('/aircraft.mjs'),H=await import('/environment/source-mechanism.mjs'),a=A.createAircraft(T,P.parameters),rootInv=new T.Matrix4();
    for(const phase of [0,1,Math.PI,5]){
      const s=initial({phase}),q=pose(s);A.updateAircraft(a,s,controls);H.mountWingPose(a,K.wingPose(s),P.parameters);a.root.updateMatrixWorld(true);rootInv.copy(a.root.matrixWorld).invert();
      for(const name of names){const count=name.endsWith('Outer')?2:4,leaves=a.wingPanels[name];if(!Array.isArray(leaves)||leaves.length!==(name.endsWith('Outer')?2:1))throw Error('Missing actual leaf meshes');
        for(let leaf=0;leaf<leaves.length;leaf++){const mesh=leaves[leaf];if(!mesh.isMesh||a.root.getObjectById(mesh.id)!==mesh)throw Error('Leaf is not in production model');const attr=mesh.geometry.getAttribute('position');for(let j=0;j<=count;j++)for(let u=0;u<3;u++){const v=new T.Vector3().fromBufferAttribute(attr,j*3+u).applyMatrix4(mesh.matrixWorld).applyMatrix4(rootInv).toArray(),target=at(q,name,leaf,j/count,u/2);errors.push(norm(sub(v,target)));}}
      }
    }
    return {pass:cases.every(x=>x.pass)&&errors.length>0&&Math.max(...errors)<.0002,cases,production_vertex_samples:errors.length,max_geometry_error_m:Math.max(...errors),tolerance:'forces 0.01% + 1e-4 SI; pose 1e-7; actual vertex positions 0.2 mm'};
  });
  if(scenario==='all'||scenario==='elastic')await check('elastic_inertial_exchange',async()=>{
    const cases=[];
    for(const damping of [0,1]){let s=initial({velocity:[0,0,0],phase:.25,omega:0,pitch:0,pitch_rate:0}),e={...env,rho:0,gravity:0,pitch_locked:true,motor_enabled:false,damping_scale:damping},q0=matrix(s),potential=x=>E.coupled.spring_stiffness_Nm_rad*(pose(x).leftInner.stroke-E.wing.dihedral_rad)**2,measure=x=>.5*matrix(x).A*x.omega*x.omega+potential(x),E0=measure(s),loss=0,maxDrift=0,maxSpeed=0,records=[];
      for(let i=0;i<600;i++){const before=s;s=P.step(s,controls,e,1/240);loss+=damping*E.coupled.phase_damping_Nm_s*(before.omega**2+s.omega**2)/2/240;const Et=measure(s);maxDrift=Math.max(maxDrift,Math.abs(Et+loss-E0));maxSpeed=Math.max(maxSpeed,Math.abs(s.omega));if(i%12===0)records.push({time:s.time,phase:s.phase,omega:s.omega,kinetic_J:Et-potential(s),spring_J:potential(s),loss_J:loss});}
      cases.push({damping,pass:maxSpeed>.2&&maxDrift<.005*E0+.1&&(damping===0||loss>1),initial_energy_J:E0,final_energy_J:measure(s),integrated_damping_J:loss,max_energy_residual_J:maxDrift,max_speed_rad_s:maxSpeed,records});
    }
    return {pass:cases.every(x=>x.pass),cases,tolerance:'0.5% initial elastic energy + 0.1 J; nontrivial motion; damped case loses >1 J'};
  });
  if(scenario==='all'||scenario==='pitch')await check('wing_body_pitch_coupling',async()=>{
    const cases=[];for(const phase of [.7,1.8])for(const sweep_scale of [1,0]){const s=initial({phase,sweep_scale,omega:3,velocity:[0,0,0],pitch_rate:.15}),e={...env,rho:0,gravity:0,motor_enabled:false,damping_scale:0},want=expected(s,controls,e),got=P.accelerations(s,controls,e);let a={...s};
      for(let i=0;i<40;i++){const u=expected(a,controls,e),mid={...a,phase:a.phase+a.omega*.0005,omega:a.omega+u.phase_accel*.0005,pitch:a.pitch+a.pitch_rate*.0005,pitch_rate:a.pitch_rate+u.pitch_accel*.0005},v=expected(mid,controls,e);a={...a,phase:a.phase+mid.omega*.001,omega:a.omega+v.phase_accel*.001,pitch:a.pitch+mid.pitch_rate*.001,pitch_rate:a.pitch_rate+v.pitch_accel*.001};}
      const actual=P.step(s,controls,e,.04),pass=near(got.phase_accel,want.phase_accel)&&near(got.pitch_accel,want.pitch_accel)&&near(actual.pitch,a.pitch,.0005,0)&&near(actual.pitch_rate,a.pitch_rate,.005,0)&&near(actual.phase,a.phase,.001,0)&&near(actual.omega,a.omega,.005,0);
      cases.push({phase,sweep_scale,pass,expected_acceleration:[want.phase_accel,want.pitch_accel],actual_acceleration:[got.phase_accel,got.pitch_accel],expected_after_40ms:{phase:a.phase,omega:a.omega,pitch:a.pitch,pitch_rate:a.pitch_rate},actual_after_40ms:actual,mass_matrix:{A:want.q.A,B:want.q.B,C:want.q.C}});
    }return {pass:cases.every(x=>x.pass)&&Math.abs(cases[0].expected_acceleration[1]-cases[1].expected_acceleration[1])>.001,cases,tolerance:'initial acceleration 0.01% + 1e-4; 40 ms pitch 0.5 mrad, rate 0.005 rad/s'};
  });
  if(scenario==='all'||scenario==='power')await check('power_limited_flight',async()=>{
    const limits=[],derivatives=[];
    for(const fuel of [0,3.6])for(const throttle of [0,.3,1])for(const omega of [0,.1,3,5,6,8]){
      const s=initial({fuel_kg:fuel,omega}),c={...controls,throttle},f=P.forces(s,c,env),want=expected(s,c,env),pass=near(f.power,want.power)&&near(f.motor_torque_Nm,want.motor_torque_Nm,.001,.001)&&f.power<=16000*throttle+.001&&f.power>=0;
      limits.push({fuel,throttle,omega,power:f.power,expected_power:want.power,pass});
    }
    for(const phase of [.4,1.7,3.8]){
      const s=initial({phase,pitch:.08,pitch_rate:.1}),c={...controls,throttle:1,pitch:.2},want=expected(s,c,env),after=P.step(s,c,env,.00002),constantMassAfter={...after,fuel_kg:s.fuel_kg},rate=(energy(constantMassAfter)-energy(s))/.00002,
        correct=want.power*E.engine.transmission_efficiency-want.wing_dissipation_W-E.coupled.phase_damping_Nm_s*s.omega**2-E.coupled.pitch_damping_Nm_s*s.pitch_rate**2+E.coupled.pitch_control_torque_Nm*c.pitch*s.pitch_rate;
      derivatives.push({phase,actual_energy_rate_W:rate,expected_energy_rate_W:correct,pass:near(rate,correct,10,.003)});
    }
    const W=await import('/environment/world.mjs'),field=W.AIRFIELDS[0],e={...env,surfaceHeight:W.surfaceHeight};let s=initial({position:[field.x+field.start,2,field.z],velocity:[0,0,0],omega:0,phase:0,pitch:0,pitch_rate:0,timing_bias:.3,status:'grounded'});s.position[1]=P.contactHeight(s,e);
    let shaftWork=0,fuelUsedExpected=0,firstSustained=null,clearFor=0,bad=false;const trajectory=[];
    for(let i=0;i<70*120;i++){
      const c={...controls,throttle:1,pitch:clamp(4*(.12-s.pitch)-s.pitch_rate,-1,1),bank:s.time>62?clamp(2*(.45-s.roll)-s.roll_rate,-1,1):0},f=P.forces(s,c,e),before=s;
      if(!Number.isFinite(f.power)||f.power<0||f.power>16000.001){bad=true;break;}
      s=P.step(s,c,e,1/120);const f1=P.forces(s,c,e),work=(f.power+f1.power)/2/120;shaftWork+=work;fuelUsedExpected+=(work*E.fuel.bsfc_kg_kWh/3600000+E.fuel.idle_kg_s/120);
      const clearance=s.position[1]-P.contactHeight(s,e);clearFor=clearance>.3&&s.status==='flying'?clearFor+1/120:0;
      if(clearFor>=2&&firstSustained===null)firstSustained={time:s.time,x:s.position[0],clearance};
      if(i%12===0)trajectory.push({state:s,clearance,power_W:f1.power,independent_force_residual_N:norm(sub(f1.force,expected(s,c,e).force))});
      if(!s.position.every(Number.isFinite)||s.status==='crashed'){bad=true;break;}
    }
    const fuelUsed=3.6-s.fuel_kg,runwayEnd=field.x+field.length/2,finalClearance=s.position[1]-P.contactHeight(s,e),trajectoryForceCorrect=trajectory.every(x=>x.independent_force_residual_N<.1),fuelCorrect=near(fuelUsed,fuelUsedExpected,.0001,.01),airborne=firstSustained!==null&&firstSustained.x<runwayEnd&&s.time>=69.99&&s.status==='flying'&&finalClearance>1&&s.roll>.25;
    return {pass:!bad&&limits.every(x=>x.pass)&&derivatives.every(x=>x.pass)&&trajectoryForceCorrect&&fuelCorrect&&airborne,limits,derivatives,first_sustained_takeoff:firstSustained,runway_end_x:runwayEnd,final_state:s,final_clearance_m:finalClearance,shaft_work_integral_J:shaftWork,fuel_used_kg:fuelUsed,expected_fuel_used_kg:fuelUsedExpected,trajectory_force_correct:trajectoryForceCorrect,fuel_correct:fuelCorrect,trajectory,tolerance:'Engine cap exact to .001 W; energy derivative 10 W + 0.3%; fuel 0.1 g + 1%; source forces within .1 N; >=2 s clear by .3 m before runway end, bank >.25 rad and >1 m clear at 70 s.'};
  });
  if(scenario==='all'||scenario==='glide')await check('unpowered_glide_balance',async()=>{
    const cases=[];
    for(const speedScale of [.9,1,1.1]){
    let s=initial({phase:0,omega:0,velocity:scale(E.glide.velocity_m_s,speedScale),pitch:E.glide.pitch_rad,pitch_rate:0,gliding:true}),start={...s},E0=energy(s),loss=0,maxResidual=0,maxAccelerationError=0;const records=[];
    for(let i=0;i<1200;i++){
      const f=expected(s,controls,env),before=s;s=P.step(s,controls,env,1/120);const f1=expected(s,controls,env);
      loss+=(f.wing_dissipation_W+f1.wing_dissipation_W+E.coupled.pitch_damping_Nm_s*(before.pitch_rate**2+s.pitch_rate**2))/2/120;
      const residual=energy(s)+loss-E0;maxResidual=Math.max(maxResidual,Math.abs(residual));
      maxAccelerationError=Math.max(maxAccelerationError,norm(sub(scale(sub(s.velocity,before.velocity),120),scale(add(f.force,f1.force),.5/(p.dry_mass_kg+s.fuel_kg)))));
      if(i%24===0)records.push({state:s,mechanical_energy_J:energy(s),integrated_loss_J:loss,residual_J:residual});
      if(!s.position.every(Number.isFinite)||s.status==='crashed')throw Error('Glide crashed or became non-finite');
    }
    const heightLost=start.position[1]-s.position[1],distance=Math.hypot(s.position[0]-start.position[0],s.position[2]-start.position[2]),noPower=near(s.fuel_kg,3.6,1e-10,0)&&Math.abs(P.forces(s,controls,env).power)<1e-8;
    cases.push({pass:noPower&&heightLost>.1&&distance>1&&loss>1&&maxResidual<1+.005*loss&&maxAccelerationError<.02,speedScale,initial_energy_J:E0,final_energy_J:energy(s),integrated_loss_J:loss,max_energy_residual_J:maxResidual,max_acceleration_error_m_s2:maxAccelerationError,height_lost_m:heightLost,distance_m:distance,distance_per_height:distance/heightLost,no_motor_or_fuel_use:noPower,records});
    }
    return {pass:cases.every(x=>x.pass),cases,tolerance:'10 s actual glides at 90%,100%,110% trim speed; positive descent, no arbitrary L/D band; energy residual <1 J + 0.5% losses; independently reconstructed acceleration within .02 m/s².'};
  });
  result.diagnostics.reference_equations='Independent mass points, centroid, inertia, local sections and coupled E-L solve; no candidate counters/helpers used as expectations.';
  return result;
}
