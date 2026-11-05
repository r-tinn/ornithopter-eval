import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

test('Approach power releases the clutch without free energy, then the finite engine spins the wings',async()=>{
  // Only the trusted handwritten fixture is imported here, never a model output.
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'ornithopter-author-modes-'));
  try{
    await fs.mkdir(path.join(temp,'environment'));
    for(const name of ['physics.mjs','kinematics.mjs'])await fs.copyFile('fixtures/mechanical-v7/'+name,path.join(temp,name));
    for(const name of ['engineering.mjs','source-mechanism.mjs','flight-modes.mjs'])await fs.copyFile('candidate/mechanical-v7/scaffold/environment/'+name,path.join(temp,'environment',name));
    const P=await import(pathToFileURL(path.join(temp,'physics.mjs'))),K=await import(pathToFileURL(path.join(temp,'kinematics.mjs'))),H=await import(pathToFileURL(path.join(temp,'environment/source-mechanism.mjs'))),M=await import(pathToFileURL(path.join(temp,'environment/flight-modes.mjs')));
    const s={position:[0,100,0],velocity:[10.73,-1.47,0],pitch:.013,roll:0,heading:0,pitch_rate:.2,roll_rate:0,phase:0,omega:0,fuel_kg:3.6,time:5,status:'flying',gliding:true,timing_bias:0,shaft_work_J:0,aero_work_J:0,drive_heat_J:12,control_work_J:0};
    const before=JSON.stringify(s),release=t=>M.releaseGlideForPower(s,t,P.parameters,K.wingPose);
    assert.equal(release(0),s);
    assert.equal(M.releaseGlideForPower({...s,fuel_kg:0},1,P.parameters,K.wingPose).gliding,true);
    assert.equal(M.releaseGlideForPower({...s,status:'crashed'},1,P.parameters,K.wingPose).gliding,true);
    const next=release(1),a=H.mechanics(P.parameters,s,K.wingPose),b=H.mechanics(P.parameters,next,K.wingPose);
    assert.equal(JSON.stringify(s),before);
    for(const key of ['position','velocity','pitch','roll','heading','fuel_kg','time','shaft_work_J'])assert.deepEqual(next[key],s[key]);
    assert.equal(next.gliding,false);assert.equal(next.omega,0);
    assert.ok(Math.abs(a.C*s.pitch_rate-b.C*next.pitch_rate)<1e-10);
    const energy0=.5*a.C*s.pitch_rate**2+a.U,energy1=.5*b.C*next.pitch_rate**2+b.U;
    assert.ok(Math.abs(energy0-energy1-(next.drive_heat_J-s.drive_heat_J))<1e-10);
    const controls={throttle:1,pitch:0,bank:0,rudder:0,brake:0},env={wind:[0,0,0],rho:1.225,surfaceHeight:()=>0};
    assert.equal(P.forces(s,controls,env).power,0);
    let powered=next;
    for(let i=0;i<120;i++){powered=P.step(powered,controls,env,1/120);assert.ok(P.forces(powered,controls,env).power<=16000.001);}
    assert.ok(powered.omega>.1);assert.ok(Math.abs(powered.phase)>.1);assert.ok(powered.fuel_kg<s.fuel_kg);
    assert.equal(M.releaseGlideForPower(powered,1,P.parameters,K.wingPose),powered);
    assert.equal(M.releaseGlideForPower(powered,0,P.parameters,K.wingPose),powered);
  }finally{await fs.rm(temp,{recursive:true,force:true})}
});
