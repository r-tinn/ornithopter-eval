import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../candidate/mechanical-v7/scaffold/environment/vendor/three.module.min.js';
import {inspectDrive as inspectV5} from '../grader/wing-drive-v5.mjs';
import {inspectDrive as inspectV6} from '../grader/wing-drive-v6.mjs';

function slidingDrive({disconnected=false,detachedWing=false}={}){
 const root=new T.Group();
 const surface=side=>{
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute([-.4,0,0,.4,0,0,0,0,side*.4],3));
  const mesh=new T.Mesh(g,new T.MeshBasicMaterial());root.add(mesh);return mesh;
 };
 const left=surface(-1),right=surface(1);
 const craft={root,wingPanels:{leftInner:[left],rightInner:[right]}};
 const wing={root_height_m:.8,hinge_offset_m:.25};
 const frames=Array.from({length:24},(_,i)=>{
  const phase=2*Math.PI*i/24;
  const pivot=[0,.4,0],pin=[0,.4+.18*Math.cos(phase),.18*Math.sin(phase)];
  const rodEnd=pin.map((x,k)=>x+(disconnected&&k===0?.20:0));
  const tip=[.2*Math.sin(phase),.80+.10*Math.sin(phase),.35];
  return [{index:0,a:pivot,b:pin},{index:1,a:rodEnd,b:tip}];
 });
 const mount=p=>{
  left.position.set(0,1,-.35);
  right.position.set(0,.80+.10*Math.sin(p),detachedWing?.58:.35);
  root.updateMatrixWorld(true);
 };
 return [T,craft,new Set(),frames,wing,mount];
}

test('a connected output can slide along the moving wing',()=>{
 const fixture=slidingDrive();
 assert.equal(inspectV5(...fixture).pass,false);
 assert.equal(inspectV6(...fixture).pass,true);
});
test('relaxed output still requires the input joint and the wing connection',()=>{
 assert.equal(inspectV6(...slidingDrive({disconnected:true})).pass,false);
 assert.equal(inspectV6(...slidingDrive({detachedWing:true})).pass,false);
});
