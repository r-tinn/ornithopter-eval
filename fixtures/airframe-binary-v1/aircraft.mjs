// Independent author calibration geometry, not a model result or a design template.
import {createAircraft as base,updateAircraft as updateBase} from './author-base.mjs';
export function createAircraft(T,p){
 const a=base(T,p),keep=new Set([a.pilot,a.elevator,a.rudder,...a.wheels,...['leftInner','leftOuter','rightInner','rightOuter'].map(n=>a[n])]);
 for(const node of a.root.children.slice())if(!keep.has(node))a.root.remove(node);
 const mat=new T.MeshStandardMaterial({color:0x34685e,roughness:.5}),metal=new T.MeshStandardMaterial({color:0xa9a8a1,metalness:.5});
 a.truss=new T.Group();a.root.add(a.truss);
 function rod(parent,A,B,r=.025){const u=new T.Vector3(...A),v=new T.Vector3(...B),d=v.clone().sub(u);const m=new T.Mesh(new T.CylinderGeometry(r,r,d.length(),12),mat);m.position.copy(u.add(v).multiplyScalar(.5));m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());parent.add(m);return m;}
 a.rod=rod;
 const xs=[-.4,-1.2,-2,-2.8];
 for(const side of [-1,1])for(let i=0;i<xs.length;i++){
  const top=[xs[i],.25,side*.3],bottom=[xs[i],-.35,side*.3];rod(a.truss,top,bottom);
  if(i){rod(a.truss,[xs[i-1],.25,side*.3],top);rod(a.truss,[xs[i-1],-.35,side*.3],bottom);
   const diagonal=rod(a.truss,[xs[i-1],-.35,side*.3],top);diagonal.userData.calibrationDiagonal=true;}
 }
 for(const x of xs){rod(a.truss,[x,.25,-.3],[x,.25,.3]);rod(a.truss,[x,-.35,-.3],[x,-.35,.3]);}
 a.drive=new T.Group();a.root.add(a.drive);a.crank=new T.Group();a.drive.add(a.crank);a.crank.position.set(-.25,.45,0);
 rod(a.crank,[0,0,0],[0,.2,0],.025);
 const disc=new T.Mesh(new T.CylinderGeometry(.21,.21,.04,24),metal);disc.rotation.x=Math.PI/2;a.crank.add(disc);
 a.link=rod(a.drive,[-.25,.65,0],[0,.9,.65]);
 const block=new T.Mesh(new T.BoxGeometry(.4,.3,.4),mat);block.position.set(-.7,.15,0);a.root.add(block);
 a.T=T;return a;
}
export function updateAircraft(a,s,c){
 updateBase(a,s,c);
 const phase=a.freezeDrive?0:s.phase;
 // Real crank-pin and connecting-rod endpoints stay joined at every phase.
 a.crank.rotation.x=phase;
 const T=a.T,from=new T.Vector3(-.25,.45+.2*Math.cos(phase),.2*Math.sin(phase)),to=new T.Vector3(0,.9,.65);
 const d=to.clone().sub(from),m=a.link;
 if(!a.linkLength)a.linkLength=m.geometry.parameters.height;
 m.scale.y=d.length()/a.linkLength;m.position.copy(from.add(to).multiplyScalar(.5));m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());
}
