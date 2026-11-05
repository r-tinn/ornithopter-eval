"""Small Responses API transport; standard library only, no implicit retries."""
import json
import http.client
import os
from pathlib import Path
import time
import urllib.error
import urllib.request

from .diagnostics import exception_details, new_request, response_headers, safe_text, save_snapshot, utc_now


class APIError(RuntimeError):
    def __init__(self, message, diagnostics=None):
        super().__init__(message)
        self.diagnostics = diagnostics


def get_api_key():
    """Environment wins; otherwise read only OPENAI_API_KEY from local .env, never execute it."""
    if os.environ.get("OPENAI_API_KEY"):
        return os.environ["OPENAI_API_KEY"]
    config = Path(__file__).resolve().parents[1] / ".env"
    if config.is_file():
        for line in config.read_text().splitlines():
            if line.startswith("OPENAI_API_KEY="):
                return line.split("=", 1)[1].strip().strip("\"'")
    return None


def create_response(payload, timeout=120, *, diagnostics=None, diagnostic_path=None):
    key = get_api_key()
    if not key:
        raise APIError("Set OPENAI_API_KEY in your environment or Git-ignored .env before making live calls")
    record = diagnostics if diagnostics is not None else new_request(payload.get('model'), timeout)
    started = time.monotonic()
    def observe(**fields):
        record.update(fields, transport_elapsed_seconds=round(time.monotonic()-started, 6))
        save_snapshot(diagnostic_path, record)

    data = json.dumps(payload).encode()
    request = urllib.request.Request(record['endpoint'], data=data,
        headers={"Authorization": "Bearer " + key, "Content-Type": "application/json",
                 "X-Client-Request-Id": record['client_request_id']}, method="POST")
    observe(phase='waiting_for_response_headers', transport_started_utc=utc_now(), timeout_seconds=timeout,
            request_bytes=len(data))
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            observe(phase='reading_response_body', http_status=response.status,
                    response_headers=response_headers(response.headers, key),
                    response_headers_seconds=round(time.monotonic()-started, 6))
            body = response.read()
            observe(phase='decoding_response', response_bytes=len(body))
            result = json.loads(body)
            if not isinstance(result, dict):
                raise ValueError('Expected a JSON object')
            observe(status='succeeded', phase='completed', finished_utc=utc_now())
            return result
    except urllib.error.HTTPError as exc:
        observe(phase='reading_error_body', http_status=exc.code,
                http_reason=safe_text(exc.reason, key), response_headers=response_headers(exc.headers, key),
                response_headers_seconds=round(time.monotonic()-started, 6))
        fields = {}
        try:
            body = exc.read(8192)
            record.update(error_body_bytes_read=len(body), error_body_at_read_limit=len(body)==8192)
            record['error_body_format'] = 'empty' if not body else 'non_json'
            parsed = json.loads(body)
            record['error_body_format'] = 'json'
            error = parsed.get('error', {}) if isinstance(parsed, dict) else {}
            if isinstance(error, dict):
                fields = {name: safe_text(error[name], key)
                          for name in ('type', 'code', 'param', 'message') if error.get(name)}
        except (ValueError, UnicodeError):
            pass  # No arbitrary body excerpts, HTML pages, cookies or request payloads in diagnostics.
        except (OSError, http.client.HTTPException) as read_error:
            record['error_body_read_error'] = exception_details(read_error, key)
        finally:
            exc.close()
        observe(status='failed', category='http_error', provider_error=fields, finished_utc=utc_now())
        detail = '; ' + json.dumps(fields) if fields else ''
        raise APIError(f"Responses API returned HTTP {exc.code}{detail}; no automatic retry", record) from None
    except (OSError, http.client.HTTPException) as exc:
        details = exception_details(exc, key)
        observe(status='failed', **details, finished_utc=utc_now())
        reason = details['causes'][-1]['message']
        raise APIError(f"Responses API {details['category']} ({type(exc).__name__}): {reason}; no automatic retry", record) from None
    except (ValueError, UnicodeError) as exc:
        # JSONDecodeError can quote received content; retain its type/position, not its document.
        observe(status='failed', category='invalid_response', exception_type=type(exc).__name__,
                response_error=safe_text(getattr(exc, 'msg', 'Expected a JSON object'), key),
                json_error_offset=getattr(exc, 'pos', None), finished_utc=utc_now())
        raise APIError(f"Responses API returned invalid JSON ({type(exc).__name__}); no automatic retry", record) from None
