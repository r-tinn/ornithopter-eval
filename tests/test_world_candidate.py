import json
import tempfile
import unittest
from pathlib import Path

from ornithopter_eval.grading import grade_submission
from ornithopter_eval.policy import PolicyError
from ornithopter_eval.runner import digest,run_model
from ornithopter_eval.world_candidate import CANDIDATE,CandidateFilePolicy,prepare_world


class WorldCandidateTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)

    def test_empty_packet_is_standalone_and_contains_no_flight_solution(self):
        packet=prepare_world(Path(self.temp.name)/'empty')
        manifest=json.loads((packet/'manifest.json').read_text())
        self.assertFalse(manifest['reference_fixture'])
        self.assertEqual(json.loads((packet/'submission/interpretation.json').read_text())['sources'],[])
        self.assertIn('throw new Error',(packet/'submission/physics.mjs').read_text())
        self.assertIn('throw new Error',(packet/'submission/aircraft.mjs').read_text())
        self.assertFalse((packet/'inputs/SOURCE_AUDIT.md').exists())
        self.assertEqual(len(list((packet/'inputs/sources').glob('*.jpg'))),2)
        for name,sha in manifest['readonly_sha256'].items():
            self.assertEqual(digest(packet/'submission'/name),sha)
        for path in (packet/'submission').rglob('*'):
            self.assertFalse(path.is_symlink())
            if path.suffix in ('.js','.mjs','.html'):
                self.assertNotIn('/Users/tinnfamily/Documents/',path.read_text())
        provenance=json.loads((CANDIDATE/'PROVENANCE.json').read_text())
        for name,record in provenance['files'].items():
            self.assertEqual(digest(packet/'submission/environment/vendor'/name),record['sha256'])
        self.assertTrue((packet/'submission/environment/vendor/THREE-LICENSE.txt').is_file())

    def test_native_file_policy_protects_shared_world_and_sources(self):
        packet=prepare_world(Path(self.temp.name)/'empty')
        policy=CandidateFilePolicy(packet)
        before=digest(packet/'submission/environment/world.mjs')
        for path in ('submission/index.html','submission/environment/world.mjs','submission/environment/platform.mjs','submission/environment/vendor/three.core.min.js','submission/extra.mjs'):
            with self.subTest(path=path),self.assertRaises(PolicyError):
                policy.apply({'type':'delete_file','path':path})
        with self.assertRaises(PolicyError):
            policy.apply({'type':'delete_file','path':'inputs/TASK.md'})
        policy.apply({'type':'update_file','path':'submission/interpretation.json',
            'diff':'@@\n-  "sources": [],\n+  "sources": ["02", "14"],'})
        self.assertEqual(json.loads((packet/'submission/interpretation.json').read_text())['sources'],['02','14'])
        self.assertEqual(digest(packet/'submission/environment/world.mjs'),before)

    def test_reference_is_explicitly_withheld_and_candidate_cannot_run_or_receive_legacy_grade(self):
        packet=prepare_world(Path(self.temp.name)/'reference',reference=True)
        manifest=json.loads((packet/'manifest.json').read_text())
        self.assertTrue(manifest['not_a_model_submission'])
        self.assertIn('fixture_only:true',(packet/'submission/physics.mjs').read_text())
        with self.assertRaises(PolicyError):
            CandidateFilePolicy(packet)
        def unexpected(*args,**kwargs):
            self.fail('A review candidate must not call the model API')
        with self.assertRaises(ValueError):
            run_model(packet,'offline-test',unexpected)
        report=grade_submission(packet/'submission',Path(self.temp.name)/'legacy-grade')
        self.assertEqual(report['status'],'infrastructure_error')
        self.assertIn('different task version',report['error'])
        with self.assertRaises(ValueError):
            prepare_world(packet)

    def test_prepared_smoke_uses_restricted_native_tools_and_includes_full_contract(self):
        from ornithopter_eval.runner import prepare,initial_input
        from ornithopter_eval.checks import MECHANICAL_VERSION
        packet=prepare(Path(self.temp.name)/'trial',CANDIDATE.parents[1]/'configs/mechanical-v4-smoke.json')
        original=digest(packet/'submission/environment/world.mjs')
        calls=[]
        replies=iter([
            {'status':'completed','output':[
                {'type':'apply_patch_call','call_id':'forbidden','operation':{'type':'delete_file','path':'submission/environment/world.mjs'}},
                {'type':'apply_patch_call','call_id':'allowed','operation':{'type':'update_file','path':'submission/interpretation.json','diff':'@@\n-  "sources": [],\n+  "sources": ["02"],'}}
            ],'usage':{'input_tokens':100,'output_tokens':17000}},
            {'status':'completed','output':[],'usage':{'input_tokens':100,'output_tokens':100}},
        ])
        def transport(payload,timeout):
            calls.append(json.loads(json.dumps(payload)));return next(replies)
        prompt=initial_input(packet)[0]['content'][0]['text']
        self.assertIn('ENGINEERING ASSUMPTIONS',prompt)
        self.assertIn('createAircraft',prompt)
        self.assertNotIn('7.4²/6.61',prompt)
        self.assertNotIn('fixture_only:true',prompt)
        result=run_model(packet,'offline-smoke',transport)
        self.assertEqual(result['task_version'],MECHANICAL_VERSION)
        self.assertEqual(result['status'],'submitted')
        self.assertEqual(result['output_token_notice_percentages_sent'],[50])
        self.assertEqual(calls[0]['reasoning'],{'effort':'medium'})
        self.assertEqual(calls[0]['max_output_tokens'],32000)
        self.assertEqual(calls[1]['max_output_tokens'],15000)
        self.assertEqual(digest(packet/'submission/environment/world.mjs'),original)
        events=[json.loads(l) for l in (packet/'events.jsonl').read_text().splitlines()]
        outputs=[e['result'] for e in events if e['event']=='tool_result']
        self.assertEqual([o['status'] for o in outputs],['failed','completed'])

    def test_smoke_grader_refuses_shared_world_tampering(self):
        from ornithopter_eval.runner import prepare
        from ornithopter_eval.checks import MECHANICAL_VERSION
        packet=prepare(Path(self.temp.name)/'tamper',CANDIDATE.parents[1]/'configs/mechanical-v4-smoke.json')
        result=run_model(packet,'offline-smoke',lambda *a,**kw:{'status':'completed','output':[],'usage':{'input_tokens':0,'output_tokens':1}})
        world=packet/'submission/environment/world.mjs';world.write_text('// changed world\n')
        result['submission_sha256']['environment/world.mjs']=digest(world)
        (packet/'manifest.json').write_text(json.dumps(result))
        report=grade_submission(packet/'submission',packet/'grade',task_version=MECHANICAL_VERSION)
        self.assertEqual(report['status'],'infrastructure_error')
        self.assertIn('Shared world changed',report['error'])
