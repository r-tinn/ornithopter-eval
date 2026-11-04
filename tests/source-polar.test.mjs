import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

test('section table endpoints clamp while the separate camber cosine keeps actual alpha',async()=>{
  // Trusted author fixture only. No evaluated model code is imported in Node.
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'source-polar-author-'));
  try{
    await fs.mkdir(path.join(temp,'environment'));
    for(const name of ['physics.mjs','kinematics.mjs'])await fs.copyFile('fixtures/mechanical-v6/'+name,path.join(temp,name));
    for(const name of ['engineering.mjs','source-mechanism.mjs'])await fs.copyFile('candidate/mechanical-v6/scaffold/environment/'+name,path.join(temp,'environment',name));
    const P=await import(pathToFileURL(path.join(temp,'physics.mjs'))),E=JSON.parse(await fs.readFile('candidate/mechanical-v6/engineering.json'));
    for(const region of ['inner','outer'])for(const alpha of [-2.2,2.2]){
      const section=E.sections[region],camber=section.camber_reference+.01,endpoint=alpha<0?0:section.cl_base.length-1;
      const cl=section.cl_base[endpoint]+section.camber_lift_gain*.01*Math.cos(alpha),actual=P.polar(region,alpha,camber);
      assert.ok(Math.abs(actual.cl-cl)<1e-12);
      assert.ok(Math.abs(actual.cd-(section.cd_base[endpoint]+cl*cl/(Math.PI*E.aero.span_efficiency*P.parameters.aspect_ratio)))<1e-12);
    }
  }finally{await fs.rm(temp,{recursive:true,force:true})}
});
