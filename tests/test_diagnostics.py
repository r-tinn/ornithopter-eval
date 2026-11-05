"""Offline integration of request records, killed workers, and the result viewer."""
import io
import json
from pathlib import Path
import tempfile
import time
import unittest
import urllib.error
from unittest.mock import patch

from ornithopter_eval.api import APIError
from ornithopter_eval.deadline import DeadlineExceeded, call_before_deadline
from ornithopter_eval.diagnostics import new_request, safe_text, save_snapshot
from ornithopter_eval.experiment import refresh_workbench, write_transcript
from ornithopter_eval.runner import ROOT, digest, prepare, run_model
from ornithopter_eval.rollout import audit_rollout


class Response(io.BytesIO):
    def __init__(self, result):
        super().__init__(json.dumps(result).encode())
        self.status = 200
        self.headers = {'X-Request-ID':'req_success'}


def worker_http_failure(payload, timeout, *, diagnostics, diagnostic_path):
    diagnostics.update(status='failed',category='http_error',http_status=503,
                       phase='reading_error_body',response_headers={'x-request-id':'req_fixture','retry-after':'4'})
    save_snapshot(diagnostic_path,diagnostics)
    raise APIError('Fixture HTTP 503',diagnostics)


def worker_stalls_after_headers(payload, timeout, *, diagnostics, diagnostic_path):
    diagnostics.update(phase='reading_response_body',http_status=200,
                       response_headers={'x-request-id':'req_body_stalled'})
    save_snapshot(diagnostic_path,diagnostics)
    time.sleep(30)


