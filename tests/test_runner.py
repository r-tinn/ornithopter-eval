import copy
import json
import tempfile
import unittest
from pathlib import Path

from ornithopter_eval.api import APIError
from ornithopter_eval.runner import prepare, run_model, verify_sources, execute_call, initial_input
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

    def test_previous_task_config_is_rejected_without_creating_attempt(self):
        config=json.loads((self.run/'manifest.json').read_text())['config']
        config['task_version']='swan-v3.0'
        config_path=Path(self.temp.name)/'previous-config.json'
        config_path.write_text(json.dumps(config))
        target=Path(self.temp.name)/'previous-task'
        with self.assertRaisesRegex(ValueError,'Unsupported task version'):
            prepare(target,config_path)
        self.assertFalse(target.exists())

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

    def test_incomplete_response_keeps_completed_patches_without_applying_partial_patch(self):
        calls=[]
        def transport(*args,**kwargs):
            calls.append(1)
            return response([
                {"type":"apply_patch_call","call_id":"p1","status":"completed","operation":
                 {"type":"create_file","path":"submission/complete.js","diff":"+const complete=true;"}},
                {"type":"apply_patch_call","call_id":"p2","status":"in_progress","operation":
                 {"type":"create_file","path":"submission/partial.js","diff":"+const partial="}}],
                status="incomplete")
        result=run_model(self.run,"offline-test",transport)
        self.assertEqual(len(calls),1)
        self.assertEqual(result["status"],"budget_exhausted")
        self.assertEqual((self.run/"submission/complete.js").read_text(),"const complete=true;\n")
        self.assertFalse((self.run/"submission/partial.js").exists())
        events=[json.loads(line) for line in (self.run/"events.jsonl").read_text().splitlines()]
        outputs=[e['result'] for e in events if e['event']=='tool_result']
        self.assertEqual([r['call_id'] for r in outputs],['p1'])

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

    def test_default_budget_is_32000_with_explicit_medium_and_reasoning_included(self):
        config=json.loads((self.run/'manifest.json').read_text())['config']
        self.assertEqual(config['max_output_tokens_total'],32000)
        self.assertEqual(config['max_output_tokens_per_response'],32000)
        self.assertEqual(config['reasoning_effort'],'medium')
        self.assertEqual(config['output_token_notice_percentages'],[50,75])
        self.assertIn('including reasoning, code/tool calls and final text',initial_input(self.run)[0]['content'][0]['text'])
        sent=[]
        run_model(self.run,'offline-test',lambda payload,**kw:sent.append(copy.deepcopy(payload)) or response([]))
        self.assertEqual(sent[0]['reasoning'],{'effort':'medium'})
        self.assertEqual(sent[0]['max_output_tokens'],32000)

    def test_missing_or_null_reasoning_defaults_to_explicit_medium(self):
        original=json.loads((self.run/'manifest.json').read_text())['config']
        for setting in ('missing','null'):
            with self.subTest(setting=setting):
                config=copy.deepcopy(original)
                config.pop('output_token_notice_percentages')
                if setting=='missing':config.pop('reasoning_effort')
                else:config['reasoning_effort']=None
                path=Path(self.temp.name)/(setting+'.json')
                path.write_text(json.dumps(config))
                run=prepare(Path(self.temp.name)/setting,path)
                recorded=json.loads((run/'manifest.json').read_text())['config']
                self.assertEqual(recorded['reasoning_effort'],'medium')
                self.assertEqual(recorded['output_token_notice_percentages'],[50,75])
                sent=[]
                run_model(run,'offline-test',lambda payload,**kw:sent.append(copy.deepcopy(payload)) or response([]))
                self.assertEqual(sent[0]['reasoning'],{'effort':'medium'})

    def test_notices_only_at_half_and_three_quarters_including_reasoning(self):
        sent=[];costs=iter([10000,6000,3000,5000,1000])
        def transport(payload,**kwargs):
            sent.append(copy.deepcopy(payload))
            output=[] if len(sent)==5 else [{'type':'shell_call','call_id':str(len(sent)),
                                            'action':{'commands':['ls submission']}}]
            item=response(output,tokens=next(costs))
            item['usage']['output_tokens_details']={'reasoning_tokens':item['usage']['output_tokens']//2}
            return item
        result=run_model(self.run,'offline-test',transport)
        self.assertEqual(result['status'],'submitted')
        self.assertEqual(len(sent),5)
        self.assertTrue(all(p['reasoning']=={'effort':'medium'} for p in sent))
        self.assertEqual([p['max_output_tokens'] for p in sent],[32000,22000,16000,13000,8000])
        self.assertEqual([sum(i.get('role')=='developer' for i in p['input']) for p in sent],[0,0,1,1,2])
        events=[json.loads(line) for line in (self.run/'events.jsonl').read_text().splitlines()]
        notices=[e for e in events if e['event']=='budget_notice']
        self.assertEqual([e['percentages'] for e in notices],[[50],[75]])
        self.assertEqual([e['output_tokens_used'] for e in notices],[16000,24000])
        self.assertEqual([e['output_tokens_remaining'] for e in notices],[16000,8000])
        self.assertEqual(result['output_token_notice_percentages_sent'],[50,75])
        for notice in notices:
            self.assertNotIn('requests',notice['text'])
            self.assertNotIn('seconds',notice['text'])
        from ornithopter_eval.experiment import write_transcript
        write_transcript(self.run)
        self.assertEqual((self.run/'transcript.txt').read_text().count('BUDGET NOTICE'),2)

    def test_thresholds_crossed_in_one_response_share_one_notice(self):
        sent=[]
        def transport(payload,**kwargs):
            sent.append(copy.deepcopy(payload))
            if len(sent)==1:
                return response([{'type':'shell_call','call_id':'s1','action':{'commands':['ls submission']}}],tokens=25000)
            return response([])
        result=run_model(self.run,'offline-test',transport)
        events=[json.loads(line) for line in (self.run/'events.jsonl').read_text().splitlines()]
        notices=[e for e in events if e['event']=='budget_notice']
        self.assertEqual(len(sent),2)
        self.assertEqual(len(notices),1)
        self.assertEqual(notices[0]['percentages'],[50,75])
        self.assertEqual(notices[0]['output_tokens_remaining'],7000)
        self.assertEqual(sent[1]['max_output_tokens'],7000)
        self.assertEqual(result['output_token_notice_percentages_sent'],[50,75])

    def test_submission_or_cutoff_never_creates_extra_request_for_a_notice(self):
        for status,tokens in [('completed',25000),('incomplete',32000)]:
            with self.subTest(status=status):
                run=prepare(Path(self.temp.name)/status)
                sent=[]
                def transport(payload,**kwargs):
                    sent.append(copy.deepcopy(payload))
                    return response([],status=status,tokens=tokens)
                result=run_model(run,'offline-test',transport)
                self.assertEqual(len(sent),1)
                self.assertEqual(result['output_token_notice_percentages_sent'],[])
                self.assertEqual(result['status'],'submitted' if status=='completed' else 'budget_exhausted')

    def test_invalid_notice_thresholds_rejected_before_preparation(self):
        original=json.loads((self.run/'manifest.json').read_text())['config']
        for index,percentages in enumerate(([75,50],[50,50],[0,75],[50,100],[True,75],None)):
            with self.subTest(percentages=percentages):
                config={**original,'output_token_notice_percentages':percentages}
                path=Path(self.temp.name)/f'invalid-{index}.json'
                path.write_text(json.dumps(config))
                output=Path(self.temp.name)/f'invalid-{index}'
                with self.assertRaisesRegex(ValueError,'notice percentages'):
                    prepare(output,path)
                self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
