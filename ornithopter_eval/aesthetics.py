"""Human-only, append-only ratings, served on a separate origin from submissions."""
import hashlib
import html
import http.server
import json
import re
import secrets
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote, urlsplit

RUBRIC = [
    'Rough and unconvincing: incoherent shape, construction or movement.',
    'Recognisable but crude: weak proportions, materials or mechanical clarity.',
    'Believable engineered aircraft, with clear visual shortcomings.',
    'Convincing, source-faithful and polished: coherent construction and motion.',
    'Exceptional realism and coherence: compelling, source-faithful mechanical design.',
]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


class AestheticStore:
    def __init__(self, root, ledger, artifact_url, camera_updates=True):
        self.root = Path(root).resolve()
        self.ledger = Path(ledger)
        self.artifact_url = artifact_url.rstrip('/')
        self.camera_updates = camera_updates
        self.playback_provenance = None
        if camera_updates:
            from .playback import CameraPlayback
            self.playback_provenance = getattr(CameraPlayback(self.root), 'provenance', None)
        self.lock = threading.Lock()
        experiment = json.loads((self.root / 'experiment.json').read_text())
        identity = {key: experiment.get(key) for key in ('created_utc', 'git_commit', 'task_version', 'models')}
        self.cohort_id = hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()
        self.task_version = experiment['task_version']
        self.trials = {}
        for trial in experiment['trials']:
            name = trial['id']
            if not re.fullmatch(r'[a-z0-9][a-z0-9._-]{0,120}', name):
                raise ValueError('Unsafe trial ID')
            if name in self.trials:
                raise ValueError('Duplicate trial ID')
            self.trials[name] = trial

    def evidence(self, name):
        if name not in self.trials:
            raise ValueError('Unknown trial')
        trial = self.root / 'trials' / name
        if any(p.is_symlink() for p in (trial, trial.parent, trial / 'manifest.json')):
            raise ValueError('Symlinked trial is not reviewable')
        manifest = json.loads((trial / 'manifest.json').read_text())
        if manifest.get('reference_fixture') or manifest.get('not_a_model_submission'):
            raise ValueError('A reference fixture is not a model result')
        if manifest.get('status') not in ('submitted', 'budget_exhausted'):
            raise ValueError('Only finished model submissions can be rated')
        expected = manifest.get('submission_sha256')
        if not isinstance(expected, dict) or not expected:
            raise ValueError('Missing submission hashes')
        submission = trial / 'submission'
        paths = list(submission.rglob('*'))
        if submission.is_symlink() or any(p.is_symlink() for p in paths):
            raise ValueError('Symlinked submission is not reviewable')
        actual = {str(p.relative_to(submission)): sha(p) for p in sorted(paths) if p.is_file()}
        if actual != expected:
            raise ValueError('Submission changed since the recorded attempt')
        digest = hashlib.sha256(json.dumps(actual, sort_keys=True).encode()).hexdigest()
        return manifest, digest

    def records(self):
        if not self.ledger.exists():
            return []
        # A damaged ledger must be repaired explicitly; never hide broken history.
        records = [json.loads(line) for line in self.ledger.read_text().splitlines()]
        if any(row.get('cohort_id') != self.cohort_id for row in records):
            raise ValueError('Ledger belongs to another cohort')
        return records

    def snapshot(self):
        with self.lock:
            records = self.records()
        trials = []
        for name, trial in self.trials.items():
            try:
                manifest, submission_digest = self.evidence(name)
                error = None
            except (ValueError, OSError, KeyError) as exc:
                manifest, submission_digest, error = {}, None, str(exc)
            history = [r for r in records if r['trial_id'] == name]
            trials.append({'id': name, 'model': trial.get('model', name), 'error': error,
                           'submission_digest': submission_digest, 'history': history,
                           'latest': history[-1] if history else None,
                           'simulator_url': self.artifact_url + '/trials/' + name + '/submission/index.html' +
                           ('' if self.camera_updates else '?original=1'),
                           'evidence_url': self.artifact_url + '/trials/' + name + '/evidence.html',
                           'source_images': [{'name': Path(path).name, 'url': self.artifact_url + '/trials/' + name + '/' + quote(path)}
                                             for path in manifest.get('input_sha256', {})
                                             if path.startswith('inputs/sources/') and Path(path).suffix.lower() in ('.jpg', '.png')],
                           'sources_url': self.artifact_url + '/trials/' + name + '/inputs/SOURCE_GUIDE.md'})
        return {'grader': 'aesthetic_realism', 'rubric_version': 'human-aesthetic-v1', 'rubric': RUBRIC,
                'cohort_id': self.cohort_id, 'task_version': self.task_version,
                'interactive_playback': self.playback_provenance,
                'trials': trials, 'records': records}

    def save(self, data):
        if (type(data.get('score')) is not int or not 1 <= data['score'] <= 5
                or data.get('played') is not True):
            raise ValueError('Choose 1–5 and confirm you have flown this submission')
        reviewer, notes = data.get('reviewer'), data.get('notes', '')
        if not isinstance(reviewer, str) or not reviewer.strip() or len(reviewer) > 80:
            raise ValueError('Reviewer must be 1–80 characters')
        if not isinstance(notes, str) or len(notes) > 2000:
            raise ValueError('Notes must be at most 2,000 characters')
        name = data.get('trial_id')
        if not isinstance(name, str):
            raise ValueError('Choose a trial')
        with self.lock:
            manifest, submission_digest = self.evidence(name)
            if data.get('submission_digest') != submission_digest:
                raise ValueError('Submission identity changed; reload before rating')
            history = self.records()
            row = {'id': str(uuid.uuid4()), 'grader': 'aesthetic_realism',
                   'rubric_version': 'human-aesthetic-v1', 'cohort_id': self.cohort_id,
                   'trial_id': name, 'model': manifest.get('model'), 'task_version': manifest['task_version'],
                   'score': data['score'], 'reviewer': reviewer.strip(), 'notes': notes, 'played': True,
                   'created_utc': datetime.now(timezone.utc).isoformat(),
                   'submission_digest': submission_digest, 'submission_sha256': manifest['submission_sha256'],
                   'camera_mode': 'updated viewer where supported' if self.camera_updates else 'original',
                   'interactive_playback': self.playback_provenance,
                   'revision': 1 + sum(r['trial_id'] == name for r in history)}
            self.ledger.parent.mkdir(parents=True, exist_ok=True)
            with self.ledger.open('a') as stream:
                stream.write(json.dumps(row, ensure_ascii=False, allow_nan=False) + '\n')
            return row


class AestheticHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def reply(self, status, body, content_type='application/json', nonce=None):
        self.send_response(status)
        self.send_header('Content-Type', content_type + '; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Security-Policy', "default-src 'none'; script-src 'nonce-" + (nonce or '') +
                         "'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.headers.get('Host') != urlsplit(self.server.origin).netloc:
            self.reply(403, b'{"error":"Invalid host"}'); return
        try:
            path = urlsplit(self.path).path
            if path == '/api/reviews':
                self.reply(200, json.dumps(self.server.store.snapshot()).encode())
            elif path == '/':
                nonce = secrets.token_urlsafe(24)
                data = {'csrf': self.server.csrf, 'data': self.server.store.snapshot()}
                payload = json.dumps(data).replace('<', '\\u003c')
                page = (Path(__file__).with_name('aesthetic_ui.html').read_text()
                        .replace('__NONCE__', html.escape(nonce, quote=True)).replace('__BOOTSTRAP__', payload))
                self.reply(200, page.encode(), 'text/html', nonce)
            else:
                self.reply(404, b'{"error":"Not found"}')
        except (ValueError, OSError, KeyError) as exc:
            self.reply(409, json.dumps({'error': str(exc)}).encode())

    def do_POST(self):
        # Submissions run on a different origin and cannot read this token.
        if (self.headers.get('Host') != urlsplit(self.server.origin).netloc
                or self.headers.get('Origin') != self.server.origin
                or self.headers.get('X-Review-Token') != self.server.csrf):
            self.reply(403, b'{"error":"Use the local human-review page"}'); return
        if urlsplit(self.path).path != '/api/reviews':
            self.reply(404, b'{"error":"Not found"}'); return
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 16000 or self.headers.get_content_type() != 'application/json':
                raise ValueError('Expected a small JSON review')
            data = json.loads(self.rfile.read(size))
            if not isinstance(data, dict):
                raise ValueError('Expected a review object')
            self.reply(201, json.dumps(self.server.store.save(data)).encode())
        except (ValueError, OSError, KeyError) as exc:
            self.reply(400, json.dumps({'error': str(exc)}).encode())


def review_server(root, artifact_url, camera_updates=True, ledger=None):
    root = Path(root).resolve()
    if ledger is None:
        identity = AestheticStore(root, Path('/unused'), artifact_url, camera_updates).cohort_id
        ledger = Path(__file__).resolve().parents[1] / 'reviews/aesthetics' / (identity + '.jsonl')
    store = AestheticStore(root, ledger, artifact_url, camera_updates)
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), AestheticHandler)
    server.store, server.csrf = store, secrets.token_urlsafe(32)
    server.origin = f'http://127.0.0.1:{server.server_port}'
    return server
