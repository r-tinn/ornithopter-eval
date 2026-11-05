"""Author-only positive/negative calibration. No model calls and no real human ratings."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import threading
import http.server

from ornithopter_eval.checks import SOURCE_FIRST_VERSION,LATEST_SOURCE_FIRST_VERSION,SOURCE_FIRST_VERSIONS
from ornithopter_eval.grading import SubmissionServer, GRADING_REVISIONS, BANK_GRADING_REVISION
from ornithopter_eval.runner import ROOT, write_json
from ornithopter_eval.world_candidate import prepare_world

MUTANTS = {
    'clamped_camber_cosine': ('physics.mjs', 'Math.cos(alpha)', 'Math.cos(a)', 'power', 'power_limited_flight'),
    'no_recovery_closing': ('kinematics.mjs', 'return pose;', "for(const n of ['leftOuter','rightOuter'])pose[n].exposure=1;return pose;", 'wing', 'wing_cycle_force_coupling'),
    'shared_section_table': ('physics.mjs', 'const table=E.sections[region]', 'const table=E.sections.inner', 'wing', 'wing_cycle_force_coupling'),
    'no_spring_torque': ('physics.mjs', '-q.Up', '-0*q.Up', 'elastic', 'elastic_inertial_exchange'),
    'no_inertial_pitch_reaction': ('physics.mjs', 'const det=q.A*q.C-q.B*q.B;', 'q.B=0;const det=q.A*q.C-q.B*q.B;', 'pitch', 'wing_body_pitch_coupling'),
    'overpowered_engine': ('physics.mjs', 'power=shaftTorque*Math.max(0,s.omega)', 'power=2*shaftTorque*Math.max(0,s.omega)', 'power', 'power_limited_flight'),
    'glide_altitude_hold': ('physics.mjs', 'return out;}', 'return s.gliding?{...out,position:[out.position[0],s.position[1],out.position[2]],velocity:[out.velocity[0],0,out.velocity[2]]}:out;}', 'glide', 'unpowered_glide_balance'),
    'wrong_wheel_axis': ('aircraft.mjs', 'wheel.rotation.z=', 'wheel.rotation.y=', 'wheel', 'wheel_rotation_axis'),
    'insufficient_pitch_damping': ('environment/engineering.mjs', '"pitch_damping_Nm_s": 1000', '"pitch_damping_Nm_s": 140', 'stability', 'powered_pitch_stability'),
}


def main():
    parser=argparse.ArgumentParser();parser.add_argument('output');parser.add_argument('--node',required=True);parser.add_argument('--task-version',choices=SOURCE_FIRST_VERSIONS,default=LATEST_SOURCE_FIRST_VERSION)
    parser.add_argument('--grading-revision',choices=GRADING_REVISIONS)
    parser.add_argument('--reference-physics',type=Path,help='Explicit corrected author implementation; original fixture is preserved')
    args=parser.parse_args()
    root=Path(args.output).resolve()
    if root.exists():raise ValueError('Use a new calibration directory')
    root.mkdir(parents=True)
    results=[]
    clean={k:v for k,v in os.environ.items() if k in ('PATH','TMPDIR','SYSTEMROOT','DISPLAY')}
    clean['PLAYWRIGHT_BROWSERS_PATH']=str(ROOT/'.cache/browsers')
    mutants=dict(MUTANTS)
    if args.grading_revision==BANK_GRADING_REVISION:
        mutants['roll_input_ignored']=('physics.mjs','E.controls.roll_accel_rad_s2*c.bank','0*c.bank','power','power_limited_flight')
    for name,(file,old,new,scenario,target) in mutants.items():
        if scenario=='stability' and args.task_version==SOURCE_FIRST_VERSION:continue
        trial=prepare_world(root/name,reference=True,task_version=args.task_version)
        if args.reference_physics:
            (trial/'submission/physics.mjs').write_bytes(args.reference_physics.read_bytes())
        path=trial/'submission'/file;raw=path.read_text()
        if old not in raw:raise ValueError('Calibration mutation anchor missing: '+name)
        path.write_text(raw.replace(old,new))
        server=http.server.ThreadingHTTPServer(('127.0.0.1',0),SubmissionServer);server.submission=trial/'submission'
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            with (trial/'calibration.log').open('w') as log:
                command=[args.node,str(ROOT/'grader/source-calibrate.mjs'),f'http://127.0.0.1:{server.server_port}',str(trial/'result.json'),scenario,args.task_version]
                if args.grading_revision:command.append(args.grading_revision)
                subprocess.run(command,env=clean,stdout=log,stderr=log,timeout=120,check=True)
            raw=json.loads((trial/'result.json').read_text());check=raw if scenario=='wheel' else next(x for x in raw['physics'] if x['id']==target)
            results.append({'variant':name,'target':target,'rejected':check['pass'] is False,'evidence':str((trial/'result.json').relative_to(root))})
            print(json.dumps(results[-1]),flush=True)
        finally:
            server.shutdown();server.server_close();thread.join()
    write_json(root/'summary.json',{'task_version':args.task_version,'grading_revision':args.grading_revision,'reference_physics':str(args.reference_physics) if args.reference_physics else None,'kind':'handwritten author mutant calibration, not model trials','all_targeted_defects_rejected':all(x['rejected'] for x in results),'results':results,'live_model_calls':0})
    return 0 if all(x['rejected'] for x in results) else 1


if __name__=='__main__':raise SystemExit(main())
