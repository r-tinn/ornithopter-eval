"""Offline UI smoke fixture only; never starts an API request or a real rating."""
import signal
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from test_aesthetics import fixture
from ornithopter_eval.experiment import serve_artifacts


def stop(*_):
    raise KeyboardInterrupt


if __name__ == '__main__':
    signal.signal(signal.SIGTERM, stop)
    with tempfile.TemporaryDirectory(prefix='aesthetic-ui-offline-') as directory:
        root = Path(directory) / 'cohort'
        fixture(root)
        (root / 'index.html').write_text('<!doctype html><html><body><h1>Offline UI fixture</h1></body></html>')
        try:
            serve_artifacts(root, port=0, camera_updates=False, review_ledger=Path(directory) / 'ratings.jsonl')
        except KeyboardInterrupt:
            pass
