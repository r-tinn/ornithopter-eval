import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../candidate/mechanical-v7/scaffold/environment/vendor/three.module.min.js';
import {trussVerdict,geometryComponents,worldComponent,insideComponent,member} from '../grader/airframe-geometry.mjs';
const rod=(a,b)=>({a:new T.Vector3(...a),b:new T.Vector3(...b)});
function truss(braced=true){const members=[];for(const z of [-.3,.3])for(let i=0;i<3;i++){
 const x=-i*.8;members.push(rod([x,0,z],[x,.6,z]),rod([x-.8,0,z],[x,0,z]),rod([x-.8,.6,z],[x,.6,z]));
 if(braced)members.push(rod([x-.8,0,z],[x,.6,z]));
 }for(const x of [0,-.8,-1.6,-2.4])members.push(rod([x,0,-.3],[x,0,.3]));return members;}
test('triangulated sides joined by transverse members form a 3D truss',()=>assert.equal(trussVerdict(T,truss()).pass,true));
test('unbraced rectangular ladder fails',()=>assert.equal(trussVerdict(T,truss(false)).pass,false));
test('planar triangulated frame alone fails the 3D requirement',()=>assert.equal(trussVerdict(T,truss().filter(m=>m.a.z<0&&m.b.z<0)).pass,false));
test('empty and tiny decorative triangles fail',()=>{assert.equal(trussVerdict(T,[]).pass,false);assert.equal(trussVerdict(T,truss().map(m=>({a:m.a.multiplyScalar(.01),b:m.b.multiplyScalar(.01)}))).pass,false);});
test('actual closed pilot geometry identifies penetration and ignores contact margin',()=>{
 const mesh=new T.Mesh(new T.BoxGeometry(1,1,1));mesh.updateMatrixWorld(true);
 const c=worldComponent(T,geometryComponents(T,mesh)[0]);
 assert.equal(insideComponent(T,new T.Vector3(0,0,0),c),true);
 assert.equal(insideComponent(T,new T.Vector3(.499,0,0),c),false);
 assert.equal(insideComponent(T,new T.Vector3(.7,0,0),c),false);
});
test('cylinder side surface yields physical member endpoints despite split cap normals',()=>{
 const mesh=new T.Mesh(new T.CylinderGeometry(.03,.03,.8,12));mesh.position.x=-1;mesh.updateMatrixWorld(true);
 const members=geometryComponents(T,mesh,true).map(c=>member(T,worldComponent(T,c))).filter(Boolean);
 assert.equal(members.length,1);assert.ok(Math.abs(members[0].length-.8)<1e-6);
});
