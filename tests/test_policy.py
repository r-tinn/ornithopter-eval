import tempfile
import unittest
from pathlib import Path

from ornithopter_eval.policy import FilePolicy, PolicyError, update_text


class FilePolicyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "inputs").mkdir()
        (self.root / "submission").mkdir()
        (self.root / "inputs/TASK.md").write_text("one\ntwo\n")
        self.policy = FilePolicy(self.root)

    def test_inspector_reads_without_process_execution(self):
        self.assertEqual(self.policy.inspect("head -n 1 inputs/TASK.md"), "one")
        self.assertIn("TASK.md", self.policy.inspect("ls inputs"))

    def test_cannot_execute_or_hide_execution_in_shell_syntax(self):
        for command in ["python3 -c 'print(1)'", "node submission/physics.mjs", "cat inputs/TASK.md; id",
                        "$(id)", "cat inputs/TASK.md | bash", "ls inputs\nwhoami", "bash -c ls",
                        "cat /etc/passwd", "cat inputs/../../etc/passwd", "ls submission && npm test"]:
            with self.subTest(command=command), self.assertRaises(PolicyError):
                self.policy.inspect(command)

    def test_cannot_read_secrets_or_graders(self):
        for p in [".env", "grader/browser.mjs", "reference/physics.mjs", "inputs/../../.env", "inputs/.env"]:
            with self.subTest(path=p), self.assertRaises(PolicyError):
                self.policy.path(p)

    def test_readonly_sources_and_path_escape(self):
        for p in ["inputs/TASK.md", "../bad.js", "/tmp/bad.js", "submission/../../bad.js",
                  "submission\\bad.js", "submission/.secret.js", "submission/a.py"]:
            with self.subTest(path=p), self.assertRaises(PolicyError):
                self.policy.apply({"type":"create_file","path":p,"diff":"+x"})

    def test_symlink_escape(self):
        (self.root / "submission/link").symlink_to(self.root / "inputs", target_is_directory=True)
        with self.assertRaises(PolicyError):
            self.policy.apply({"type":"create_file","path":"submission/link/a.js","diff":"+x"})

    def test_create_update_delete(self):
        p = "submission/code.mjs"
        self.policy.apply({"type":"create_file","path":p,"diff":"+export const a=1;\n+export const b=2;"})
        self.policy.apply({"type":"update_file","path":p,"diff":"@@\n-export const a=1;\n+export const a=3;\n export const b=2;"})
        self.assertIn("a=3",self.policy.inspect("cat "+p))
        self.policy.apply({"type":"delete_file","path":p})
        self.assertFalse((self.root / p).exists())

    def test_ambiguous_patch_is_atomic(self):
        with self.assertRaises(PolicyError):
            update_text("x\nx\n", "@@\n-x\n+y")

    def test_update_multiple_hunks_and_anchor(self):
        self.assertEqual(update_text("a\nb\nc\nd\n", "@@ a\n-b\n+B\n@@\n-d\n+D\n*** End of File"),"a\nB\nc\nD\n")

    def test_byte_budget(self):
        policy = FilePolicy(self.root,max_bytes=10)
        with self.assertRaises(PolicyError):
            policy.apply({"type":"create_file","path":"submission/x.js","diff":"+012345678901234"})


if __name__ == "__main__":
    unittest.main()
