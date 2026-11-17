"""Validate v4's foot tolerance against independent author geometry."""
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
    require_calibration('airframe-binary-v3')
    args.output.mkdir(parents=True)
    fixture = ROOT/'validation/airframe-binary-20261117/full-reference'
    cases = {
        'reference': ('', True),
        'shallow_boot': ('rod(a.root,[1.950,-.94,.12],[1.950,-.94,.20],.007);', True),
        'deep_boot': ('rod(a.root,[1.83,-.94,.10],[1.83,-.94,.22],.009);', False),
        'head_bar': ('rod(a.root,[.7,.52,0],[1.5,.52,0],.035);', False),
        'torso_bar': ('rod(a.root,[.75,.05,0],[1.4,.05,0],.025);', False),
    }
    results = {}
    for case, (mutation, expected) in cases.items():
        target = args.output/case
        shutil.copytree(fixture/'submission', target/'submission')
        p = target/'submission/aircraft.mjs'
        s = p.read_text()
        assert s.count('a.T=T;return a;') == 1
        p.write_text(s.replace('a.T=T;return a;', mutation+'a.T=T;return a;'))
        report = inspect(p.parent, target/'inspection', args.node, revision='airframe-binary-v4')
        assert report['status'] == 'completed', report
        checks = {c['id']:c for c in report['checks']}
        pilot = checks['pilot_clearance']
        assert pilot['pass'] is expected, (case, pilot)
        assert all(c['pass'] for k,c in checks.items() if k != 'pilot_clearance')
        if case == 'shallow_boot':
            assert pilot['detail']['tolerated_foot_samples'] > 0
        results[case] = {'clearance_pass':pilot['pass'],
                         'tolerated_foot_samples':pilot['detail']['tolerated_foot_samples'],
                         'report':f'{case}/inspection/report.json'}
        print(case, results[case], flush=True)
    earlier = json.loads((fixture/'grade/report.json').read_text())
    base = [c for g in ('source','physics','interaction') for c in earlier['dimensions'][g]['checks']]
    assert len(base) == 7 and all(c['pass'] is True for c in base)
    kernels = ['grader/airframe-evidence-v4.mjs','grader/wing-drive.mjs','grader/airframe-geometry.mjs']
    write_json(args.output/'summary.json', {
        'all_passed':True, 'reference_all_ten_pass':True, 'cases':results,
        'kernel_sha256':{name:digest(ROOT/name) for name in kernels},
    })


if __name__ == '__main__':
    main()
