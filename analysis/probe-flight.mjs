// Reproducible diagnostics of the saved model physics, without changing grades.
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const [base,output]=process.argv.slice(2);
const report={kind:'power-and-bank-diagnostic',grades_changed:false,models:{}};
let browser;
try{
  browser=await chromium.launch({headless:true,chromiumSandbox:true});
  const context=await browser.newContext({serviceWorkers:'block'});
  await context.route('**/*',r=>r.request().url().startsWith(base+'/')?r.continue():r.abort());
  const page=await context.newPage();await page.goto(base+'/__probe.html');
  for(const model of ['gpt-5.6-sol','gpt-6.1-sol']){
    report.models[model]=await page.evaluate(async({base,model})=>{
      const P=await import(base+'/trials/'+model+'-01/submission/physics.mjs');
      const W=await import(base+'/trials/'+model+'-01/submission/environment/world.mjs');
      const env={wind:[0,0,0],rho:1.225,surfaceHeight:W.surfaceHeight};
      const controls={throttle:1,pitch:0,bank:0,rudder:0,brake:0};
      const mass=P.parameters.mass_kg,g=9.80665,dt=1/120;
      const summarise=(s,c)=>{
        const f=P.forces(s,c,env),V=Math.hypot(...s.velocity);
        return {state:s,speed_m_s:V,climb_rate_m_s:s.velocity[1],drag_power_W:f.drag*V,
          useful_power_W:f.thrust*V,potential_energy_gain_W:mass*g*s.velocity[1],
          vertical_acceleration_m_s2:f.force[1]/mass};
      };
      let climb={position:[W.AIRFIELDS[0].x+W.AIRFIELDS[0].start,0,W.AIRFIELDS[0].z],velocity:[0,0,0],pitch:0,roll:0,heading:0,phase:0,time:0,status:'grounded'};
      climb.position[1]=env.surfaceHeight(climb.position[0],climb.position[2])+.82;
      for(let i=0;i<7200;i++)climb=P.step(climb,{...controls,pitch:i>=240&&i<276?1:0},env,dt);
      const V=Math.sqrt(2*mass*g/(env.rho*P.parameters.wing_area_m2*.6));
      const trim={position:[0,1000,0],velocity:[V,0,0],pitch:0,roll:0,heading:0,phase:0,time:0,status:'flying'};
      const trimThrottle=P.forces(trim,{...controls,throttle:0},env).drag*V/(400*.65);
      const pairs={};
      for(const [name,initial,throttle] of [['full_power_climb',climb,1],['level_trim',trim,trimThrottle]]){
        let straight=structuredClone(initial),banked=structuredClone(initial);
        const c={...controls,throttle},samples=[{elapsed_s:0,straight:summarise(straight,c),banked:summarise(banked,c)}];
        for(let i=1;i<=2400;i++){
          straight=P.step(straight,c,env,dt);banked=P.step(banked,{...c,bank:1},env,dt);
          if([12,60,120,240,600,2400].includes(i))samples.push({elapsed_s:i*dt,
            straight:summarise(straight,c),banked:summarise(banked,c),altitude_difference_m:banked.position[1]-straight.position[1]});
        }
        pairs[name]={throttle,samples};
      }
      return {dt_s:dt,environment:{wind:env.wind,rho:env.rho},pairs};
    },{base,model});
  }
}catch(e){report.error=String(e);process.exitCode=1;}
finally{await browser?.close();await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');}
