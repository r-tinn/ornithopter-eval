import json
import tempfile
import unittest
from pathlib import Path

from ornithopter_eval.checks import CHECKS,TASK_VERSION
from ornithopter_eval.experiment import automated_result, export_experiment, refresh_workbench, run_experiment
from ornithopter_eval.runner import ROOT,write_json


def fake_grade(submission,output,node):
    output=Path(output);output.mkdir()
    report={"task_version":TASK_VERSION,"status":"awaiting_review","passed":None,
        "dimensions":{group:{"checks":[{"id":name,"pass":True} for name in names]}
            for group,names in CHECKS.items() if group!="visual"},"evidence":{"screenshots":[]}}
    write_json(output/"report.json",report)
    return report


class ExperimentTests(unittest.TestCase):
    def test_six_independent_attempts_with_identical_input_and_medium_reasoning(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)/"experiment";calls=[]
            def transport(payload,timeout):
                calls.append(payload)
                return {"status":"completed","output":[],"usage":{"input_tokens":200,"output_tokens":100}}
            result=run_experiment(root,["model-a","model-b"],3,ROOT/"configs/frontier-calibration.json",transport=transport,grader=fake_grade)
            self.assertEqual(result["status"],"completed")
            self.assertEqual(len(calls),6)
            self.assertTrue(all(p["reasoning"]=={"effort":"medium"} for p in calls))
            self.assertTrue(all(p["input"]==calls[0]["input"] for p in calls))
            self.assertEqual(len(list((root/"trials").glob("*/manifest.json"))),6)
            for run in (root/"trials").iterdir():
                self.assertTrue((run/"transcript.txt").is_file())
                self.assertTrue((run/"submission-source.txt").is_file())
                self.assertIn("Fly simulator",(root/"index.html").read_text())
                self.assertEqual(json.loads((run/"manifest.json").read_text())["status"],"submitted")
            self.assertIsNone(result["full_task_pass_rate"])
            self.assertEqual(result["models"]["model-a"]["graded_attempts"],3)
            with self.assertRaises(ValueError):
                run_experiment(root,["model-a","model-b"],3,ROOT/"configs/frontier-calibration.json",transport=transport)
            exported=export_experiment(root,Path(temp)/"export")
            self.assertTrue((exported/"artifacts.zip").is_file())
            self.assertEqual((exported/"trials/model-a-01/submission/index.html").read_bytes(),(root/"trials/model-a-01/submission/index.html").read_bytes())
            historical=json.loads((root/'experiment.json').read_text())
            historical['task_version']='swan-v3.0'
            refreshed=refresh_workbench(root,historical)
            self.assertEqual(refreshed['task_version'],'swan-v3.0')
            self.assertIn('swan-v3.0',(root/'index.html').read_text())

    def test_infrastructure_failure_is_preserved_and_stops_later_rounds(self):
        from ornithopter_eval.api import APIError
        with tempfile.TemporaryDirectory() as temp:
            calls=[]
            def transport(payload,timeout):
                calls.append(payload)
                raise APIError("offline transport failure")
            result=run_experiment(Path(temp)/"experiment",["model-a","model-b"],3,ROOT/"configs/frontier-calibration.json",transport=transport,grader=fake_grade)
            self.assertEqual(result["status"],"attention_required")
            self.assertEqual(len(calls),2)
            self.assertEqual(sum(t["status"]=="prepared" for t in result["trials"]),4)
            self.assertEqual(result["models"]["model-a"]["graded_attempts"],0)
            self.assertIsNone(result["models"]["model-a"]["mean_passed"])

    def test_missing_checks_and_infrastructure_are_not_scored_as_zero(self):
        self.assertIsNone(automated_result({"status":"infrastructure_error"}))
        self.assertIsNone(automated_result({"status":"awaiting_review","dimensions":{}}))

    def test_invalid_model_paths_rejected_before_creating_experiment(self):
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/"experiment"
            with self.assertRaises(ValueError):
                run_experiment(path,["../escape","other"],3,ROOT/"configs/frontier-calibration.json")
            self.assertFalse(path.exists())

    def test_v4_smoke_checklist_packet_and_gallery_have_correct_counts(self):
        from ornithopter_eval.checks import MECHANICAL_VERSION,MECHANICAL_CHECKS
        def grade(submission,output,node):
            output.mkdir()
            report={'task_version':MECHANICAL_VERSION,'status':'awaiting_review','dimensions':{
                group:{'checks':[{'id':name,'pass':True} for name in names]}
                for group,names in MECHANICAL_CHECKS.items() if group!='visual'},'evidence':{'screenshots':[]}}
            write_json(output/'report.json',report);return report
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)/'v4';calls=[]
            def transport(payload,timeout):
                calls.append(payload);return {'status':'completed','output':[],'usage':{'input_tokens':100,'output_tokens':1}}
            result=run_experiment(root,['model-a','model-b'],1,ROOT/'configs/mechanical-v4-smoke.json',transport=transport,grader=grade)
            self.assertEqual(result['models']['model-a']['total_checks'],15)
            self.assertEqual(result['models']['model-a']['graded_attempts'],1)
            self.assertEqual(len(calls),2)
            self.assertEqual(calls[0]['input'],calls[1]['input'])
            self.assertIn('Mechanical ornithopter',(root/'index.html').read_text())
            self.assertIn('4 visual checks',(root/'index.html').read_text())
            source=(root/'trials/model-a-01/submission-source.txt').read_text()
            self.assertIn('FILE: aircraft.mjs',source)
            self.assertNotIn('FILE: environment/',source)
            self.assertIn('candidate/mechanical-v4/scaffold/environment/vendor/three.core.min.js',json.loads((root/'experiment.json').read_text())['frozen_sha256'])
