"""Rebuild the current author fixture with honest touchdown measurement.

This is an author-code correction, not a fresh model generation or proof of
global feasibility. Existing fixtures, submissions and grades are preserved.
Run from the repository root with Python's -m flag. Both outputs must be new.
"""
import argparse
import json
from pathlib import Path

from ornithopter_eval.checks import LATEST_SOURCE_FIRST_VERSION
from ornithopter_eval.grading import LAUNCH_GRADING_REVISION, grade_submission
from ornithopter_eval.runner import ROOT, digest, write_json
from ornithopter_eval.world_candidate import prepare_world


def corrected_physics():
    source = (ROOT / 'fixtures/mechanical-v7/physics.mjs').read_text()
    contact = "  if(out.position[1]<=floor){\n"
    old = next(line for line in source.splitlines()
               if "if(s.status==='flying'){const cgRate=" in line)
    new = """    if(s.status==='flying'){
      const q=mechanics(parameters,impact,wingPose),wheelSink=Math.min(...parameters.gear_centres.flatMap(g=>{
        const r=sub(g,q.cg),wr=bodyToWorld(r,impact),clearance=impact.position[1]+wr[1]-parameters.wheel_radius_m-e.surfaceHeight(impact.position[0]+wr[0],impact.position[2]+wr[2]);
        if(clearance>1e-7)return [];
        const local=sub(mul([-r[1],r[0],0],impact.pitch_rate),mul(q.dc,impact.omega));
        return [impact.velocity[1]+bodyToWorld(local,impact)[1]];
      }));
      out.status=wheelSink>=-E.controls.safe_touchdown_sink_m_s&&Math.abs(impact.roll)<E.controls.safe_touchdown_bank_rad&&Math.hypot(impact.velocity[0],impact.velocity[2])<=E.controls.safe_touchdown_speed_m_s?'landed':'crashed';
    }"""
    assert source.count(contact) == 1 and source.count(old) == 1
    return source.replace(contact, contact + '    const impact={...out,position:out.position.slice(),velocity:out.velocity.slice()};\n').replace(old, new)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('packet', type=Path)
    parser.add_argument('grades', type=Path)
    parser.add_argument('--node', default='node')
    parser.add_argument('--grading-revision', choices=[LAUNCH_GRADING_REVISION])
    args = parser.parse_args()
    if args.packet.exists() or args.grades.exists():
        parser.error('Use fresh output directories; previous evidence is preserved')
    prepare_world(args.packet, reference=True, task_version=LATEST_SOURCE_FIRST_VERSION)
    (args.packet / 'submission/physics.mjs').write_text(corrected_physics())
    manifest = json.loads((args.packet / 'manifest.json').read_text())
    manifest.update(
        status='submitted',
        submission_sha256={str(p.relative_to(args.packet / 'submission')): digest(p)
                           for p in sorted((args.packet / 'submission').rglob('*')) if p.is_file()},
        reference_revision={
            'kind': 'Author reference correction; not a model trial or independent from-scratch generation',
            'base_physics_sha256': digest(ROOT / 'fixtures/mechanical-v7/physics.mjs'),
            'change': 'Measure actual contacting tyre sink before clamping impact state, including pitch rotation and CG motion; enforce existing touchdown speed/bank limits. No engineering constant or crash threshold changes.'})
    write_json(args.packet / 'manifest.json', manifest)
    report = grade_submission(args.packet / 'submission', args.grades,
                              node=args.node, task_version=LATEST_SOURCE_FIRST_VERSION,
                              grading_revision=args.grading_revision)
    rows = [row for dimension in report['dimensions'].values()
            for row in dimension.get('checks', [])]
    print(json.dumps({'status': report['status'],
                      'checks': {row['id']: row['pass'] for row in rows}}, indent=2))


if __name__ == '__main__':
    main()
