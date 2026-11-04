// Shared geometry/transforms only. No aerodynamic forces or solved source ratios.
import {E} from './engineering.mjs';
export const PANEL_NAMES=['leftInner','leftOuter','rightInner','rightOuter'];
export function planform(p){
  const half=p.span_m/2,hinge=E.wing.hinge_offset_m,wrist=half*p.wrist_span_fraction;
  const inner=wrist-hinge,outer=half-wrist,taper=E.wing.taper_ratio;
  const chord=p.wing_area_m2/(2*(inner+outer*(1+taper)/2));
  return {half,hinge,wrist,inner,outer,chord,taper};
}
export function mountWingPose(aircraft,pose){
  for(const name of PANEL_NAMES){
    const side=name.startsWith('left')?-1:1,v=pose[name];
    aircraft[name].rotation.set(-side*v.stroke,0,0);
    aircraft[name+'Surface'].rotation.set(0,0,v.twist);
  }
}
export function wingSamples(p,pose){
  const g=planform(p),samples=[],count=E.wing.strips_per_panel;
  for(const side of [-1,1]){
    const prefix=side<0?'left':'right',inner=pose[prefix+'Inner'],outer=pose[prefix+'Outer'];
    for(const [panel,length] of [['Inner',g.inner],['Outer',g.outer]])for(let i=0;i<count;i++){
      const r=length*(i+.5)/count,v=panel==='Inner'?inner:outer;
      const stroke=inner.stroke+(panel==='Outer'?outer.stroke:0);
      const rate=inner.rate+(panel==='Outer'?outer.rate:0),c=Math.cos(stroke),s=Math.sin(stroke);
      const rootY=panel==='Outer'?g.inner*Math.sin(inner.stroke):0;
      const rootZ=panel==='Outer'?g.inner*Math.cos(inner.stroke):0;
      const rootVY=panel==='Outer'?g.inner*Math.cos(inner.stroke)*inner.rate:0;
      const rootVZ=panel==='Outer'?-g.inner*Math.sin(inner.stroke)*inner.rate:0;
      const chord=g.chord*(panel==='Outer'?1-(1-g.taper)*(i+.5)/count:1),ct=Math.cos(v.twist),st=Math.sin(v.twist);
      samples.push({panel:prefix+panel,area:chord*length/count,
        point:[0,E.wing.root_height_m+rootY+r*s,side*(g.hinge+rootZ+r*c)],
        velocity:[0,rootVY+r*c*rate,side*(rootVZ-r*s*rate)],
        chord:[ct,st*c,-side*st*s],normal:[-st,ct*c,-side*ct*s],span:[0,side*s,c]});
    }
  }
  return samples;
}
