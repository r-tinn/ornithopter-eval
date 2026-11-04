// Trusted handwritten fixtures only; never imports evaluated model code into Node.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import test from 'node:test';
import {wheelRotationAxis} from '../grader/wheel-axis.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
for(const wrongAxis of [false,true])test(wrongAxis?'wheel_angle wrong-axis animation fails':'wheel_angle axle rotation passes',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ornithopter-trusted-wheel-'));
  try{
    await fs.cp(path.join(root,'candidate/mechanical-v5/scaffold'),dir,{recursive:true});
    for(const name of ['aircraft.mjs','physics.mjs','kinematics.mjs','interpretation.json']){
      await fs.copyFile(path.join(root,'fixtures/mechanical-v5',name),path.join(dir,name));
    }
    if(wrongAxis){
      const aircraft=path.join(dir,'aircraft.mjs');
      const source=await fs.readFile(aircraft,'utf8');
      const old='wheel.rotation.z=-(state.wheel_angle??0);';
      assert.equal(source.split(old).length,2);
      await fs.writeFile(aircraft,source.replace(old,'wheel.rotation.y=-(state.wheel_angle??0);'));
    }
    const result=await wheelRotationAxis({submission_url:pathToFileURL(dir).href.replace(/\/$/,'')});
    assert.equal(result.pass,!wrongAxis,JSON.stringify(result.detail));
    assert.equal(result.detail.samples.length,18);
    assert.ok(wrongAxis?result.detail.max_misalignment_deg>89:result.detail.max_misalignment_deg<1e-6);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
