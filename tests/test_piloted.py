import json
import io
from contextlib import redirect_stdout
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from ornithopter_eval.checks import PILOTED_VERSION,MECHANICAL_VERSION,checklist,refresh_verdict
from ornithopter_eval.runner import ROOT,prepare,initial_input,run_model,digest
from ornithopter_eval.world_candidate import prepare_world,CandidateFilePolicy
from ornithopter_eval.policy import PolicyError
from ornithopter_eval.review import apply_review,PILOTED_VISUAL_CHECKS


class PilotedTests(unittest.TestCase):
    def test_cli_defaults_to_v5_and_grades_the_recorded_version(self):
        from ornithopter_eval.__main__ import main
        with tempfile.TemporaryDirectory() as temp,redirect_stdout(io.StringIO()):
            root=Path(temp)/'trial'
            main(['prepare',str(root),'--config',str(ROOT/'configs/mechanical-v5-timed.json')])
            self.assertEqual(json.loads((root/'manifest.json').read_text())['task_version'],PILOTED_VERSION)
            config=json.loads((root/'manifest.json').read_text())['config']
            self.assertEqual(config['max_wall_seconds'],240)
            self.assertEqual(config['budget_mode'],'wall_time')
            self.assertIsNone(config['max_output_tokens_total'])
            with patch('ornithopter_eval.__main__.grade_submission',return_value={'status':'awaiting_review','dimensions':{}}) as grade:
                main(['grade',str(root/'submission'),'--output',str(root/'grade')])
                self.assertEqual(grade.call_args.kwargs['task_version'],PILOTED_VERSION)

    def test_packet_is_unsolved_and_protects_actual_motion_and_engine_assumptions(self):
        with tempfile.TemporaryDirectory() as temp:
            root=prepare(Path(temp)/'run',ROOT/'configs/mechanical-v5-smoke.json')
            manifest=json.loads((root/'manifest.json').read_text())
            self.assertEqual(manifest['task_version'],PILOTED_VERSION)
            self.assertEqual(manifest['config']['reasoning_effort'],'medium')
            self.assertEqual(manifest['config']['max_output_tokens_total'],32000)
            self.assertIn('submission/kinematics.mjs',manifest['editable_files'])
            self.assertIn('throw new Error',(root/'submission/kinematics.mjs').read_text())
            self.assertNotIn('fixture_only',(root/'submission/physics.mjs').read_text())
            policy=CandidateFilePolicy(root)
            for name in ['environment/mechanism.mjs','environment/engineering.mjs','environment/platform.mjs']:
                with self.assertRaises(PolicyError):policy.apply({'type':'delete_file','path':'submission/'+name})
                self.assertEqual(digest(root/'submission'/name),manifest['readonly_sha256'][name])
            prompt=initial_input(root)[0]['content'][0]['text']
            self.assertIn('submission/kinematics.mjs',prompt)
            self.assertIn('55 kg',prompt)
            self.assertNotIn('AR=7.4',prompt)
            self.assertNotIn('fixtures/mechanical-v5',prompt)
            result=run_model(root,'offline-only',lambda *a,**kw:{'status':'completed','output':[],'usage':{'input_tokens':0,'output_tokens':1}})
            self.assertEqual(result['status'],'submitted')

    def test_full_mass_budget_and_fuel_parameters_match_frozen_runtime_copy(self):
        e=json.loads((ROOT/'candidate/mechanical-v5/engineering.json').read_text())
        runtime=(ROOT/'candidate/mechanical-v5/scaffold/environment/engineering.mjs').read_text().split('export const E=',1)[1].strip().removesuffix(';')
        self.assertEqual(json.loads(runtime),e)
        self.assertAlmostEqual(sum(x['kg'] for x in e['mass_budget']),224.9)
        self.assertEqual(next(x['kg'] for x in e['mass_budget'] if x['id']=='pilot'),55)
        self.assertAlmostEqual(e['fuel']['initial_litres']*e['fuel']['density_kg_litre'],e['fuel']['initial_kg'])
        self.assertLess(e['engine']['continuous_shaft_limit_W'],e['engine']['published_peak_W'])

    def test_visual_recognition_requires_an_explicit_binary_review_with_real_evidence(self):
        checks=checklist(PILOTED_VERSION)
        report=refresh_verdict({'task_version':PILOTED_VERSION,'dimensions':{g:{'checks':[{'id':n,'pass':None if g=='visual' else True} for n in rows]} for g,rows in checks.items()},
            'evidence':{'screenshots':sorted({i for spec in PILOTED_VISUAL_CHECKS.values() for i in spec['images']})}})
        self.assertIsNone(report['passed'])
        review={name:{'pass':True,'reason':'Offline review-format fixture, not an image assessment','evidence':spec['images']} for name,spec in PILOTED_VISUAL_CHECKS.items()}
        review['recognisable_adult_pilot']['pass']=False
        self.assertFalse(apply_review(report,review)['passed'])
        self.assertEqual(sum(len(v) for k,v in checks.items() if k!='visual'),28)
        self.assertEqual(sum(len(v) for k,v in checklist(MECHANICAL_VERSION).items() if k!='visual'),16)

    def test_reference_is_not_a_model_attempt_and_has_no_external_runtime_paths(self):
        with tempfile.TemporaryDirectory() as temp:
            packet=prepare_world(Path(temp)/'reference',True,PILOTED_VERSION)
            m=json.loads((packet/'manifest.json').read_text());self.assertTrue(m['not_a_model_submission'])
            with self.assertRaises(PolicyError):CandidateFilePolicy(packet)
            for f in (packet/'submission').rglob('*'):
                if f.suffix in ('.mjs','.html'):
                    self.assertNotIn('/Users/tinnfamily/',f.read_text())
            self.assertTrue((packet/'submission/environment/vendor/three.core.min.js').exists())


if __name__=='__main__':unittest.main()
