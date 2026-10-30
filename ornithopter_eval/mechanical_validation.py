"""Known-positive and selected known-negative calibration for the v4 smoke checks."""
import json,shutil
from datetime import datetime,timezone
from pathlib import Path
from .runner import ROOT,write_json,digest
from .world_candidate import prepare_world
from .grading import grade_submission
from .experiment import automated_result
from .checks import MECHANICAL_VERSION
def validate_mechanical(node="node"):
    root=ROOT/'runs'/('mechanical-grader-calibration-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'));root.mkdir()
    (root/'calibration-script.py').write_text(Path(__file__).read_text())
    variants=['reference','wrong_study','wrong_dynamics','frozen_step','oversize_gear','empty']
    results={}
    for name in variants:
        packet=prepare_world(root/name,reference=name!='empty')
        # Review fixtures are not attempts: grade their isolated submissions without an attempt manifest.
        submission=packet/'submission';(packet/'manifest.json').rename(packet/'review-manifest.json')
        physics=submission/'physics.mjs';aircraft=submission/'aircraft.mjs'
        def replace(p,a,b):
            s=p.read_text();assert s.count(a)==1,(name,a);p.write_text(s.replace(a,b))
        if name=='wrong_study':
            replace(physics,'aspect_ratio:7.4**2/6.61','aspect_ratio:2')
            replace(physics,'wrist_span_fraction:3.7/7.4','wrist_span_fraction:.1')
            replace(physics,'wing_area_m2:9/(7.4**2/6.61)','wing_area_m2:5')
        if name=='wrong_dynamics':
            replace(physics,'v-environment.wind[i]','v')
            replace(physics,'airspeed**2','airspeed')
            replace(physics,'drag=qS*cd','drag=0*cd')
            replace(physics,'thrust=.65*power/Math.max(airspeed,5)','thrust=52')
            replace(physics,'controls.throttle>0?4*Math.PI*dt:0','2*Math.PI*dt')
        if name=='frozen_step':
            replace(physics,'export function step(state,controls,environment,dt){','export function step(state,controls,environment,dt){return structuredClone(state);')
        if name=='oversize_gear':
            # Actual tyre vertices are below the contact model; a high-poly mesh also exceeds the cap.
            s=aircraft.read_text()
            # Add geometry by the exported constructor, before it returns the aircraft.
            anchor='return {root,leftInner,leftOuter,rightInner,rightOuter,rudder,elevator,wheels};'
            assert anchor in s
            s=s.replace(anchor,"root.add(new T.Mesh(new T.SphereGeometry(.1,160,100),new T.MeshBasicMaterial())); for(const w of wheels)w.scale.multiplyScalar(3); "+anchor)
            aircraft.write_text(s)
        report=grade_submission(submission,packet/'grade',node=node,task_version=MECHANICAL_VERSION)
        result=automated_result(report);results[name]=result
        print(name,json.dumps(result),report.get('error',''),flush=True)
        write_json(root/'summary.json',{'results':results,'task_version':MECHANICAL_VERSION,'model_trial':False})
    print('EVIDENCE',root,flush=True)
    assert results['reference']['passed']==15
    assert set(results['wrong_study']['failed']) >= {'aspect_ratio_from_study','wrist_fraction_from_study','mechanical_area_consistent'}
    assert set(results['wrong_dynamics']['failed']) >= {'power_controls_thrust','lift_scales_with_speed_squared','matching_wind_removes_lift','powered_phase_frequency','unpowered_phase_stops','steady_glide_ratio'}
    assert set(results['frozen_step']['failed']) >= {'pitch_input_changes_pitch','rudder_changes_heading','takeoff_from_strip','landing_on_strip','wheels_above_surface'}
    assert set(results['oversize_gear']['failed']) >= {'aircraft_geometry_bounded','wheels_above_surface'}
    assert results['empty']['passed']==0
    summary={'task_version':MECHANICAL_VERSION,'offline_validation_passed':True,'model_trial':False,
        'evidence_directory':str(root.relative_to(ROOT)),'results':results,
        'grader_sha256':digest(ROOT/'grader/mechanical-v4.mjs'),
        'fixture_sha256':{p.name:digest(p) for p in sorted((ROOT/'fixtures/mechanical-v4').iterdir()) if p.is_file()},
        'scope':'Selected positive/negative fixtures; four visual checks ungraded; no scientific validation.'}
    write_json(root/'summary.json',summary)
    write_json(ROOT/'validation/mechanical-v4.json',summary)
    print('CALIBRATION PASSED',flush=True)
    return summary
