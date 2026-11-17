import json
from pathlib import Path
import tempfile
import unittest

from analysis.restore_model_progress import REPORT, restore
from ornithopter_eval.airframe import require_calibration
from ornithopter_eval.airframe_versions import LATEST_AIRFRAME_REVISION


class PublicSnapshotTests(unittest.TestCase):
    def test_published_scores_restore_from_hash_verified_aircraft(self):
        require_calibration(LATEST_AIRFRAME_REVISION)
        published = json.loads((REPORT / 'results.json').read_text())
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / 'snapshot'
            restored = restore(output)
            self.assertEqual(len(restored['trials']), 18)
            for model in published['models']:
                score = restored['models'][model['model']]
                self.assertEqual(score['mean_passed'], round(model['mean'], 2))
                self.assertEqual(score['total_checks'], 10)
            text = (output / 'index.html').read_text()
            self.assertIn('Published checks', text)
            self.assertNotIn('transcript.txt', text)
            self.assertNotIn('aesthetic realism score', text)
