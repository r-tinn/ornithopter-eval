"""Explicit new grades for immutable saved submissions; never calls model APIs."""
import copy
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

from .checks import LATEST_SOURCE_FIRST_VERSION
from .experiment import automated_result, refresh_workbench, write_trial_pages
from .grading import LAUNCH_GRADING_REVISION, grade_submission
from .runner import digest


def regrade_experiment(source, output, *, grading_revision, node='node', grader=grade_submission):
    source, output = Path(source).resolve(), Path(output).resolve()
    if grading_revision != LAUNCH_GRADING_REVISION:
        raise ValueError('Unsupported grading revision')
    if output.exists() or output.is_relative_to(source):
        raise ValueError('Use a fresh regrade destination outside the original experiment')
    experiment = json.loads((source / 'experiment.json').read_text())
    if experiment['task_version'] != LATEST_SOURCE_FIRST_VERSION:
        raise ValueError('This regrade revision supports v7 submissions only')
    if any(p.is_symlink() or p.name.startswith('.') for p in source.rglob('*')):
        raise ValueError('Unexpected hidden file or symlink in saved experiment')
    original_hashes = {str(p.relative_to(source)): digest(p) for p in source.rglob('*') if p.is_file()}
    for trial in experiment['trials']:
        run = source / 'trials' / trial['id']
        manifest = json.loads((run / 'manifest.json').read_text())
        actual = {str(p.relative_to(run / 'submission')): digest(p)
                  for p in (run / 'submission').rglob('*') if p.is_file()}
        if manifest.get('status') not in ('submitted', 'budget_exhausted') or actual != manifest.get('submission_sha256'):
            raise ValueError('Saved submission is not immutable/gradable: ' + trial['id'])
    shutil.copytree(source, output, ignore=shutil.ignore_patterns('artifacts.zip', 'export-sha256.json'))
    for name in ('CALIBRATION.md', 'playback-summary.json'):
        if (output / name).exists():
            (output / name).rename(output / ('ORIGINAL-' + name))
    (output / 'CALIBRATION.md').write_text(
        '# Retrospective launch regrade\n\n'
        'Same saved model submissions and generation packet; no new model calls. '
        'Only the explicitly labelled launch grading revision is applied. '
        'Initial reports remain in each trial/grade directory. '
        'Prior cohort notes, when present, are in ORIGINAL-CALIBRATION.md.\n\n'
        'Each profile starts from rest; throttle is 60%, 65%, then 70% below '
        '14 m/s, and full throttle above it. The first complete passing flight '
        'ends the sequence. All attempted failures remain in the new report. '
        'File-only validity and human aesthetics remain separate.\n')
    experiment['generation_protocol'] = experiment.get('protocol')
    experiment['protocol'] = 'Retrospective regrade only; original model generation and submissions unchanged.'
    experiment['grading_revision'] = grading_revision
    experiment['regrade'] = {
        'created_utc': datetime.now(timezone.utc).isoformat(), 'source': str(source),
        'source_experiment_sha256': digest(source / 'experiment.json'),
        'source_sha256': original_hashes, 'model_api_calls': 0,
        'original_grades_preserved_in': 'Each trial/grade directory',
    }
    for trial in experiment['trials']:
        trial['original_automated'] = copy.deepcopy(trial.get('automated'))
        trial['original_grading_status'] = trial.get('grading_status')
        trial['automated'] = None
        trial['grading_status'] = 'pending_regrade'
        trial['grade_directory'] = 'grade-' + grading_revision
    experiment['status'] = 'regrading'
    refresh_workbench(output, experiment)
    for trial in experiment['trials']:
        run = output / 'trials' / trial['id']
        report = grader(run / 'submission', run / trial['grade_directory'], node=node,
                        task_version=experiment['task_version'], grading_revision=grading_revision)
        trial['grading_status'] = report['status']
        trial['automated'] = automated_result(report)
        power = next((row for row in report.get('dimensions', {}).get('physics', {}).get('checks', [])
                      if row['id'] == 'power_limited_flight'), {})
        detail = power.get('detail', {})
        trial['launch_attempts'] = [
            {'low_speed_throttle': a['low_speed_throttle'], 'pass': a['pass'],
             'error': a.get('error'), 'final_status': a.get('final_state', {}).get('status'),
             'final_time_s': a.get('final_state', {}).get('time'),
             'first_sustained_takeoff': a.get('first_sustained_takeoff')}
            for a in detail.get('attempts', [])] if isinstance(detail, dict) else []
        write_trial_pages(run, trial['grade_directory'])
        if trial['automated'] is None:
            trial['grading_error'] = report.get('error', 'Incomplete regrading')
            experiment['status'] = 'attention_required'
            refresh_workbench(output, experiment)
            raise RuntimeError('Regrading stopped after infrastructure failure: ' + trial['id'])
        refresh_workbench(output, experiment)
        print(trial['id'] + ': ' + json.dumps({'automated': trial['automated'],
                                              'launch_attempts': trial['launch_attempts']}), flush=True)
    for trial in experiment['trials']:
        relative = Path('trials') / trial['id']
        for folder in ('submission', 'inputs', 'grade'):
            for p in (source / relative / folder).rglob('*'):
                if p.is_file() and digest(p) != digest(output / p.relative_to(source)):
                    raise RuntimeError('Copied original artifact changed: ' + str(p))
    if any(digest(source / p) != sha for p, sha in original_hashes.items()):
        raise RuntimeError('Original experiment changed during regrading')
    experiment['status'] = 'completed'
    experiment['regrade']['source_verified_unchanged'] = True
    return refresh_workbench(output, experiment)
