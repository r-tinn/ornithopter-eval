import copy
import hashlib
import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout, redirect_stderr
from pathlib import Path
from unittest.mock import patch

from ornithopter_eval.api import APIError
from ornithopter_eval.protocol import load_config
from ornithopter_eval.rollout import audit_rollout
from ornithopter_eval.runner import ROOT, prepare, run_model


def response(output, tokens=1, status='completed'):
    return {'status': status, 'output': output,
            'usage': {'input_tokens': 10, 'output_tokens': tokens,
                      'output_tokens_details': {'reasoning_tokens': tokens // 2}}}


class RolloutTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def run_calls(self, commands):
        run = prepare(self.root / 'attempt')
        outputs = iter([response([{'type': 'shell_call', 'call_id': 'read', 'action': {'commands': commands}}]),
                        response([])])
        result = run_model(run, 'offline-fixture', lambda *a, **kw: next(outputs))
        self.assertEqual(result['status'], 'submitted')
        return run, audit_rollout(run)

    def test_targeted_reads_and_ordinary_missing_file_are_allowed(self):
        run, review = self.run_calls(['ls submission', 'cat inputs/TASK.md', 'head -n 1 submission/missing.js'])
        self.assertIs(review['pass'], True)
        self.assertTrue((run / 'rollout-review.json').exists())

    def test_execution_and_hidden_execution_requests_fail_even_when_blocked(self):
        for index, command in enumerate(['npm test', 'node --check submission/physics.mjs',
                                         'python3 -c 1', 'cat inputs/TASK.md | bash',
                                         'curl http://127.0.0.1:8768/', '$(node submission/physics.mjs)']):
            with self.subTest(command=command):
                run = prepare(self.root / str(index))
                outputs = iter([response([{'type': 'shell_call', 'call_id': 'try', 'action': {'commands': [command]}}]), response([])])
                run_model(run, 'offline-fixture', lambda *a, **kw: next(outputs))
                review = audit_rollout(run)
                self.assertIs(review['pass'], False)
                self.assertEqual(review['violations'][0]['command'], command)
                event = next(x for x in map(json.loads, (run / 'events.jsonl').read_text().splitlines()) if x['event'] == 'tool_result')
                self.assertEqual(event['result']['output'][0]['outcome']['exit_code'], 1)

    def test_patch_failure_and_thought_or_written_analysis_are_not_verification_tools(self):
        run = prepare(self.root / 'patch')
        outputs = iter([response([
            {'type': 'reasoning', 'encrypted_content': 'opaque npm test text is not executable evidence'},
            {'type': 'apply_patch_call', 'call_id': 'p', 'operation':
             {'type': 'update_file', 'path': 'submission/physics.mjs', 'diff': '@@\n-absent-context\n+new'}}]),
            response([{'type': 'message', 'content': [{'type': 'output_text', 'text': 'Analysis mode includes an energy check.'}]}])])
        run_model(run, 'offline-fixture', lambda *a, **kw: next(outputs))
        self.assertIs(audit_rollout(run)['pass'], True)

    def test_missing_truncated_or_repaired_but_inconsistent_trace_never_passes(self):
        run, _ = self.run_calls(['ls submission'])
        trace = run / 'events.jsonl'
        original = trace.read_text()
        trace.write_text(original[:-4])
        self.assertIsNone(audit_rollout(run)['pass'])
        events = [json.loads(line) for line in original.splitlines()]
        events = [e for e in events if e['event'] != 'tool_result']
        trace.write_text(''.join(json.dumps(e) + '\n' for e in events))
        manifest = json.loads((run / 'manifest.json').read_text())
        manifest['events_sha256'] = hashlib.sha256(trace.read_bytes()).hexdigest()
        (run / 'manifest.json').write_text(json.dumps(manifest))
        self.assertIsNone(audit_rollout(run)['pass'])
        trace.unlink()
        self.assertIsNone(audit_rollout(run)['pass'])

    def test_transport_failure_is_unavailable_not_a_model_compliance_score(self):
        run = prepare(self.root / 'transport')
        def fail(*a, **kw):
            raise APIError('offline fixture failure')
        run_model(run, 'offline-fixture', fail)
        self.assertIsNone(audit_rollout(run)['pass'])

    def test_unsupported_tool_is_a_protocol_failure_not_infrastructure(self):
        run = prepare(self.root / 'unsupported')
        result = run_model(run, 'offline-fixture', lambda *a, **kw: response([
            {'type': 'computer_call', 'call_id': 'browser', 'action': {'type': 'screenshot'}}]))
        self.assertEqual(result['status'], 'protocol_violation')
        review = audit_rollout(run)
        self.assertIs(review['pass'], False)
        self.assertEqual(review['violations'][0]['tool'], 'computer_call')

    def test_completed_patches_and_unfinished_calls_at_token_cutoff_are_distinguished(self):
        run = prepare(self.root / 'cutoff')
        output = [{'type': 'apply_patch_call', 'call_id': 'p', 'status': 'completed', 'operation':
                   {'type': 'create_file', 'path': 'submission/complete.js', 'diff': '+const complete=true;'}},
                  {'type': 'apply_patch_call', 'call_id': 'partial', 'status': 'in_progress', 'operation':
                   {'type': 'create_file', 'path': 'submission/partial.js', 'diff': '+const x='}}]
        run_model(run, 'offline-fixture', lambda *a, **kw: response(output, status='incomplete'))
        self.assertTrue((run / 'submission/complete.js').exists())
        self.assertFalse((run / 'submission/partial.js').exists())
        self.assertIs(audit_rollout(run)['pass'], True)

    def test_timed_out_response_can_have_explicitly_undispatched_file_calls(self):
        run = prepare(self.root / 'timed-out')
        output = [{'type': 'shell_call', 'call_id': 'read', 'action': {'commands': ['ls submission']}}]
        with patch('ornithopter_eval.runner.time.monotonic', side_effect=[0, 0, 901, 902]):
            result = run_model(run, 'offline-fixture', lambda *a, **kw: response(output))
        self.assertEqual(result['reason'], 'wall_time_limit')
        self.assertIs(audit_rollout(run)['pass'], True)

    def test_profile_enforces_20k_and_two_notices_without_rewriting_old_config(self):
        config = ROOT / 'configs/mechanical-v5-smoke.json'
        before = config.read_bytes()
        run = prepare(self.root / 'profile', config, generation_profile=ROOT / 'configs/source-first-budget.json')
        sent = []
        def transport(payload, **kwargs):
            sent.append(copy.deepcopy(payload))
            calls = [{'type': 'shell_call', 'call_id': str(len(sent)), 'action': {'commands': ['ls submission']}}] if len(sent) < 3 else []
            return response(calls, tokens=[10000, 5000, 5000][len(sent)-1], status='completed' if calls else 'incomplete')
        result = run_model(run, 'offline-fixture', transport)
        self.assertEqual([p['max_output_tokens'] for p in sent], [20000, 10000, 5000])
        self.assertTrue(all(p['reasoning'] == {'effort': 'medium'} for p in sent))
        self.assertEqual(result['usage']['output_tokens'], 20000)
        self.assertEqual(result['output_token_notice_percentages_sent'], [50, 75])
        self.assertEqual(result['config']['generation_profile']['id'], 'source-first-constrained-v1')
        self.assertEqual(config.read_bytes(), before)
        self.assertEqual(json.loads(before)['max_output_tokens_total'], 32000)
        self.assertIs(audit_rollout(run)['pass'], True)

    def test_profile_cannot_change_task_and_cli_preserves_reviews(self):
        profile = json.loads((ROOT / 'configs/source-first-budget.json').read_text())
        profile['task_version'] = 'pretend-new-task'
        target = self.root / 'bad-profile.json'
        target.write_text(json.dumps(profile))
        with self.assertRaisesRegex(ValueError, 'only the declared budget'):
            load_config(ROOT / 'configs/mechanical-v5-smoke.json', target)
        from ornithopter_eval.__main__ import main
        with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            packet = self.root / 'cli'
            self.assertEqual(main(['prepare', str(packet), '--generation-profile', str(ROOT / 'configs/source-first-budget.json')]), 0)
            self.assertEqual(json.loads((packet / 'manifest.json').read_text())['config']['max_output_tokens_total'], 20000)
            run_model(packet, 'offline-fixture', lambda *a, **kw: response([]))
            output = self.root / 'review.json'
            self.assertEqual(main(['audit-rollout', str(packet), '--output', str(output)]), 0)
            before = output.read_bytes()
            self.assertEqual(main(['audit-rollout', str(packet), '--output', str(output)]), 1)
            self.assertEqual(output.read_bytes(), before)


if __name__ == '__main__':
    unittest.main()
