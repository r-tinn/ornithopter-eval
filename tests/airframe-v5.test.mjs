import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../candidate/mechanical-v7/scaffold/environment/vendor/three.module.min.js';
import {inspectDrive} from '../grader/wing-drive-v5.mjs';
import {headClearance} from '../grader/head-clearance.mjs';

const wing={root_height_m:.8,hinge_offset_m:.25,timing_bias_low_speed:.3};
const phase=i=>2*Math.PI*i/24;
const material=new T.MeshBasicMaterial();

function surface(){
 const geo=new T.BufferGeometry();
 geo.setAttribute('position',new T.Float32BufferAttribute([0,0,0,.08,0,0,0,0,.08],3));
 return new T.Mesh(geo,material);
}

for(const mode of ['connected','disconnected','frozen','wrong output']){
 test('cam and wing output: '+mode,()=>{
  const root=new T.Group(),left=surface(),right=surface();
  const cam=new T.Mesh(new T.CylinderGeometry(.2,.2,.05,48).rotateZ(Math.PI/2),material);
  root.add(cam,left,right);cam.position.y=.4;
  const craft={root,wingPanels:{leftInner:[left],rightInner:[right]}};
  const frames=Array.from({length:24},(_,i)=>{
   const p=phase(i);
   return [{index:0,a:[mode==='disconnected'?.4:0,.4+.2*Math.cos(p),.2*Math.sin(p)],
            b:[0,.82+.12*Math.sin(p),.35]}];
  });
  const mount=p=>{
   left.position.set(0,1,-.35);
   right.position.set(0,.82+.12*Math.sin(p),mode==='wrong output'?.55:.35);
   cam.rotation.x=mode==='frozen'?0:p;root.updateMatrixWorld(true);
  };
  assert.equal(inspectDrive(T,craft,new Set(),frames,wing,mount).pass,mode==='connected');
 });
}

test('moving hardware violates the head margin even when both wings are clear',()=>{
 const root=new T.Group(),pilot=new T.Group(),head=new T.Mesh(new T.SphereGeometry(.08),material);
 const left=surface(),right=surface(),arm=new T.Mesh(new T.BoxGeometry(.04,.04,.04),material);
 root.add(pilot,left,right,arm);pilot.add(head);
 left.position.set(0,0,-.6);right.position.set(0,0,.6);
 const craft={root,pilot,wingPanels:{leftInner:[left],rightInner:[right]}};
 const simulate=approach=>headClearance(T,craft,new Set([head.id]),wing,p=>{
  arm.position.set(approach?.30-.19*Math.sin(p):.45,0,0);root.updateMatrixWorld(true);
 });
 assert.equal(simulate(false).pass,true);
 const report=simulate(true);
 assert.equal(report.pass,false);
 assert.ok(report.cases.every(c=>c.part==='moving hardware'));
});
