"""Calibrate upper-body clearance and connected drive on independent author fixtures."""
import argparse
import json
from pathlib import Path
import shutil

from ornithopter_eval.airframe import inspect, require_calibration
from ornithopter_eval.runner import ROOT, digest, write_json


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    parser.add_argument('--node', default='node')
    args = parser.parse_args()
    require_calibration('airframe-binary-v6')
    args.output.mkdir(parents=True)
    fixture = ROOT/'validation/airframe-binary-20261117/full-reference'
    cases = {
        'reference': (True, True),
        'lower_body_only': (True, True),
        'light_seat_contact': (True, True),
        'light_control_contact': (True, True),
        'normal_grip': (True, True),
        'normal_seatback': (True, True),
        'torso_bar': (True, True),
        'arm_bar': (True, True),
        'borderline_head': (True, True),
        'near_head': (False, True),
        'disconnected': (True, False),
        'frozen': (True, False),
    }
    results = {}
    for case, (expected_head, expected_drive) in cases.items():
        target = args.output/case
        shutil.copytree(fixture/'submission', target/'submission')
        p = target/'submission/aircraft.mjs'
        s = p.read_text()
        s = "import {wingPose} from './kinematics.mjs';\nimport {geometry} from './environment/source-mechanism.mjs';\n" + s
        s = s.replace('a.T=T;return a;', 'a.T=T;a.parameters=p;a.pilot.position.y-=.32;return a;')
        s = s.replace('to=new T.Vector3(0,.9,.65)', "to=new T.Vector3(...geometry(a.parameters,wingPose(s)).samples.find(x=>x.name==='rightInner'&&x.t===.125).point)")
        if case in ('borderline_head','near_head'):
            height='.13' if case=='borderline_head' else '.23'
            s=s.replace('a.pilot.position.y-=.32;', f'a.pilot.position.y+={height};')
        if case == 'disconnected':
            s=s.replace('const d=to.clone().sub(from)', 'from.x-=.26;const d=to.clone().sub(from)')
        if case == 'frozen':
            s=s.replace('const phase=a.freezeDrive?0:s.phase;', 'const phase=0;')
        bars = {
            'light_seat_contact':'rod(a.root,[.91,-.33,-.10],[.91,-.33,.10],.014);',
            'normal_grip':'''for(const z of [-.15,.15]){const h=new T.Mesh(new T.SphereGeometry(.06,16,12),mat);h.position.set(1.55,.14,z);a.pilot.add(h);}rod(a.root,[1.55,-.18,-.18],[1.55,-.18,.18],.02);''',
            'normal_seatback':'''const back=new T.Mesh(new T.BoxGeometry(.05,.34,.37),mat);back.position.set(.915,-.21,0);a.root.add(back);''',
            'light_control_contact':'rod(a.root,[1.585,-.29,.12],[1.585,-.29,.20],.012);',
            'lower_body_only':'rod(a.root,[1.83,-1.26,.10],[1.83,-1.26,.22],.02);',
            'torso_bar':'rod(a.root,[.75,-.27,0],[1.4,-.27,0],.025);',
            'arm_bar':'rod(a.root,[1.10,-.17,.12],[1.10,-.17,.42],.012);',
        }
        if case in bars:
            s=s.replace('a.T=T;',bars[case]+'a.T=T;')
        p.write_text(s)
        report = inspect(p.parent, target/'inspection', args.node, revision='airframe-binary-v7')
        assert report['status'] == 'completed', report
        checks = {c['id']:c for c in report['checks']}
        clearance=checks['pilot_clearance']['detail']['head_clearance']
        drive=checks['wing_drive_linkage']
        print(case,clearance,drive['detail']['revised_drive'],flush=True)
        assert clearance['pass'] is expected_head and drive['pass'] is expected_drive
        if case in ('reference','lower_body_only','light_seat_contact','light_control_contact','normal_grip','normal_seatback'):assert all(c['pass'] for c in checks.values()), case
        if case in ('normal_grip','normal_seatback'):
            expected_contact='hand grip' if case=='normal_grip' else 'seatback'
            assert any(hit['contact']==expected_contact for hit in checks['pilot_clearance']['detail']['normal_contacts']), case
        if case in ('torso_bar','arm_bar'):assert not checks['pilot_clearance']['detail']['upper_body_penetration_pass'], case
        results[case] = {'head_pass':expected_head,'drive_pass':expected_drive,'upper_body_pass':checks['pilot_clearance']['detail']['upper_body_penetration_pass'],
                         'head_cases':clearance['cases'],'drive_paths':drive['detail']['revised_drive']}
    earlier = json.loads((fixture/'verdicts.json').read_text())
    base = [c for g in ('source','physics','interaction') for c in earlier['dimensions'][g]['checks']]
    assert len(base) == 7 and all(c['pass'] is True for c in base)
    kernels = ['grader/airframe-evidence-v7.mjs','grader/wing-drive-v6.mjs','grader/head-clearance.mjs','grader/airframe-geometry.mjs']
    write_json(args.output/'summary.json', {
        'all_passed':True, 'reference_all_ten_pass':True, 'cases':results,
        'kernel_sha256':{name:digest(ROOT/name) for name in kernels},
    })


if __name__ == '__main__':
    main()
