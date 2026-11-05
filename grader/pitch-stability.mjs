// One product-level regression: repeated large, slow pitch reversals with
// unchanged pilot input. This is an explicit acceptance target, not a claim
// about a universal real-aircraft stability limit.
export function pitchHuntingVerdict(samples){
  const detail={settle_s:20,end_s:80,average_window_s:2,
    reversal_threshold_deg:15,reversals_to_fail:4,slow_pitch:[],reversals:[]};
  try{
    if(!Array.isArray(samples)||samples.length<100)throw Error('No complete powered-flight observation');
    if(samples.some(s=>!Number.isFinite(s.time)||!Number.isFinite(s.pitch)))throw Error('Non-finite pitch observation');
    for(let i=1;i<samples.length;i++)if(samples[i].time<=samples[i-1].time||samples[i].time-samples[i-1].time>.11)throw Error('Incomplete flight observation');
    if(samples[0].time>.1||samples.at(-1).time<79.9)throw Error('Powered flight did not reach the full observation window');
    for(let time=21;time<=79;time+=.25){
      const window=samples.filter(s=>s.time>=time-1&&s.time<time+1);
      if(window.length<30)throw Error('Missing slow-pitch samples');
      detail.slow_pitch.push({time,pitch_deg:window.reduce((sum,s)=>sum+s.pitch,0)/window.length*180/Math.PI});
    }
    let high=detail.slow_pitch[0],low=high,direction=0;
    for(const point of detail.slow_pitch){
      if(direction===0){
        if(point.pitch_deg>high.pitch_deg)high=point;
        if(point.pitch_deg<low.pitch_deg)low=point;
        if(point.pitch_deg-low.pitch_deg>=detail.reversal_threshold_deg){direction=1;high=point;}
        else if(high.pitch_deg-point.pitch_deg>=detail.reversal_threshold_deg){direction=-1;low=point;}
      }else if(direction>0){
        if(point.pitch_deg>high.pitch_deg)high=point;
        else if(high.pitch_deg-point.pitch_deg>=detail.reversal_threshold_deg){
          detail.reversals.push({peak:high,confirmation:point,direction:'down'});direction=-1;low=point;
        }
      }else{
        if(point.pitch_deg<low.pitch_deg)low=point;
        else if(point.pitch_deg-low.pitch_deg>=detail.reversal_threshold_deg){
          detail.reversals.push({trough:low,confirmation:point,direction:'up'});direction=1;high=point;
        }
      }
    }
    detail.slow_pitch_range_deg=[Math.min(...detail.slow_pitch.map(s=>s.pitch_deg)),Math.max(...detail.slow_pitch.map(s=>s.pitch_deg))];
    return {id:'powered_pitch_stability',pass:detail.reversals.length<detail.reversals_to_fail,detail};
  }catch(error){return {id:'powered_pitch_stability',pass:false,detail:{...detail,error:String(error)}};}
}

// Serialized into the isolated browser. The evaluated physics never runs in Node.
export async function capturePoweredPitch({submission_url}){
  const P=await import(submission_url+'/physics.mjs');
  let s={position:[0,500,0],velocity:[16,0,0],pitch:.1,roll:0,heading:0,
    pitch_rate:0,roll_rate:0,phase:0,omega:6,fuel_kg:3.6,wheel_angle:0,
    shaft_work_J:0,aero_work_J:0,drive_heat_J:0,control_work_J:0,time:0,
    status:'flying',gliding:false,timing_bias:.3,sweep_scale:1};
  const controls={throttle:1,pitch:0,bank:0,rudder:0,brake:0};
  const environment={rho:1.225,wind:[0,0,0],surfaceHeight:()=>0},samples=[];
  for(let i=0;i<80*120;i++){
    s=P.step(s,controls,environment,1/120);
    if(s.status!=='flying'||!s.position?.every(Number.isFinite)||!s.velocity?.every(Number.isFinite)||!Number.isFinite(s.pitch)||!Number.isFinite(s.phase)||!Number.isFinite(s.omega)||Math.abs(s.time-(i+1)/120)>.02)throw Error('Powered neutral-input flight crashed, froze or became non-finite');
    if(s.position[1]<2)throw Error('Powered flight reached the contact surface');
    if(i%6===0)samples.push({time:s.time,pitch:s.pitch,phase:s.phase,omega:s.omega,position:s.position.slice(),velocity:s.velocity.slice(),fuel_kg:s.fuel_kg});
  }
  if(s.position[0]<50||s.phase<40*Math.PI||!(s.fuel_kg<3.6))throw Error('No sustained powered forward flight and wing motion');
  return samples;
}
