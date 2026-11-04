"""Calibrate v5 software checks with a handwritten fixture and explicit broken variants."""
import json
import shutil
from datetime import datetime,timezone
from pathlib import Path
from .checks import PILOTED_VERSION,checklist
from .experiment import automated_result
from .grading import grade_submission
from .runner import ROOT,digest,write_json
from .world_candidate import prepare_world


def validate_piloted(node='node'):
    root=ROOT/'runs'/('piloted-calibration-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'));root.mkdir()
    (root/'calibration-script.py').write_text(Path(__file__).read_text())
    targets={
        'reference':set(),
        'missing_pilot':{'pilot_mesh_present'},
        'omitted_pilot_mass':{'mass_budget_complete'},
        'free_thrust':{'locked_wings_no_propulsion'},
        'ignored_motion_override':{'locked_wings_no_propulsion','outer_motion_changes_propulsion','stroke_rate_changes_propulsion'},
        'false_wing_rates':{'rendered_wings_match_physics'},
        'snapping_lock':{'drive_lock_preserves_pose'},
        'wrong_wheel_axis':{'wheel_rotation_axis'},
        'unlimited_fuel':{'fuel_accounting','empty_tank_stops_drive'},
        'overpowered_engine':{'shaft_power_limited'},
        'auto_level':{'neutral_bank_retains_bank'},
        'zero_drag':{'glide_ratio_in_envelope'},
        'syntax_error':set(),
        'empty':set(),
    }
    results={};count=sum(len(v) for k,v in checklist(PILOTED_VERSION).items() if k!='visual')
    for name,expected in targets.items():
        packet=prepare_world(root/name,reference=name!='empty',task_version=PILOTED_VERSION)
        (packet/'manifest.json').rename(packet/'review-manifest.json')
        def replace(file,old,new):
            p=packet/'submission'/file;s=p.read_text()
            if s.count(old)!=1:raise ValueError('Mutation anchor changed: '+name)
            p.write_text(s.replace(old,new))
        if name=='missing_pilot':replace('aircraft.mjs','return parts;','pilot.clear();return parts;')
        if name=='omitted_pilot_mass':replace('physics.mjs','dry_mass_kg:E.dry_mass_including_pilot_kg,','dry_mass_kg:E.dry_mass_including_pilot_kg-55,')
        if name=='free_thrust':replace('physics.mjs','const worldWing=bodyToWorld(wing,state)','wing[0]+=300;const worldWing=bodyToWorld(wing,state)')
        if name=='ignored_motion_override':replace('physics.mjs','wingSamples(parameters,pose)','wingSamples(parameters,wingPose(state))')
        if name=='false_wing_rates':replace('kinematics.mjs','return pose;','for(const v of Object.values(pose)){v.rate=0;v.twistRate=0;}return pose;')
        if name=='snapping_lock':replace('kinematics.mjs','return pose;','if(state.omega===0)for(const v of Object.values(pose)){v.stroke=0;v.twist=0;}return pose;')
        if name=='wrong_wheel_axis':replace('aircraft.mjs','wheel.rotation.z=-(state.wheel_angle??0);','{wheel.rotation.z=-(state.wheel_angle??0);wheel.rotation.y=-state.position[0]/.23;}')
        if name=='unlimited_fuel':replace('physics.mjs','s.fuel_kg=Math.max(0,state.fuel_kg-used);','s.fuel_kg=state.fuel_kg;')
        if name=='overpowered_engine':replace('physics.mjs','thrust:wing[0],drag:bodyDrag,power,airspeed:V','thrust:wing[0],drag:bodyDrag,power:power*2,airspeed:V')
        if name=='auto_level':replace('physics.mjs','state.roll+s.roll_rate*dt,','state.roll+s.roll_rate*dt-.6*state.roll*dt,')
        if name=='syntax_error':
            p=packet/'submission/physics.mjs';p.write_text(p.read_text()+'\nexport const = ;\n')
        if name=='zero_drag':
            replace('physics.mjs','return {cl,cd};','return {cl,cd:0};')
            replace('physics.mjs','bodyDrag=.5*environment.rho*V*V*area','bodyDrag=0')
        report=grade_submission(packet/'submission',packet/'grade',node=node,task_version=PILOTED_VERSION,timeout=180)
        result=automated_result(report);results[name]=result
        write_json(root/'summary.json',{'task_version':PILOTED_VERSION,'model_trial':False,'results':results,'required_failures':{k:sorted(v) for k,v in targets.items()}})
        print(name,json.dumps(result),report.get('error',''),flush=True)
        if result is None:raise ValueError('Calibration infrastructure failed: '+name+'; evidence retained in '+str(root))
        if name=='reference' and result['passed']!=count:raise ValueError('Reference failed; inspect '+str(packet/'grade'))
        if not expected<=set(result['failed']):raise ValueError('Expected failure missed: '+name+'; evidence retained in '+str(root))
        if name in ('empty','syntax_error') and result['passed']!=0:raise ValueError('Unusable candidate passed a check: '+name)
    summary={'task_version':PILOTED_VERSION,'offline_validation_passed':True,'model_trial':False,'automated_total':count,
        'evidence_directory':str(root.relative_to(ROOT)),'results':results,
        'required_failures':{k:sorted(v) for k,v in targets.items()},
        'grader_sha256':{p.name:digest(p) for p in (ROOT/'grader').glob('piloted-*.mjs')},
        'fixture_sha256':{p.name:digest(p) for p in (ROOT/'fixtures/mechanical-v5').iterdir()},
        'scope':'Selected software defects; five binary visual questions pending; no live API calls or empirical aircraft validation.'}
    write_json(root/'summary.json',summary);write_json(ROOT/'validation/piloted-v5.json',summary)
    for source,target in [('inspection-pilot.png','piloted-v5-pilot.png'),('inspection-orbit.png','piloted-v5-aircraft.png')]:
        shutil.copyfile(root/'reference/grade'/source,ROOT/'validation'/target)
    print('EVIDENCE',root,flush=True)
    return summary
