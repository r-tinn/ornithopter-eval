import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../candidate/mechanical-v7/scaffold/environment/vendor/three.module.min.js';
import {inspectDrive} from '../grader/wing-drive.mjs';
const wing={root_height_m:.8,hinge_offset_m:.25};
const phases=Array.from({length:24},(_,i)=>2*Math.PI*i/24);
const point=p=>[0,.45+.06*Math.sin(p),.12];
for(const mode of ['connected','disconnected','frozen']){
 test('instanced rod: '+mode,()=>{
  const root=new T.Group(),rod=new T.InstancedMesh(new T.CylinderGeometry(.03,.03,1,12),new T.MeshBasicMaterial(),1);
  root.add(rod);
  const frames=phases.map(p=>[{index:0,a:[0,.42,0],b:point(mode==='frozen'?0:p)}]);
  function mount(p){
   const a=new T.Vector3(...point(mode==='frozen'?0:p));if(mode==='disconnected')a.x+=.4;
   const b=new T.Vector3(a.x,.8,.45),d=b.clone().sub(a);
   rod.setMatrixAt(0,new T.Matrix4().compose(a.clone().lerp(b,.5),new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),d.clone().normalize()),new T.Vector3(1,d.length(),1)));
   root.updateMatrixWorld(true);
  }
  assert.equal(inspectDrive(T,root,new Set(),frames,wing,mount).pass,mode==='connected');
 });
 test('cam surface: '+mode,()=>{
  const root=new T.Group(),geo=new T.CylinderGeometry(.2,.2,.05,48).rotateZ(Math.PI/2),cam=new T.Mesh(geo,new T.MeshBasicMaterial());
  root.add(cam);cam.position.set(0,.4,0);
  const frames=phases.map(p=>{const q=mode==='frozen'?0:p;return [{index:0,a:[mode==='disconnected'?.4:0,.4+.2*Math.cos(q),.2*Math.sin(q)],b:[0,.8,.35]}];});
  const mount=p=>{cam.rotation.x=mode==='frozen'?0:p;root.updateMatrixWorld(true);};
  assert.equal(inspectDrive(T,root,new Set(),frames,wing,mount).pass,mode==='connected');
 });
}