class DiagnosticsTests(unittest.TestCase):
    def test_error_metadata_survives_real_worker_process(self):
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/'request.json';record=new_request('offline-fixture',3)
            with self.assertRaises(APIError) as caught:
                call_before_deadline(worker_http_failure,{},3,diagnostics=record,diagnostic_path=path)
            self.assertEqual(record['http_status'],503)
            self.assertEqual(record['response_headers']['x-request-id'],'req_fixture')
            self.assertEqual(record['response_headers']['retry-after'],'4')
            self.assertGreater(record['elapsed_seconds'],0)
            self.assertEqual(record['worker_exit_code'],0)
            self.assertEqual(record,caught.exception.diagnostics)
            self.assertEqual(record,json.loads(path.read_text()))

    def test_killed_request_retains_last_headers_and_phase_and_has_no_usage_claim(self):
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/'request.json';record=new_request('offline-fixture',2)
            with self.assertRaises(DeadlineExceeded) as caught:
                call_before_deadline(worker_stalls_after_headers,{},2,diagnostics=record,diagnostic_path=path)
            self.assertEqual(record['status'],'deadline_exceeded')
            self.assertEqual(record['phase'],'reading_response_body')
            self.assertEqual(record['http_status'],200)
            self.assertEqual(record['response_headers']['x-request-id'],'req_body_stalled')
            self.assertTrue(record['usage_unknown'])
            self.assertNotEqual(record['worker_exit_code'],0)
            self.assertEqual(record,caught.exception.diagnostics)
            self.assertEqual(record,json.loads(path.read_text()))

    def test_redaction_is_bounded_and_covers_credentials_and_image_data(self):
        text='sk-proj-otherkey Bearer other-token Basic dXNlcjpwYXNz http://u:p@proxy.invalid data:image/jpeg;base64,aGVsbG8=\n'+'x'*1000
        safe=safe_text(text)
        for secret in ['sk-proj-otherkey','other-token','dXNlcjpwYXNz','u:p','aGVsbG8=','\n']:
            self.assertNotIn(secret,safe)
        self.assertLessEqual(len(safe),600)

    def test_new_run_keeps_full_failure_diagnostics_and_exposes_them_in_gallery(self):
        def direct(transport,payload,timeout,**kwargs):return transport(payload,timeout=timeout,**kwargs)
        error=urllib.error.HTTPError('https://api.openai.com/v1/responses',503,'Unavailable',
                                    {'x-request-id':'req_run','Retry-After':'8'},io.BytesIO(b'{"error":{"code":"server_is_overloaded"}}'))
        first=Response({'status':'completed','output':[{'type':'shell_call','call_id':'read',
                         'action':{'commands':['ls submission']}}],'usage':{'input_tokens':1,'output_tokens':1}})
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);run=prepare(root/'trials/offline-fixture-01',generation_profile=ROOT/'configs/source-first-time.json')
            with patch('ornithopter_eval.api.get_api_key',return_value='offline-secret'),patch('ornithopter_eval.api.urllib.request.urlopen',side_effect=[first,error]) as send,patch('ornithopter_eval.runner.call_before_deadline',side_effect=direct):
                manifest=run_model(run,'offline-fixture')
            self.assertEqual(send.call_count,2)
            self.assertEqual(manifest['status'],'infrastructure_error')
            self.assertEqual(manifest['usage']['requests'],1)
            self.assertEqual(manifest['api_diagnostics']['sha256'],digest(run/'api-diagnostics.json'))
            records=json.loads((run/'api-diagnostics.json').read_text())['requests']
            self.assertEqual(len(records),2)
            self.assertEqual(records[0]['status'],'succeeded')
            self.assertNotEqual(records[0]['client_request_id'],records[1]['client_request_id'])
            record=records[1]
            request=[json.loads(line) for line in (run/'events.jsonl').read_text().splitlines() if json.loads(line)['event']=='request'][-1]
            self.assertEqual(request['client_request_id'],record['client_request_id'])
            self.assertEqual(json.loads((run/request['diagnostic_file']).read_text()),record)
            self.assertEqual(record['http_status'],503)
            self.assertEqual(record['response_headers']['x-request-id'],'req_run')
            self.assertNotIn('offline-secret',json.dumps(record))
            write_transcript(run)
            transcript=(run/'transcript.txt').read_text()
            self.assertIn('RUN END',transcript);self.assertIn('API DIAGNOSTICS',transcript)
            self.assertIn('server_is_overloaded',transcript)
            refresh_workbench(root,{'task_version':manifest['task_version'],'models':['offline-fixture'],
                'repeats':1,'config':manifest['config'],'status':'attention_required',
                'trials':[{'id':run.name,'model':'offline-fixture','repeat':1,'status':manifest['status'],
                           'reason':manifest['reason'],'automated':None}]})
            gallery=(root/'index.html').read_text()
            self.assertIn('trials/offline-fixture-01/api-diagnostics.json',gallery)
            self.assertIn('API diagnostics',gallery)
            self.assertEqual(json.loads((root/'summary.json').read_text())['models']['offline-fixture']['graded_attempts'],0)

    def test_successful_instrumented_run_still_passes_file_only_audit(self):
        def direct(transport,payload,timeout,**kwargs):return transport(payload,timeout=timeout,**kwargs)
        with tempfile.TemporaryDirectory() as temp:
            for timed in (False,True):
                with self.subTest(timed=timed):
                    result=Response({'status':'completed','output':[],'usage':{'input_tokens':1,'output_tokens':1}})
                    profile=ROOT/'configs/source-first-time.json' if timed else None
                    run=prepare(Path(temp)/str(timed),generation_profile=profile)
                    with patch('ornithopter_eval.api.get_api_key',return_value='offline-secret'),patch('ornithopter_eval.api.urllib.request.urlopen',return_value=result),patch('ornithopter_eval.runner.call_before_deadline',side_effect=direct) as worker:
                        manifest=run_model(run,'offline-fixture')
                    self.assertEqual(manifest['status'],'submitted')
                    self.assertEqual(worker.call_count,1 if timed else 0)
                    self.assertIs(audit_rollout(run)['pass'],True)
                    self.assertEqual(manifest['api_diagnostics']['requests'],1)
