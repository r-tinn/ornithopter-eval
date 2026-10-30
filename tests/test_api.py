import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from ornithopter_eval.api import get_api_key


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
