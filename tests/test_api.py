import io
import http.client
import json
import os
import socket
import ssl
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch

from ornithopter_eval.api import APIError, create_response, get_api_key


class Response(io.BytesIO):
    def __init__(self, body, headers=None):
        super().__init__(body)
        self.status = 200
        self.headers = headers or {}


class APIErrorTests(unittest.TestCase):
    def test_provider_error_is_useful_and_redacts_key_without_retry(self):
        secret = "local-test-credential"
        body = json.dumps({"error":{"code":"invalid_parameter","param":"tools",
            "message":"Unsupported tool; credential " + secret}}).encode()
        error = urllib.error.HTTPError("https://api.openai.com/v1/responses",400,"Bad request",{},io.BytesIO(body))
        with patch("ornithopter_eval.api.get_api_key",return_value=secret), \
             patch("ornithopter_eval.api.urllib.request.urlopen",side_effect=error) as send:
            with self.assertRaises(APIError) as caught:
                create_response({"model":"example"})
        self.assertEqual(send.call_count,1)
        self.assertIn("invalid_parameter",str(caught.exception))
        self.assertIn('"param": "tools"',str(caught.exception))
        self.assertNotIn(secret,str(caught.exception))
        self.assertEqual(caught.exception.diagnostics['provider_error']['param'],'tools')

    def test_http_503_keeps_headers_and_structured_error_but_no_credentials(self):
        secret='fixture-secret-without-a-key-prefix'
        headers={'X-Request-ID':'req_503','Retry-After':'12','x-ratelimit-remaining-tokens':'0',
                 'OpenAI-Processing-Ms':'243','Authorization':'Bearer '+secret,'Set-Cookie':secret,
                 'OpenAI-Organization':'omit-account-identifiers','x-debug-secret':secret}
        body=json.dumps({'error':{'type':'service_unavailable_error','code':'server_is_overloaded',
                                  'message':'Try later; '+secret,'param':None},'unexpected':secret}).encode()
        error=urllib.error.HTTPError('https://api.openai.com/v1/responses',503,'Service unavailable',headers,io.BytesIO(body))
        with tempfile.TemporaryDirectory() as temp:
            snapshot=Path(temp)/'request.json';record={}
            with patch('ornithopter_eval.api.get_api_key',return_value=secret),patch('ornithopter_eval.api.urllib.request.urlopen',side_effect=error) as send:
                with self.assertRaises(APIError) as caught:
                    create_response({'model':'fixture'},diagnostic_path=snapshot)
            record=json.loads(snapshot.read_text())
            self.assertEqual(record,caught.exception.diagnostics)
            self.assertEqual(record['http_status'],503)
            self.assertEqual(record['response_headers'],{'x-request-id':'req_503','retry-after':'12',
                'x-ratelimit-remaining-tokens':'0','openai-processing-ms':'243'})
            self.assertEqual(record['provider_error']['type'],'service_unavailable_error')
            self.assertEqual(record['provider_error']['code'],'server_is_overloaded')
            self.assertNotIn(secret,json.dumps(record)+str(caught.exception))
            self.assertNotIn('omit-account-identifiers',json.dumps(record))
            self.assertEqual(send.call_count,1)

    def test_success_has_unique_client_id_timings_and_header_metadata_without_response_changes(self):
        records=[];requests=[]
        def send(request,timeout):
            requests.append(request)
            return Response(b'{"id":"resp_fixture","output":[],"usage":{}}',{'X-Request-Id':'req_success'})
        with patch('ornithopter_eval.api.get_api_key',return_value='fixture-key'),patch('ornithopter_eval.api.urllib.request.urlopen',side_effect=send):
            for _ in range(2):
                from ornithopter_eval.diagnostics import new_request
                record=new_request('fixture',30)
                response=create_response({'model':'fixture','input':'DO NOT LOG PROMPT'},timeout=30,diagnostics=record)
                records.append(record)
                self.assertEqual(response,{'id':'resp_fixture','output':[],'usage':{}})
        self.assertNotEqual(records[0]['client_request_id'],records[1]['client_request_id'])
        for record,request in zip(records,requests):
            self.assertEqual(record['client_request_id'],request.get_header('X-client-request-id'))
            self.assertEqual(record['status'],'succeeded')
            self.assertEqual(record['phase'],'completed')
            self.assertEqual(record['http_status'],200)
            self.assertGreater(record['request_bytes'],0)
            self.assertGreater(record['response_bytes'],0)
            self.assertLessEqual(record['response_headers_seconds'],record['transport_elapsed_seconds'])
            self.assertNotIn('DO NOT LOG PROMPT',json.dumps(record))

    def test_transport_causes_are_classified_and_redacted(self):
        errors=[(socket.gaierror(-2,'Name resolution failed'),'dns_error'),
                (ssl.SSLCertVerificationError(1,'certificate verify failed'),'tls_certificate_error'),
                (ssl.SSLError(1,'TLS handshake failed'),'tls_error'),
                (TimeoutError('Timed out'),'timeout'),
                (ConnectionResetError(54,'Reset by peer'),'connection_reset'),
                (ConnectionRefusedError(61,'Connection refused'),'connection_refused'),
                ('Tunnel connection failed: 503 Service Unavailable at http://user:password@proxy.invalid','proxy_tunnel_error')]
        for reason,category in errors:
            with self.subTest(category=category),patch('ornithopter_eval.api.get_api_key',return_value='fixture-key'),patch('ornithopter_eval.api.urllib.request.urlopen',side_effect=urllib.error.URLError(reason)) as send:
                with self.assertRaises(APIError) as caught:create_response({'model':'fixture'})
                d=caught.exception.diagnostics
                self.assertEqual(d['category'],category)
                self.assertEqual(d['causes'][0]['type'],'URLError')
                self.assertEqual(d['phase'],'waiting_for_response_headers')
                if isinstance(reason,OSError):self.assertEqual(d['causes'][1].get('errno'),reason.errno)
                self.assertNotIn('user:password',str(caught.exception)+json.dumps(d))
                self.assertEqual(send.call_count,1)

    def test_html_error_page_is_identified_but_not_logged(self):
        error=urllib.error.HTTPError('https://api.openai.com/v1/responses',503,'Unavailable',{},io.BytesIO(b'<html>DO NOT STORE THIS PAGE</html>'))
        with patch('ornithopter_eval.api.get_api_key',return_value='fixture-key'),patch('ornithopter_eval.api.urllib.request.urlopen',side_effect=error):
            with self.assertRaises(APIError) as caught:create_response({'model':'fixture'})
        self.assertEqual(caught.exception.diagnostics['error_body_format'],'non_json')
        self.assertEqual(caught.exception.diagnostics['http_status'],503)
        self.assertNotIn('DO NOT STORE',json.dumps(caught.exception.diagnostics))

    def test_malformed_success_and_interrupted_error_body_keep_http_context(self):
        class InterruptedErrorBody(io.BytesIO):
            def read(self,*args):raise http.client.IncompleteRead(b'private partial bytes')
        cases=[(Response(b'{BROKEN JSON WITH PRIVATE CONTENT'),200,'invalid_response'),
               (urllib.error.HTTPError('https://api.openai.com/v1/responses',503,'Unavailable',{'x-request-id':'req_broken_body'},InterruptedErrorBody()),503,'http_error')]
        for upstream,status,category in cases:
            with self.subTest(status=status),patch('ornithopter_eval.api.get_api_key',return_value='fixture-key'):
                options={'side_effect':upstream} if isinstance(upstream,BaseException) else {'return_value':upstream}
                with patch('ornithopter_eval.api.urllib.request.urlopen',**options):
                    with self.assertRaises(APIError) as caught:create_response({'model':'fixture'})
                self.assertEqual(caught.exception.diagnostics['http_status'],status)
                self.assertEqual(caught.exception.diagnostics['category'],category)
                self.assertNotIn('PRIVATE CONTENT',str(caught.exception)+json.dumps(caught.exception.diagnostics))
                if status==503:self.assertEqual(caught.exception.diagnostics['error_body_read_error']['causes'][0]['type'],'IncompleteRead')


class LocalKeyTests(unittest.TestCase):
    def test_reads_only_key_from_local_config_without_execution(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);module=root/"ornithopter_eval/api.py"
            (root/".env").write_text("IGNORED=$(touch do-not-execute)\nOPENAI_API_KEY='offline-fixture-key'\n")
            with patch("ornithopter_eval.api.__file__",str(module)),patch.dict(os.environ,{},clear=True):
                self.assertEqual(get_api_key(),"offline-fixture-key")
            self.assertFalse((root/"do-not-execute").exists())

    def test_environment_takes_precedence(self):
        with patch.dict(os.environ,{"OPENAI_API_KEY":"offline-environment-key"}):
            self.assertEqual(get_api_key(),"offline-environment-key")
