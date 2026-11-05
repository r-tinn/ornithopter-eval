"""A killable API transport worker; evaluated submissions never execute here."""
import json
import multiprocessing
import tempfile
import time
from pathlib import Path

from .api import APIError
from .diagnostics import load_snapshot, save_snapshot, utc_now


class DeadlineExceeded(TimeoutError):
    def __init__(self, message='Generation deadline reached', diagnostics=None):
        super().__init__(message)
        self.diagnostics = diagnostics


def _worker(transport, payload, timeout, destination, diagnostics, diagnostic_path):
    try:
        options = {'diagnostics': diagnostics, 'diagnostic_path': diagnostic_path} if diagnostics is not None else {}
        result = {'response': transport(payload, timeout=timeout, **options), 'diagnostics': diagnostics}
    except APIError as exc:
        result = {'error': str(exc), 'diagnostics': exc.diagnostics or diagnostics}
    except Exception as exc:
        if diagnostics is not None:
            diagnostics.update(status='failed', category='worker_error', exception_type=type(exc).__name__)
        result = {'error': 'Transport worker failed (' + type(exc).__name__ + ')', 'diagnostics':diagnostics}
    Path(destination).write_text(json.dumps(result))


def call_before_deadline(transport, payload, timeout, *, diagnostics=None, diagnostic_path=None):
    if timeout <= 0:
        raise DeadlineExceeded('Generation deadline reached')
    started = time.monotonic()
    end = started + timeout
    interrupted = False
    save_snapshot(diagnostic_path, diagnostics)
    # A file avoids blocking the parent on a partly transmitted large pipe frame.
    with tempfile.TemporaryDirectory(prefix='ornithopter-api-deadline-') as directory:
        target = Path(directory) / 'result.json'
        process = multiprocessing.get_context('spawn').Process(
            target=_worker, args=(transport, payload, timeout, str(target), diagnostics, diagnostic_path))
        process.start()
        try:
            process.join(max(0, end - time.monotonic()))
            if process.is_alive() or time.monotonic() >= end:
                interrupted = True
                raise DeadlineExceeded('Generation deadline reached during API request', diagnostics)
            if not target.is_file():
                raise APIError('Transport worker exited without a result')
            result = json.loads(target.read_text())
            if diagnostics is not None:
                diagnostics.update(result.get('diagnostics') or {})
            if 'error' in result:
                raise APIError(result['error'], diagnostics or result.get('diagnostics'))
            return result['response']
        finally:
            if process.is_alive():
                process.terminate()
                process.join(.2)
                if process.is_alive():
                    process.kill()
                    process.join()
            exit_code = process.exitcode
            process.close()
            if diagnostics is not None:
                # The child is stopped before the parent reads/updates its last atomic snapshot.
                if interrupted:
                    diagnostics.update(load_snapshot(diagnostic_path, diagnostics))
                    diagnostics.update(status='deadline_exceeded', category='generation_deadline',
                                       usage_unknown=True, finished_utc=utc_now())
                elif diagnostics['status'] == 'pending':
                    diagnostics.update(status='failed', category='worker_error', finished_utc=utc_now())
                diagnostics['elapsed_seconds'] = round(time.monotonic()-started, 6)
                diagnostics['worker_exit_code'] = exit_code
                save_snapshot(diagnostic_path, diagnostics)
