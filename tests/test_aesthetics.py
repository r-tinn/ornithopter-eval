import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path

from ornithopter_eval.aesthetics import AestheticStore, review_server, sha


def fixture(root):
    trial = root / 'trials/offline-model-01'
    submission = trial / 'submission'
    submission.mkdir(parents=True)
    (submission / 'index.html').write_text('<h1>Offline UI fixture, not a model result</h1>')
    manifest = {'task_version': 'offline-ui-fixture', 'status': 'submitted', 'model': 'offline-model',
                'submission_sha256': {'index.html': sha(submission / 'index.html')}}
    (trial / 'manifest.json').write_text(json.dumps(manifest))
    (root / 'experiment.json').write_text(json.dumps({'created_utc': 'offline-fixture',
        'task_version': 'offline-ui-fixture', 'models': ['offline-model'],
        'trials': [{'id': 'offline-model-01', 'model': 'offline-model', 'status': 'submitted'}]}))
    return trial


class AestheticTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'cohort'
        self.trial = fixture(self.root)
        self.ledger = Path(self.temp.name) / 'ratings.jsonl'
        self.store = AestheticStore(self.root, self.ledger, 'http://127.0.0.1:9000')

    def review(self):
        return {'score': 4, 'played': True, 'reviewer': 'Offline tester', 'notes': 'Fixture only',
                'trial_id': 'offline-model-01', 'submission_digest': self.store.snapshot()['trials'][0]['submission_digest']}

    def test_revisions_survive_restart_without_changing_any_artifact(self):
        hashes = {str(p.relative_to(self.root)): sha(p) for p in self.root.rglob('*') if p.is_file()}
        self.assertIsNone(self.store.snapshot()['trials'][0]['latest'])
        self.store.save(self.review())
        second = self.review(); second['score'] = 2
        self.store.save(second)
        reloaded = AestheticStore(self.root, self.ledger, 'http://127.0.0.1:9000').snapshot()
        self.assertEqual([r['score'] for r in reloaded['records']], [4, 2])
        self.assertEqual(reloaded['trials'][0]['latest']['revision'], 2)
        self.assertEqual(hashes, {str(p.relative_to(self.root)): sha(p) for p in self.root.rglob('*') if p.is_file()})

    def test_invalid_rating_missing_flight_changed_bytes_and_reference_are_rejected(self):
        for changes in ({'score': True}, {'score': 0}, {'score': 6}, {'played': False}, {'reviewer': ''},
                        {'notes': 'x'*2001}, {'trial_id': '../other'}, {'submission_digest': 'wrong'}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                self.store.save({**self.review(), **changes})
        review = self.review()
        (self.trial / 'submission/index.html').write_text('changed')
        with self.assertRaisesRegex(ValueError, 'changed'):
            self.store.save(review)
        manifest_path = self.trial / 'manifest.json'
        manifest = json.loads(manifest_path.read_text()); manifest['reference_fixture'] = True
        manifest_path.write_text(json.dumps(manifest))
        with self.assertRaisesRegex(ValueError, 'reference fixture'):
            self.store.save(review)
        self.assertFalse(self.ledger.exists())

    def test_corrupt_history_cannot_be_silently_overwritten(self):
        self.ledger.write_text('broken json\n')
        with self.assertRaises(ValueError):
            self.store.snapshot()

    def test_review_http_has_separate_origin_and_requires_its_own_token(self):
        server = review_server(self.root, 'http://127.0.0.1:9000', ledger=self.ledger)
        thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
        try:
            with urllib.request.urlopen(server.origin) as page:
                text = page.read().decode()
                self.assertIn('Aesthetic realism', text)
                self.assertIn("connect-src 'self'", page.headers['Content-Security-Policy'])
                self.assertNotIn('__BOOTSTRAP__', text)
            payload = json.dumps(self.review()).encode()
            for headers in ({}, {'Origin': 'http://127.0.0.1:9000', 'X-Review-Token': server.csrf}):
                request = urllib.request.Request(server.origin+'/api/reviews', payload,
                    {'Content-Type': 'application/json', **headers})
                with self.assertRaises(urllib.error.HTTPError) as error:
                    urllib.request.urlopen(request)
                self.assertEqual(error.exception.code, 403)
                error.exception.close()
            request = urllib.request.Request(server.origin+'/api/reviews', payload,
                {'Content-Type': 'application/json', 'Origin': server.origin, 'X-Review-Token': server.csrf})
            with urllib.request.urlopen(request) as result:
                self.assertEqual(result.status, 201)
            with urllib.request.urlopen(server.origin+'/api/reviews') as result:
                self.assertEqual(len(json.load(result)['records']), 1)
        finally:
            server.shutdown(); server.server_close(); thread.join()


if __name__ == '__main__':
    unittest.main()
