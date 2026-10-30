import io
import json
import os
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch

from ornithopter_eval.api import APIError, create_response, get_api_key


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
