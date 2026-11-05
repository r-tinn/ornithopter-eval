// Supplied geometric/mass bookkeeping, not solved aerodynamics or dynamics.
import {E} from './engineering.mjs';
export const PANEL_NAMES=['leftInner','leftOuter','rightInner','rightOuter'];
export const add=(a,b)=>a.map((x,i)=>x+b[i]),sub=(a,b)=>a.map((x,i)=>x-b[i]),mul=(a,k)=>a.map(x=>x*k),dot=(a,b)=>a.reduce((n,x,i)=>n+x*b[i],0);
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const unit=a=>{const n=Math.hypot(...a);return n>1e-12?mul(a,1/n):[1,0,0]};
export const chordFactor=t=>E.wing.taper_ratio+(1-E.wing.taper_ratio)*Math.sqrt(Math.max(0,1-t*t));
export function planform(p){
  const half=p.span_m/2,hinge=E.wing.hinge_offset_m,inner=half*p.wrist_span_fraction-hinge,outer=half-half*p.wrist_span_fraction;
  const knots=[0,.25,.5,.75,1],factor=knots.slice(1).reduce((v,t,i)=>v+.125*(chordFactor(t)+chordFactor(knots[i])),0);
  return {half,hinge,inner,outer,chord:p.wing_area_m2/(2*(inner+outer*factor)),factor};
}
function chordAt(g,t){const i=Math.min(3,Math.floor(t*4)),a=i/4,b=(i+1)/4;return g.chord*(chordFactor(a)+(chordFactor(b)-chordFactor(a))*(t-a)/(b-a));}
function point(p,pose,name,leaf,t,u){
  const g=planform(p),side=name.startsWith('left')?-1:1,isOuter=name.endsWith('Outer'),v=pose[name],inn=pose[side<0?'leftInner':'rightInner'];
  const stroke=inn.stroke+(isOuter?v.stroke:0),rootY=E.wing.root_height_m+(isOuter?g.inner*Math.sin(inn.stroke):0),rootZ=g.hinge+(isOuter?g.inner*Math.cos(inn.stroke):0);
  const materialT=isOuter?(leaf*.5+t*.5):t,chord=isOuter?chordAt(g,materialT):g.chord;
  const r=isOuter?g.outer*(leaf===0?t*.5:(v.exposure-.5)+t*.5):g.inner*t;
  const x=(.25-u)*chord,y=4*u*(1-u)*chord*v.camber-(isOuter&&leaf===1?.008:0),ct=Math.cos(v.twist),st=Math.sin(v.twist),cs=Math.cos(stroke),ss=Math.sin(stroke);
  const a=x*ct-y*st,b=x*st+y*ct;
  return [a+v.sweep,rootY+r*ss+b*cs,side*(rootZ+r*cs-b*ss)];
}
export function geometry(p,pose){
  const g=planform(p),samples=[],masses=[];
  for(const name of PANEL_NAMES){
    const outer=name.endsWith('Outer'),side=name.startsWith('left')?-1:1,v=pose[name],inn=pose[side<0?'leftInner':'rightInner'],stroke=inn.stroke+(outer?v.stroke:0),ct=Math.cos(v.twist),st=Math.sin(v.twist),cs=Math.cos(stroke),ss=Math.sin(stroke);
    for(let leaf=0;leaf<(outer?2:1);leaf++)for(let i=0;i<(outer?2:4);i++){
      const count=outer?2:4,t0=i/count,t1=(i+1)/count;
      // Both full rigid leaves retain their mass, including their overlap.
      for(const u of [.2,.8])masses.push({kg:(outer?E.coupled.mass_outer_per_side_kg:E.coupled.mass_inner_per_side_kg)/8,point:point(p,pose,name,leaf,(t0+t1)/2,u)});
      const exposedStart=outer&&leaf===1?Math.max(t0,2*(1-v.exposure)):t0;
      const a=Math.min(t1,exposedStart),b=t1,t=(a+b)/2,globalA=leaf*.5+a*.5,globalB=leaf*.5+b*.5;
      const area=outer?g.outer*(b-a)*.5*(chordAt(g,globalA)+chordAt(g,globalB))/2:g.inner*(b-a)*g.chord;
      samples.push({name,leaf,t,area,region:outer?'outer':'inner',camber:v.camber,point:point(p,pose,name,leaf,t,.25),
        chord:[ct,st*cs,-side*st*ss],normal:[-st,ct*cs,-side*ct*ss],span:[0,side*ss,cs]});
    }
  }
  return {samples,masses};
}
function configuration(p,s,poseFn){
  const geo=geometry(p,poseFn(s)),mass=p.dry_mass_kg+Math.max(0,s.fuel_kg),wingMass=geo.masses.reduce((v,m)=>v+m.kg,0),cg=geo.masses.reduce((v,m)=>add(v,mul(m.point,m.kg/mass)),[0,0,0]);
  return {...geo,mass,bodyMass:mass-wingMass,cg};
}
function matrix(p,s,poseFn){
  const h=E.coupled.derivative_step,q=configuration(p,s,poseFn),lo=configuration(p,{...s,phase:s.phase-h},poseFn),hi=configuration(p,{...s,phase:s.phase+h},poseFn),dc=mul(sub(hi.cg,lo.cg),1/(2*h));
  let A=E.engine.equivalent_drive_inertia_kg_m2,B=0,C=E.coupled.body_pitch_inertia_kg_m2;
  const rows=q.masses.map((m,i)=>({m:m.kg,r:sub(m.point,q.cg),j:sub(mul(sub(hi.masses[i].point,lo.masses[i].point),1/(2*h)),dc)}));
  rows.push({m:q.bodyMass,r:mul(q.cg,-1),j:mul(dc,-1)});
  for(const row of rows){const jtheta=[-row.r[1],row.r[0],0];A+=row.m*dot(row.j,row.j);B+=row.m*dot(row.j,jtheta);C+=row.m*dot(jtheta,jtheta);}
  return {...q,A,B,C,dc};
}
export function mechanics(p,s,poseFn){
  const h=E.coupled.derivative_step,q=matrix(p,s,poseFn),lo=matrix(p,{...s,phase:s.phase-h},poseFn),hi=matrix(p,{...s,phase:s.phase+h},poseFn);
  const pose=poseFn(s),U=E.coupled.spring_stiffness_Nm_rad*(pose.leftInner.stroke-E.wing.dihedral_rad)**2;
  const spring=state=>E.coupled.spring_stiffness_Nm_rad*(poseFn(state).leftInner.stroke-E.wing.dihedral_rad)**2;
  const Up=(spring({...s,phase:s.phase+h})-spring({...s,phase:s.phase-h}))/(2*h);
  const poseLo=poseFn({...s,phase:s.phase-h}),poseHi=poseFn({...s,phase:s.phase+h});
  const samples=q.samples.map(v=>{
    const r=sub(v.point,q.cg),jphi=sub(mul(sub(point(p,poseHi,v.name,v.leaf,v.t,.25),point(p,poseLo,v.name,v.leaf,v.t,.25)),1/(2*h)),q.dc),jtheta=[-r[1],r[0],0];
    return {...v,r,jphi,jtheta,velocity:add(mul(jphi,s.omega),mul(jtheta,s.pitch_rate))};
  });
  return {...q,samples,U,Up,ddc:mul(sub(hi.dc,lo.dc),1/(2*h)),Ap:(hi.A-lo.A)/(2*h),Bp:(hi.B-lo.B)/(2*h),Cp:(hi.C-lo.C)/(2*h)};
}
export function bodyToWorld(v,s){const cr=Math.cos(s.roll),sr=Math.sin(s.roll),cp=Math.cos(s.pitch),sp=Math.sin(s.pitch),ch=Math.cos(s.heading),sh=Math.sin(s.heading),[x,y,z]=v,b=cr*y-sr*z,c=sr*y+cr*z,u=cp*x-sp*b,w=sp*x+cp*b;return [ch*u-sh*c,w,sh*u+ch*c];}
export function worldToBody(v,s){return [dot(v,bodyToWorld([1,0,0],s)),dot(v,bodyToWorld([0,1,0],s)),dot(v,bodyToWorld([0,0,1],s))];}
export function makePanel(T,p,name,leaf=0){
  const g=new T.BufferGeometry(),count=name.endsWith('Outer')?2:4,vertices=new Float32Array((count+1)*3*3),indices=[];
  for(let j=0;j<count;j++)for(let i=0;i<2;i++){const a=j*3+i;indices.push(a,a+1,a+3,a+1,a+4,a+3);}
  g.setAttribute('position',new T.BufferAttribute(vertices,3));g.setIndex(indices);g.userData={panel:name,leaf};return g;
}
export function mountWingPose(aircraft,pose,p){
  for(const name of PANEL_NAMES){
    const leaves=aircraft.wingPanels[name];if(!Array.isArray(leaves)||leaves.length!==(name.endsWith('Outer')?2:1))throw Error('wingPanels entries must contain actual exposed/overlapping leaf meshes');
    leaves.forEach((mesh,leaf)=>{
      const count=name.endsWith('Outer')?2:4,attribute=mesh.geometry.getAttribute('position');
      if(attribute.count!==(count+1)*3)throw Error('Use makePanel to retain material-coordinate geometry');
      for(let j=0;j<=count;j++)for(let i=0;i<3;i++)attribute.setXYZ(j*3+i,...point(p,pose,name,leaf,j/count,i/2));
      attribute.needsUpdate=true;mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingSphere();
    });
  }
}
export function centre(p,s,poseFn){return configuration(p,s,poseFn).cg;}
