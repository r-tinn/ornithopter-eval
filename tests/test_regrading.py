import copy
import json
from pathlib import Path
import tempfile
import unittest

from ornithopter_eval.checks import LATEST_SOURCE_FIRST_VERSION, SOURCE_FIRST_VERSION, checklist
from ornithopter_eval.experiment import automated_result
from ornithopter_eval.grading import LAUNCH_GRADING_REVISION, grade_submission
from ornithopter_eval.regrading import regrade_experiment
from ornithopter_eval.runner import digest, write_json


def report(passed):
    result = {'task_version': LATEST_SOURCE_FIRST_VERSION, 'status': 'passed' if passed else 'failed',
              'passed': passed, 'evidence': {'screenshots': []}, 'dimensions': {}}
    for group, rows in checklist(LATEST_SOURCE_FIRST_VERSION).items():
        checks = [{'id': name, 'pass': passed if name == 'power_limited_flight' else True,
                   'detail': {'attempts': [{'low_speed_throttle': .6, 'pass': True}]}
                   if name == 'power_limited_flight' and passed else {}} for name in rows]
        result['dimensions'][group] = {'checks': checks}
    return result


class RegradingTests(unittest.TestCase):
    def test_explicit_revision_rejects_unknown_or_legacy_protocol_before_writing(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / 'grade'
            for version, revision in [(LATEST_SOURCE_FIRST_VERSION, 'unknown'),
                                      (SOURCE_FIRST_VERSION, LAUNCH_GRADING_REVISION)]:
                with self.assertRaises(ValueError):
                    grade_submission(Path(temp) / 'missing', output,
                                     task_version=version, grading_revision=revision)
                self.assertFalse(output.exists())

    def test_regrade_keeps_original_physics_grades_and_validity_and_labels_new_page(self):
        with tempfile.TemporaryDirectory() as temp:
            source, output = Path(temp) / 'source', Path(temp) / 'regrade'
            run = source / 'trials/model-a-01'
            (run / 'submission').mkdir(parents=True)
            (run / 'grade').mkdir()
            (run / 'inputs').mkdir()
            (run / 'submission/physics.mjs').write_text('// Immutable saved aircraft\n')
            write_json(run / 'manifest.json', {
                'task_version': LATEST_SOURCE_FIRST_VERSION, 'status': 'submitted',
                'submission_sha256': {'physics.mjs': digest(run / 'submission/physics.mjs')},
                'editable_files': ['submission/physics.mjs']})
            write_json(run / 'grade/report.json', report(False))
            original = automated_result(report(False))
            experiment = {'task_version': LATEST_SOURCE_FIRST_VERSION, 'models': ['model-a'],
                          'repeats': 1, 'status': 'completed', 'protocol': 'Original generation',
                          'config': {'reasoning_effort': 'medium', 'budget_mode': 'wall_time',
                                     'max_wall_seconds': 480, 'max_output_tokens_total': None},
                          'trials': [{'id': 'model-a-01', 'model': 'model-a', 'repeat': 1,
                                      'status': 'submitted', 'grading_status': 'failed',
                                      'automated': original, 'rollout_review': {'pass': False}}]}
            write_json(source / 'experiment.json', experiment)
            (source / 'CALIBRATION.md').write_text('Original cohort observations\n')
            hashes = {str(p.relative_to(source)): digest(p) for p in source.rglob('*') if p.is_file()}
            calls = []

            def grade(submission, directory, **kwargs):
                calls.append(kwargs)
                directory.mkdir()
                result = report(True)
                result['grading_revision'] = kwargs['grading_revision']
                write_json(directory / 'report.json', result)
                return result

            result = regrade_experiment(source, output, grading_revision=LAUNCH_GRADING_REVISION,
                                        grader=grade)
            self.assertEqual(len(calls), 1)
            self.assertEqual(calls[0]['grading_revision'], LAUNCH_GRADING_REVISION)
            self.assertEqual(result['trials'][0]['automated']['passed'], 7)
            self.assertEqual(result['trials'][0]['original_automated'], original)
            self.assertEqual(result['models']['model-a']['protocol_invalid_attempts'], 1)
            self.assertIsNone(result['models']['model-a']['mean_passed'])
            self.assertEqual({str(p.relative_to(source)): digest(p) for p in source.rglob('*') if p.is_file()}, hashes)
            self.assertEqual(json.loads((output / 'trials/model-a-01/grade/report.json').read_text()), report(False))
            self.assertIn('Regraded saved submissions', (output / 'index.html').read_text())
            self.assertIn('60% pass', (output / 'index.html').read_text())
            self.assertTrue((output / 'ORIGINAL-CALIBRATION.md').exists())
            with self.assertRaises(ValueError):
                regrade_experiment(source, output, grading_revision=LAUNCH_GRADING_REVISION, grader=grade)


if __name__ == '__main__':
    unittest.main()
