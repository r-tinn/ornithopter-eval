import copy
import json
import tempfile
import unittest
from pathlib import Path

from ornithopter_eval.api import APIError
from ornithopter_eval.runner import prepare, run_model, verify_sources, execute_call
from ornithopter_eval.policy import FilePolicy
from ornithopter_eval.grading import grade_submission


def response(output, status="completed", tokens=100):
    return {"id":"offline-fixture", "status":status,"output":output,
            "usage":{"input_tokens":200,"output_tokens":tokens}}


class RunnerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.run = prepare(Path(self.temp.name)/"run")

    def test_sources_verified_and_only_selected_inputs_visible(self):
        self.assertEqual({x["id"] for x in verify_sources()},{"02","14"})
        self.assertFalse((self.run/"inputs/reference").exists())
        self.assertFalse((self.run/"inputs/source-manifest.json").exists())
        self.assertEqual(len(list((self.run/"inputs/sources").glob("*.jpg"))),2)

    def test_prepare_never_overwrites_an_attempt(self):
        with self.assertRaises(ValueError):
            prepare(self.run)

    def test_mocked_responses_loop_and_native_patch(self):
        calls=[]
        def transport(payload, timeout):
            calls.append(copy.deepcopy(payload))
            if len(calls)==1:
                self.assertFalse(payload["store"])
                self.assertEqual(payload["include"],["reasoning.encrypted_content"])
                self.assertTrue(any(x["type"]=="apply_patch" for x in payload["tools"]))
                return response([{"type":"apply_patch_call","call_id":"p1","operation":
                                 {"type":"create_file","path":"submission/new.js","diff":"+const x=1;"}}])
            self.assertEqual(payload["input"][-1]["status"],"completed")
            return response([{"type":"message","role":"assistant","content":[{"type":"output_text","text":"Done"}]}])
        result = run_model(self.run,"offline-test",transport)
        self.assertEqual(result["status"],"submitted")
        self.assertEqual(result["usage"]["output_tokens"],200)
        self.assertEqual((self.run/"submission/new.js").read_text(),"const x=1;\n")
        self.assertNotIn("OPENAI_API_KEY",(self.run/"events.jsonl").read_text())
        with self.assertRaises(ValueError):
            run_model(self.run,"offline-test",transport)

    def test_shell_calls_denied_without_execution(self):
        result=execute_call(FilePolicy(self.run),{"type":"shell_call","call_id":"s1","action":{"commands":["npm test"]}})
        self.assertEqual(result["output"][0]["outcome"]["exit_code"],1)
        self.assertEqual(result["type"],"shell_call_output")

    def test_partial_response_does_not_apply_truncated_code(self):
        result=run_model(self.run,"offline-test",lambda *a,**kw:response([
            {"type":"apply_patch_call","call_id":"p1","operation":
             {"type":"create_file","path":"submission/bad.js","diff":"+truncated"}}],status="incomplete"))
        self.assertEqual(result["status"],"budget_exhausted")
        self.assertFalse((self.run/"submission/bad.js").exists())

    def test_transport_error_is_not_a_model_score(self):
        def fail(*a,**kw):
            raise APIError("offline transport failure")
        result=run_model(self.run,"offline-test",fail)
        self.assertEqual(result["status"],"infrastructure_error")
        self.assertEqual(result["usage"]["requests"],0)

    def test_changed_inputs_are_rejected(self):
        (self.run/"inputs/TASK.md").write_text("changed")
        with self.assertRaises(ValueError):
            run_model(self.run,"offline-test",lambda *a,**kw:response([]))

    def test_missing_usage_does_not_bypass_budget(self):
        result=run_model(self.run,"offline-test",lambda *a,**kw:{"status":"completed","output":[]})
        self.assertEqual(result["status"],"infrastructure_error")
        self.assertIn('"event": "response"',(self.run/"events.jsonl").read_text())

    def test_changed_submission_cannot_be_graded_as_original_attempt(self):
        run_model(self.run,"offline-test",lambda *a,**kw:response([]))
        (self.run/"submission/index.html").write_text("changed after submission")
        report=grade_submission(self.run/"submission",Path(self.temp.name)/"changed-grade")
        self.assertEqual(report["status"],"infrastructure_error")
        self.assertIn("changed after",report["error"])

    def test_request_limit_is_enforced(self):
        manifest=json.loads((self.run/"manifest.json").read_text())
        manifest["config"]["max_requests"]=2
        (self.run/"manifest.json").write_text(json.dumps(manifest))
        count=[]
        def transport(*a,**kw):
            count.append(1)
            return response([{"type":"shell_call","call_id":str(len(count)),"action":{"commands":["ls submission"]}}])
        result=run_model(self.run,"offline-test",transport)
        self.assertEqual(len(count),2)
        self.assertEqual(result["status"],"budget_exhausted")


if __name__ == "__main__":
    unittest.main()
