import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from ornithopter_eval.checks import CHECKS, TASK_VERSION, VISUAL_CHECKS, normalize_checks, refresh_verdict
from ornithopter_eval.review import apply_review, audit_consistency, judge


def report_fixture():
    return refresh_verdict({"task_version":TASK_VERSION, "submission_sha256":{},
        "dimensions":{group:{"checks":[{"id":name,"pass":None if group=="visual" else True}
            for name in names]} for group,names in CHECKS.items()},
        "evidence":{"screenshots":sorted({image for spec in VISUAL_CHECKS.values() for image in spec["images"] if image.endswith(".png")})}})


def review_fixture():
    return {name:{"pass":True, "reason":"Offline protocol fixture, not a visual assessment",
                  "evidence":[image for image in VISUAL_CHECKS[name]["images"] if image.endswith(".png")]}
            for name in CHECKS["visual"]}


class ReviewTests(unittest.TestCase):
    def test_consistency_audit_flags_conflicting_identical_image_judgments(self):
        record={"model":"offline-fixture","rubric":TASK_VERSION,"evidence_sha256":{"inspection-top.png":"same-image-hash"},
            "responses":[{"check_id":"wings_on_both_sides","instruction":"same question","images":["inspection-top.png"],"response":{"model":"offline-fixture"}}],
            "review":{"wings_on_both_sides":{"pass":True,"reason":"fixture","evidence":["inspection-top.png"]}}}
        other=copy.deepcopy(record);other["review"]["wings_on_both_sides"]["pass"]=False
        result=audit_consistency([("reference",record),("static_wings",other)])
        self.assertFalse(result["consistent"])
        self.assertEqual(result["identical_input_groups"],1)
        other["evidence_sha256"]["inspection-top.png"]="different-image-hash"
        self.assertTrue(audit_consistency([("reference",record),("different",other)])["consistent"])

    def test_consistency_audit_distinguishes_different_model_settings(self):
        record={"model":"offline-fixture","rubric":TASK_VERSION,"evidence_sha256":{"inspection-top.png":"same"},
            "responses":[{"check_id":"wings_on_both_sides","instruction":"question","images":["inspection-top.png"],"response":{"model":"offline-fixture","temperature":0}}],
            "review":{"wings_on_both_sides":{"pass":True}}}
        other=copy.deepcopy(record);other["review"]["wings_on_both_sides"]["pass"]=False
        other["responses"][0]["response"]["temperature"]=1
        self.assertTrue(audit_consistency([("a",record),("b",other)])["consistent"])

    def test_pending_checks_cannot_be_silently_passed(self):
        report=report_fixture()
        self.assertIsNone(report["passed"])
        self.assertEqual(report["status"],"awaiting_review")
        with self.assertRaises(ValueError):
            apply_review(report,{})
        self.assertIsNone(report["passed"])

    def test_one_failure_fails_task_without_weighted_compensation(self):
        report=report_fixture()
        report["dimensions"]["physics"]["checks"][0]["pass"]=False
        result=apply_review(report,review_fixture())
        self.assertFalse(result["passed"])
        self.assertEqual(result["status"],"failed")
        self.assertNotIn("overall_score",result)

    def test_all_checks_required_for_pass(self):
        report=apply_review(report_fixture(),review_fixture())
        self.assertTrue(report["passed"])
        self.assertEqual(report["status"],"passed")
        self.assertEqual(sum(len(d["checks"]) for d in report["dimensions"].values()),25)

    def test_unreached_checks_still_fail(self):
        checks=normalize_checks("interaction",[{"id":"pause_freezes_state","pass":True}])
        self.assertEqual(len(checks),6)
        self.assertEqual(sum(c["pass"] for c in checks),1)

    def test_missing_or_duplicate_report_check_cannot_shrink_checklist(self):
        for duplicate in (False,True):
            report=report_fixture()
            items=report["dimensions"]["source"]["checks"]
            items.pop()
            if duplicate:
                items.append(copy.deepcopy(items[0]))
            with self.assertRaises(ValueError):
                apply_review(report,review_fixture())

    def test_boolean_and_evidence_validation_before_any_updates(self):
        for field,value in (("pass",80),("pass","true"),("evidence",["invented.png"]),("reason","")):
            report=report_fixture();before=copy.deepcopy(report)
            review=review_fixture();review["tail_behind_wings"][field]=value
            with self.assertRaises(ValueError):
                apply_review(report,review)
            self.assertEqual(report,before)

    def test_infrastructure_and_old_versions_cannot_receive_review(self):
        for key,value in (("status","infrastructure_error"),("task_version","swan-v1.0")):
            report=report_fixture();report[key]=value
            with self.assertRaises(ValueError):
                apply_review(report,review_fixture())

    def run_judge_fixture(self, transport, missing_image=False):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);grade=root/"grade";grade.mkdir();submission=root/"submission";submission.mkdir()
            sources=root/"task/sources";sources.mkdir(parents=True)
            (sources/"Unknown-2.jpg").write_bytes(b"offline-image-fixture")
            for image in report_fixture()["evidence"]["screenshots"]:
                if not (missing_image and image=="inspection-top.png"):
                    (grade/image).write_bytes(b"offline-image-fixture")
            (grade/"report.json").write_text(json.dumps(report_fixture()))
            with patch("ornithopter_eval.review.ROOT",root),patch("ornithopter_eval.review.verify_sources"):
                try:
                    result=judge(submission,grade,"offline-judge",transport)
                    error=None
                except (ValueError,RuntimeError) as exc:
                    result=json.loads((grade/"report.json").read_text());error=exc
            record=json.loads((grade/"review.json").read_text()) if (grade/"review.json").exists() else None
            return result,record,error

    def test_five_isolated_boolean_judge_calls(self):
        calls=[]
        def transport(payload,timeout):
            calls.append(payload)
            self.assertFalse(payload["store"])
            fmt=payload["text"]["format"]
            self.assertEqual(fmt["schema"]["properties"]["pass"],{"type":"boolean"})
            content=payload["input"][0]["content"]
            self.assertIn("Grade ONLY the GENERATED simulator",content[0]["text"])
            self.assertEqual(sum(c["type"]=="input_image" for c in content),len(VISUAL_CHECKS[fmt["name"]]["images"]))
            other=set(CHECKS["visual"])-{fmt["name"]}
            self.assertTrue(all(name not in json.dumps(payload) for name in other))
            return {"id":fmt["name"],"status":"completed","usage":{"output_tokens":30},
                "output":[{"type":"message","content":[{"type":"output_text",
                    "text":json.dumps(review_fixture()[fmt["name"]])}]}]}
        result,record,error=self.run_judge_fixture(transport)
        self.assertIsNone(error)
        self.assertEqual(len(calls),5)
        self.assertTrue(result["passed"])
        self.assertEqual(record["status"],"completed")
        self.assertEqual(len(record["responses"]),5)
        self.assertEqual(result["reviewer"]["model"],"offline-judge")

    def test_flapping_requires_two_distinct_frames_as_evidence(self):
        review=review_fixture()
        review["visible_flapping"]["evidence"]=["flap-0.png","flap-0.png"]
        with self.assertRaises(ValueError):
            apply_review(report_fixture(),review)

    def test_incomplete_judge_keeps_checks_ungraded_and_preserves_response(self):
        result,record,error=self.run_judge_fixture(lambda *a,**kw:{"status":"incomplete","output":[]})
        self.assertIsNotNone(error)
        self.assertIsNone(result["passed"])
        self.assertTrue(all(c["pass"] is None for c in result["dimensions"]["visual"]["checks"]))
        self.assertEqual(record["status"],"infrastructure_error")
        self.assertEqual(len(record["responses"]),1)

    def test_missing_image_never_becomes_failed_visual_judgment(self):
        def unexpected(*a,**kw):
            self.fail("Missing evidence must prevent API calls")
        result,record,error=self.run_judge_fixture(unexpected,missing_image=True)
        self.assertIsNotNone(error)
        self.assertIsNone(record)
        self.assertIsNone(result["passed"])


if __name__ == "__main__":
    unittest.main()
