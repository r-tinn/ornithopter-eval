import http.server
import json
from pathlib import Path
import tempfile
import threading
import unittest
import urllib.error
import urllib.request

from ornithopter_eval.captures import MAX_CAPTURE_BYTES
from ornithopter_eval.experiment import ArtifactServer


class CaptureTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name).resolve();self.artifacts=self.root/'artifacts';self.artifacts.mkdir()
        (self.artifacts/'index.html').write_text('<h1>Offline capture test</h1>')
        self.server=http.server.ThreadingHTTPServer(('127.0.0.1',0),ArtifactServer)
        self.server.artifact_root=self.artifacts;self.server.capture_directory=self.root/'captures'
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
        self.addCleanup(self.close)
        self.base='http://127.0.0.1:'+str(self.server.server_port)

    def close(self):
        self.server.shutdown();self.server.server_close();self.thread.join()

    def post(self,data=None,headers=None):
        return urllib.request.urlopen(urllib.request.Request(self.base+'/__captures',
            data if data is not None else b'\x00\x00\x00\x18ftypisom00000000',
            {'Content-Type':'video/mp4','Origin':self.base,'X-Flight-Trial':'gpt-6.1-sol-01',**(headers or {})}),timeout=5)

    def test_local_clip_persists_without_changing_artifacts_and_has_http_download(self):
        before=(self.artifacts/'index.html').read_bytes()
        with self.post() as response:
            self.assertEqual(response.status,201);saved=json.load(response)
        path=Path(saved['saved_path']);self.assertEqual(path.parent,self.server.capture_directory)
        self.assertTrue(path.is_file());self.assertNotIn('..',path.name)
        with urllib.request.urlopen(self.base+saved['download_href']) as response:
            self.assertIn('attachment;',response.headers['Content-Disposition'])
            self.assertEqual(response.read(),path.read_bytes())
        with urllib.request.urlopen(self.base+'/__captures/index.json') as response:
            records=json.load(response)
        self.assertEqual(records[0]['trial'],'gpt-6.1-sol-01')
        with urllib.request.urlopen(self.base+'/__captures/index.html') as response:
            self.assertIn(saved['filename'],response.read().decode())
        self.assertEqual((self.artifacts/'index.html').read_bytes(),before)
        self.assertEqual(list(self.artifacts.iterdir()),[self.artifacts/'index.html'])

    def test_wrong_origin_traversal_bad_media_and_oversized_body_are_rejected(self):
        cases=[({'Origin':'http://example.com'},None,403),
               ({'X-Flight-Trial':'../outside'},None,400),
               ({'Content-Type':'text/html'},b'<script>bad()</script>',400),
               ({},b'not an mp4',400),
               ({'Content-Length':str(MAX_CAPTURE_BYTES+1)},None,413)]
        for headers,data,status in cases:
            with self.subTest(headers=headers),self.assertRaises(urllib.error.HTTPError) as error:
                self.post(data,headers)
            self.assertEqual(error.exception.code,status);error.exception.close()
        self.assertFalse(self.server.capture_directory.exists())

    def test_png_save_and_explicit_user_visible_media_policy(self):
        with self.post(b'\x89PNG\r\n\x1a\n' + b'offline-test',{'Content-Type':'image/png'}) as response:
            saved=json.load(response)
        self.assertTrue(saved['filename'].endswith('.png'))
        with urllib.request.urlopen(self.base+'/index.html') as response:
            policy=response.headers['Content-Security-Policy']
        self.assertIn("connect-src 'self'",policy)
        self.assertIn("media-src 'self' blob:",policy)
        with self.assertRaises(urllib.error.HTTPError) as error:
            urllib.request.urlopen(self.base+'/__captures/not-a-clip.json')
        self.assertEqual(error.exception.code,404);error.exception.close()
