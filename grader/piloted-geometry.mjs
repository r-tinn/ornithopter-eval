export async function pilotedGeometry(){
  const out=[];
  const add=(id,fn)=>{try{const r=fn();out.push({id,pass:r.pass===true,detail:r.detail});}catch(e){out.push({id,pass:false,detail:{error:String(e)}});}};
  try{
    const T=await import('./environment/vendor/three.module.min.js'),A=await import('./aircraft.mjs'),P=await import('./physics.mjs'),K=await import('./kinematics.mjs'),M=await import('./environment/mechanism.mjs');
    const aircraft=A.createAircraft(T,P.parameters),p=P.parameters,g=M.planform(p),controls={throttle:1,pitch:0,bank:0,rudder:0,brake:0};
    const state={position:[0,0,0],velocity:[16,0,0],pitch:0,roll:0,heading:0,phase:.37,omega:6.2,fuel_kg:3.6,time:0,status:'flying'};
    add('pilot_mesh_present',()=>{
      const pilot=aircraft.pilot,bounds=new T.Box3();let meshes=0;
      if(!pilot?.isObject3D||aircraft.root.getObjectById(pilot.id)!==pilot||!pilot.visible)throw Error('Pilot must be mounted and visible');
      aircraft.root.updateMatrixWorld(true);
      pilot.traverse(node=>{
        if(!node.isMesh)return;let visible=true;
        for(let parent=node;parent&&parent!==aircraft.root;parent=parent.parent)if(!parent.visible)visible=false;
        const materials=Array.isArray(node.material)?node.material:[node.material];
        if(visible&&materials.some(m=>m.visible&&m.opacity>0)&&(node.geometry.getAttribute('position')?.count??0)>=3){meshes++;bounds.union(new T.Box3().setFromObject(node));}
      });
      const size=bounds.getSize(new T.Vector3()).toArray();
      return {pass:meshes>0&&size.every(x=>Number.isFinite(x)&&x<=2)&&size[0]>=.3&&size[1]>=.5&&size[2]>=.2,detail:{visible_meshes:meshes,seated_bounds_m:size,scope:'Presence and scale only; human recognisability is a separate visual question'}};
    });
    const panels=aircraft.wingPanels;
    if(!panels||M.PANEL_NAMES.some(n=>!panels[n]?.isMesh||aircraft[n+'Surface']?.getObjectById(panels[n].id)!==panels[n]))throw Error('Return four actual panel meshes under the matching Surface nodes');
    const mount=s=>{A.updateAircraft(aircraft,s,controls);M.mountWingPose(aircraft,K.wingPose(s));aircraft.root.position.set(0,0,0);aircraft.root.rotation.set(0,0,0);aircraft.root.updateMatrixWorld(true);};
    add('wing_geometry_matches_area',()=>{
      const zero=Object.fromEntries(M.PANEL_NAMES.map(n=>[n,{stroke:0,rate:0,twist:0,twistRate:0}]));
      M.mountWingPose(aircraft,zero);aircraft.root.updateMatrixWorld(true);
      let area=0;const bounds=new T.Box3(),a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3();
      for(const panel of Object.values(panels)){
        bounds.union(new T.Box3().setFromObject(panel));const v=panel.geometry.getAttribute('position'),idx=panel.geometry.index;
        for(let i=0;i<(idx?.count??v.count);i+=3){
          a.fromBufferAttribute(v,idx?idx.getX(i):i).applyMatrix4(panel.matrixWorld);
          b.fromBufferAttribute(v,idx?idx.getX(i+1):i+1).applyMatrix4(panel.matrixWorld);
          c.fromBufferAttribute(v,idx?idx.getX(i+2):i+2).applyMatrix4(panel.matrixWorld);
          area+=b.sub(a).cross(c.sub(a)).length()/2;
        }
      }
      return {pass:Math.abs(area/p.wing_area_m2-1)<.005&&Math.abs(bounds.max.z-p.span_m/2)<.01&&Math.abs(bounds.min.z+p.span_m/2)<.01,detail:{area_m2:area,expected:p.wing_area_m2,minimum:bounds.min.toArray(),maximum:bounds.max.toArray()}};
    });
    add('rendered_wings_match_physics',()=>{
      let maxPositionError=0,maxVelocityError=0,maxTwistRateError=0;const h=1e-5;
      function points(s){mount(s);return M.wingSamples(p,K.wingPose(s)).map((strip,i)=>{
        const panel=strip.panel,length=panel.endsWith('Inner')?g.inner:g.outer,side=panel.startsWith('left')?-1:1,r=length*((i%4)+.5)/4;
        return {actual:panels[panel].localToWorld(new T.Vector3(0,0,side*r)),expected:strip};
      });}
      for(const phase of [.17,1.01,2.23,4.48]){
        const s={...state,phase},center=points(s),before=points({...s,phase:phase-state.omega*h}),after=points({...s,phase:phase+state.omega*h});
        for(let i=0;i<center.length;i++){
          maxPositionError=Math.max(maxPositionError,center[i].actual.distanceTo(new T.Vector3(...center[i].expected.point)));
          const velocity=after[i].actual.clone().sub(before[i].actual).multiplyScalar(1/(2*h));
          maxVelocityError=Math.max(maxVelocityError,velocity.distanceTo(new T.Vector3(...center[i].expected.velocity)));
        }
        const pose=K.wingPose(s),a=K.wingPose({...s,phase:phase-state.omega*h}),b=K.wingPose({...s,phase:phase+state.omega*h});
        for(const name of M.PANEL_NAMES)maxTwistRateError=Math.max(maxTwistRateError,Math.abs((b[name].twist-a[name].twist)/(2*h)-pose[name].twistRate));
      }
      return {pass:maxPositionError<.001&&maxVelocityError<.001&&maxTwistRateError<.001,detail:{max_position_error_m:maxPositionError,max_velocity_error_m_s:maxVelocityError,max_twist_rate_error_rad_s:maxTwistRateError}};
    });
  }catch(e){for(const id of ['wing_geometry_matches_area','rendered_wings_match_physics'])if(!out.some(x=>x.id===id))out.push({id,pass:false,detail:{error:String(e)}});}
  return out;
}
