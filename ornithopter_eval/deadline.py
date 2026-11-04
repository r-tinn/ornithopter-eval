"""A killable API transport worker; evaluated submissions never execute here."""
import json
import multiprocessing
import tempfile
import time
from pathlib import Path

from .api import APIError


class DeadlineExceeded(TimeoutError):
    pass


def _worker(transport, payload, timeout, destination):
    try:
        result = {'response': transport(payload, timeout=timeout)}
    except APIError as exc:
        result = {'error': str(exc)}
    except Exception as exc:
        result = {'error': 'Transport worker failed (' + type(exc).__name__ + ')'}
    Path(destination).write_text(json.dumps(result))


def call_before_deadline(transport, payload, timeout):
    if timeout <= 0:
        raise DeadlineExceeded('Generation deadline reached')
    end = time.monotonic() + timeout
    # A file avoids blocking the parent on a partly transmitted large pipe frame.
    with tempfile.TemporaryDirectory(prefix='ornithopter-api-deadline-') as directory:
        target = Path(directory) / 'result.json'
        process = multiprocessing.get_context('spawn').Process(
            target=_worker, args=(transport, payload, timeout, str(target)))
        process.start()
        try:
            process.join(max(0, end - time.monotonic()))
            if process.is_alive() or time.monotonic() >= end:
                raise DeadlineExceeded('Generation deadline reached during API request')
            if not target.is_file():
                raise APIError('Transport worker exited without a result')
            result = json.loads(target.read_text())
            if 'error' in result:
                raise APIError(result['error'])
            return result['response']
        finally:
            if process.is_alive():
                process.terminate()
                process.join(.2)
                if process.is_alive():
                    process.kill()
                    process.join()
            process.close()
