import copy
import json
from pathlib import Path
import tempfile
import unittest
from ornithopter_eval.airframe import require_calibration,CHECKS
from ornithopter_eval.experiment import automated_result
from ornithopter_eval.checks import refresh_verdict
from ornithopter_eval.runner import ROOT,prepare,initial_input

class AirframeTests(unittest.TestCase):
    def test_adopted_kernel_is_calibrated(self):
        self.assertTrue(require_calibration()['all_passed'])

    def test_new_config_supplies_explicit_instructions_without_changing_old_packet(self):
        before=(ROOT/'candidate/mechanical-v7/TASK.md').read_bytes()
        with tempfile.TemporaryDirectory() as temp:
            run=prepare(Path(temp)/'run',ROOT/'configs/source-first-airframe-v1.json')
            text=initial_input(run)[0]['content'][0]['text']
            self.assertIn('airframe-binary-v1',text)
            self.assertIn('No human or LLM judge',text.replace('no human or LLM judge','No human or LLM judge'))
            self.assertNotIn('The eighth grader is a human',text)
            self.assertIn('480',text)
        self.assertEqual(before,(ROOT/'candidate/mechanical-v7/TASK.md').read_bytes())

    def test_complete_eleven_binary_results_and_missing_extra_checks(self):
        report=json.loads((ROOT/'validation/bank-v2-20261105/positive/report.json').read_text())
        report['grading_revision']='airframe-binary-v1'
        report['dimensions']['airframe']={'kind':'deterministic','checks':[{'id':n,'pass':True} for n in CHECKS]}
        refresh_verdict(report)
        self.assertEqual(automated_result(report)['passed'],11)
        bad=copy.deepcopy(report);bad['dimensions']['airframe']['checks'].pop()
        self.assertIsNone(automated_result(bad))
        with self.assertRaises(ValueError):refresh_verdict(bad)

    def test_new_config_selects_matching_grading_revision(self):
        from ornithopter_eval.experiment import run_experiment
        def transport(payload,timeout):
            return {'status':'completed','output':[],'usage':{'input_tokens':1,'output_tokens':1}}
        def grader(submission,output,node):
            report=json.loads((ROOT/'validation/bank-v2-20261105/positive/report.json').read_text())
            report['grading_revision']='airframe-binary-v1'
            report['dimensions']['airframe']={'kind':'deterministic','checks':[{'id':n,'pass':True} for n in CHECKS]}
            refresh_verdict(report)
            Path(output).mkdir();(Path(output)/'report.json').write_text(json.dumps(report))
            return report
        with tempfile.TemporaryDirectory() as temp:
            r=run_experiment(Path(temp)/'cohort',['fixture'],1,ROOT/'configs/source-first-airframe-v1.json',transport=transport,grader=grader,sequential=True,stop_on_error=True)
            self.assertEqual(r['grading_revision'],'airframe-binary-v1')
            self.assertEqual(r['models']['fixture']['total_checks'],11)
            self.assertEqual(r['trials'][0]['automated']['total'],11)

    def test_v2_drops_only_truss_and_leaves_v1_score_unchanged(self):
        report=json.loads((ROOT/'validation/bank-v2-20261105/positive/report.json').read_text())
        report['grading_revision']='airframe-binary-v1'
        extra=[{'id':n,'pass':True} for n in CHECKS]
        report['dimensions']['airframe']={'kind':'deterministic','checks':extra}
        self.assertEqual(automated_result(refresh_verdict(report))['passed'],11)
        report['grading_revision']='airframe-binary-v2'
        report['dimensions']['airframe']['checks']=[c for c in extra if c['id']!='rear_truss_structure']
        self.assertEqual(automated_result(refresh_verdict(report))['total'],10)
        self.assertEqual(automated_result(report)['passed'],10)

    def test_v3_packet_uses_calibrated_cam_and_instance_revision(self):
        self.assertTrue(require_calibration('airframe-binary-v3')['reference_all_ten_pass'])
        with tempfile.TemporaryDirectory() as temp:
            run=prepare(Path(temp)/'run',ROOT/'configs/source-first-airframe-v3.json')
            text=initial_input(run)[0]['content'][0]['text']
            self.assertIn('cam-and-follower drives are also accepted',text)
            self.assertIn('(/10)',text)

    def test_old_rubric_does_not_accept_extra_checks(self):
        report=json.loads((ROOT/'validation/bank-v2-20261105/positive/report.json').read_text())
        report['dimensions']['airframe']={'checks':[]}
        with self.assertRaises(ValueError):refresh_verdict(report)
