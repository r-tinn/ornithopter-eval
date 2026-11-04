import copy
import json
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from ornithopter_eval.deadline import DeadlineExceeded, call_before_deadline
from ornithopter_eval.protocol import load_config
from ornithopter_eval.rollout import audit_rollout
from ornithopter_eval.runner import ROOT, execute_call, initial_input, prepare, run_model


def fast_transport(payload, **kwargs):
    return {'status': 'completed', 'output': [], 'usage': {'input_tokens': 1, 'output_tokens': 2}}


def stalled_transport(payload, **kwargs):
    time.sleep(10)
    return fast_transport(payload)


class TimingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def prepare(self):
        return prepare(self.root / 'attempt', generation_profile=ROOT / 'configs/source-first-time.json')

    def test_time_only_omits_output_cap_and_warns_at_two_boundaries(self):
        run = self.prepare()
        now, sent = [0], []
        def transport(payload, **kwargs):
            sent.append(copy.deepcopy(payload))
            now[0] += [121, 60, 1][len(sent)-1]
            result = fast_transport(payload)
            result['usage']['output_tokens'] = 50000
            if len(sent) < 3:
                result['output'] = [{'type': 'shell_call', 'call_id': str(len(sent)),
                                     'action': {'commands': ['ls submission']}}]
            return result
        result = run_model(run, 'offline-fixture', transport, clock=lambda: now[0])
        self.assertEqual(result['status'], 'submitted')
        self.assertEqual(result['usage']['output_tokens'], 150000)
        self.assertTrue(all('max_output_tokens' not in p for p in sent))
        self.assertTrue(all(p['reasoning'] == {'effort': 'medium'} for p in sent))
        events = [json.loads(line) for line in (run / 'events.jsonl').read_text().splitlines()]
        notices = [e for e in events if e['event'] == 'budget_notice']
        self.assertEqual([e['percentages'] for e in notices], [[50], [75]])
        self.assertEqual([e['remaining_seconds'] for e in notices], [119, 59])
        self.assertEqual(result['time_notice_percentages_sent'], [50, 75])
        self.assertEqual(result['output_token_notice_percentages_sent'], [])
        self.assertIs(audit_rollout(run)['pass'], True)
        text = initial_input(run)[0]['content'][0]['text']
        self.assertIn('no benchmark output-token or request-count limit', text)
        self.assertIn('aesthetic realism', text)
        self.assertIn('inputs/DESIGN_BRIEF.md', result['input_sha256'])

    def test_no_extra_request_for_warnings_after_final_or_expired_response(self):
        for elapsed in (181, 241):
            with self.subTest(elapsed=elapsed):
                run = prepare(self.root / str(elapsed), generation_profile=ROOT / 'configs/source-first-time.json')
                now = [0]
                def transport(*a, **kw):
                    now[0] = elapsed
                    result = fast_transport({})
                    result['output'] = [] if elapsed < 240 else [{'type': 'shell_call', 'call_id': 'late', 'action': {'commands': ['ls submission']}}]
                    return result
                result = run_model(run, 'offline-fixture', transport, clock=lambda: now[0])
                self.assertEqual(result['usage']['requests'], 1)
                self.assertEqual(result['time_notice_percentages_sent'], [])
                self.assertEqual(result['reason'], None if elapsed < 240 else 'wall_time_limit')
                self.assertIs(audit_rollout(run)['pass'], True)

    def test_interrupted_request_is_explicit_and_usage_is_unknown(self):
        run = self.prepare()
        with patch('ornithopter_eval.runner.call_before_deadline', side_effect=DeadlineExceeded()):
            result = run_model(run, 'offline-fixture')
        self.assertEqual(result['status'], 'budget_exhausted')
        self.assertEqual(result['reason'], 'wall_time_limit')
        self.assertEqual(result['usage']['interrupted_requests'], 1)
        self.assertIn('unknown', result['usage_scope'])
        self.assertIs(audit_rollout(run)['pass'], True)

    def test_edit_finishing_after_deadline_is_rolled_back(self):
        run = self.prepare()
        now = [0]
        call = {'type': 'apply_patch_call', 'call_id': 'edit', 'operation':
                {'type': 'create_file', 'path': 'submission/late.js', 'diff': '+const late=true;'}}
        def edit(policy, item):
            result = execute_call(policy, item)
            now[0] = 241
            return result
        def transport(*a, **kw):
            result = fast_transport({})
            result['output'] = [call]
            return result
        with patch('ornithopter_eval.runner.execute_call', side_effect=edit):
            result = run_model(run, 'offline-fixture', transport, clock=lambda: now[0])
        self.assertFalse((run / 'submission/late.js').exists())
        self.assertEqual(result['reason'], 'wall_time_limit')
        self.assertIn('late edit discarded', (run / 'events.jsonl').read_text())
        self.assertIs(audit_rollout(run)['pass'], True)

    def test_worker_returns_completed_response_and_terminates_stalled_request(self):
        self.assertEqual(call_before_deadline(fast_transport, {}, 3)['status'], 'completed')
        started = time.monotonic()
        with self.assertRaises(DeadlineExceeded):
            call_before_deadline(stalled_transport, {}, .35)
        self.assertLess(time.monotonic() - started, 2)

    def test_timed_cli_config_matches_profile_and_legacy_profile_can_be_explicit(self):
        active = json.loads((ROOT / 'configs/mechanical-v5-timed.json').read_text())
        overlaid = load_config(ROOT / 'configs/mechanical-v5-smoke.json', ROOT / 'configs/source-first-time.json')
        overlaid.pop('generation_profile')
        self.assertEqual(active, overlaid)
        legacy = load_config(ROOT / 'configs/mechanical-v5-timed.json', ROOT / 'configs/source-first-budget.json')
        self.assertNotIn('budget_mode', legacy)
        self.assertNotIn('time_notice_percentages', legacy)
        self.assertEqual(legacy['max_output_tokens_total'], 20000)


if __name__ == '__main__':
    unittest.main()
