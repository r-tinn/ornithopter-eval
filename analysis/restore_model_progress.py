"""Restore the published aircraft for local replay or a deterministic regrade."""
import argparse
import json
from pathlib import Path
import shutil

from ornithopter_eval.checks import LATEST_SOURCE_FIRST_VERSION
from ornithopter_eval.experiment import FILE_ONLY_ZERO, refresh_workbench
from ornithopter_eval.runner import ROOT, digest, write_json

REPORT = ROOT / 'reports/model-progress'
SCAFFOLD = ROOT / 'candidate/mechanical-v7/scaffold'
EDITABLE = ('aircraft.mjs', 'interpretation.json', 'kinematics.mjs', 'physics.mjs')


def hashes(path):
    return {str(p.relative_to(path)): digest(p) for p in sorted(path.rglob('*')) if p.is_file()}


def restore(output):
    data = json.loads((REPORT / 'results.json').read_text())
    config = json.loads((ROOT / 'configs/source-first-airframe-v4.json').read_text())
    trials = []
    output.mkdir(parents=True)
    write_json(output / 'config.json', config)
    for row in data['runs']:
        trial = row['snapshot']
        source = REPORT / 'submissions' / trial
        run = output / 'trials' / trial
        submission = run / 'submission'
        shutil.copytree(SCAFFOLD, submission)
        for name in EDITABLE:
            shutil.copyfile(source / name, submission / name)
        if hashes(submission) != row['submission_sha256']:
            raise ValueError('Restored aircraft differs from saved submission: ' + trial)
        validity = {'pass': row['file_only_valid'], 'status': 'completed',
                    'scope': 'Preserved original file-only audit verdict; no rollout republished.'}
        write_json(run / 'rollout-review.json', validity)
        write_json(run / 'published-verdicts.json', row['all_checks'])
        write_json(run / 'manifest.json', {
            'task_version': LATEST_SOURCE_FIRST_VERSION, 'model': row['model'],
            'status': row['generation_status'], 'config': row['generation_config'],
            'submission_sha256': row['submission_sha256'],
            'readonly_sha256': {name: sha for name, sha in row['submission_sha256'].items()
                               if name not in EDITABLE},
            'editable_files': ['submission/' + name for name in EDITABLE],
            'input_sha256': row['input_sha256'],
            'original_cohort': row['cohort'], 'original_trial': row['trial_id'],
        })
        trials.append({'id': trial, 'model': row['model'], 'repeat': row['repeat'],
                       'status': row['generation_status'], 'rollout_review': validity,
                       'automated': {'passed': sum(row['all_checks'].values()), 'total': 10,
                                     'failed': [name for name, passed in row['all_checks'].items() if not passed]}})
    return refresh_workbench(output, {
        'task_version': LATEST_SOURCE_FIRST_VERSION, 'models': [m['model'] for m in data['models']],
        'repeats': 3, 'config': config, 'status': 'completed', 'grading_revision': data['rubric'],
        'score_policy': FILE_ONLY_ZERO, 'trials': trials, 'protocol': data['kind'],
    })


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('output', type=Path)
    print(json.dumps(restore(p.parse_args().output)['models'], indent=2))
