import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

from ornithopter_eval.__main__ import main
from ornithopter_eval.checks import SOURCE_FIRST_VERSION,checklist
from ornithopter_eval.runner import ROOT,digest,initial_input,prepare
from ornithopter_eval.world_candidate import CandidateFilePolicy
from ornithopter_eval.policy import PolicyError


class SourceFirstTests(unittest.TestCase):
    def test_packet_contains_nine_unchanged_original_photos_and_all_context(self):
        with tempfile.TemporaryDirectory() as temp:
            run=prepare(Path(temp)/'run',ROOT/'configs/source-first-v6.json')
            selection=json.loads((ROOT/'candidate/mechanical-v6/source-selection.json').read_text())
            self.assertEqual({s['id'] for s in selection['sources']},{'02','08','09','10','11','12','13','14','15'})
            self.assertEqual(len(list((run/'inputs/sources').glob('*.jpg'))),9)
            for s in selection['sources']:self.assertEqual(digest(run/'inputs/sources'/s['file']),s['sha256'])
            content=initial_input(run)[0]['content']
            self.assertEqual(sum(c['type']=='input_image' for c in content),9)
            self.assertIn('Read all nine',content[0]['text'])
            self.assertIn('480 seconds',content[0]['text'])
            self.assertIn('240 and 360 seconds',content[0]['text'])
            self.assertIn('Smooth takeoff',content[0]['text'])
            self.assertIn('177.5',content[0]['text'])
            self.assertIn('aesthetic realism',content[0]['text'])
            self.assertTrue((run/'inputs/GRADERS.md').is_file())
            self.assertIn('throw Error',(run/'submission/physics.mjs').read_text())
            self.assertNotIn('fixture_only',(run/'submission/aircraft.mjs').read_text())
            policy=CandidateFilePolicy(run)
            with self.assertRaises(PolicyError):policy.apply({'type':'delete_file','path':'submission/environment/source-mechanism.mjs'})

    def test_default_cli_is_revised_task_with_exactly_six_binary_task_targets(self):
        with tempfile.TemporaryDirectory() as temp,redirect_stdout(io.StringIO()):
            self.assertEqual(main(['prepare',str(Path(temp)/'run')]),0)
            manifest=json.loads((Path(temp)/'run/manifest.json').read_text())
            self.assertEqual(manifest['task_version'],SOURCE_FIRST_VERSION)
            self.assertEqual(manifest['config']['max_wall_seconds'],480)
            self.assertEqual(manifest['config']['reasoning_effort'],'medium')
            self.assertIsNone(manifest['config']['max_output_tokens_total'])
        checks=checklist(SOURCE_FIRST_VERSION)
        self.assertEqual(sum(map(len,checks.values())),6)
        self.assertEqual(set(checks['interaction']),{'wheel_rotation_axis'})
        self.assertEqual(len(checks['physics']),5)

    def test_human_mass_and_section_data_are_internally_consistent(self):
        candidate=ROOT/'candidate/mechanical-v6'
        engineering=json.loads((candidate/'engineering.json').read_text())
        self.assertAlmostEqual(sum(m['kg'] for m in engineering['mass_budget']),173.9)
        self.assertEqual(engineering['pilot_mass_kg'],55)
        self.assertAlmostEqual(engineering['dry_mass_including_pilot_kg']+engineering['fuel']['initial_kg'],177.5)
        runtime=(candidate/'scaffold/environment/engineering.mjs').read_text().split('=',1)[1].strip().rstrip(';')
        self.assertEqual(json.loads(runtime),engineering)
        self.assertNotEqual(engineering['sections']['inner']['cl_base'],engineering['sections']['outer']['cl_base'])
        self.assertAlmostEqual(engineering['glide']['derived_lift_to_drag'],7.291556536683965)


if __name__=='__main__':unittest.main()
