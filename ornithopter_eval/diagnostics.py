"""Bounded, credential-redacted request metadata, separate from model input."""
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import socket
import ssl
import urllib.error
import uuid


HEADER_ALLOWLIST = {
    'x-request-id', 'retry-after', 'openai-processing-ms', 'openai-version',
    'content-type', 'content-length',
    'x-ratelimit-limit-requests', 'x-ratelimit-limit-tokens',
    'x-ratelimit-remaining-requests', 'x-ratelimit-remaining-tokens',
    'x-ratelimit-reset-requests', 'x-ratelimit-reset-tokens',
    'x-ratelimit-limit-project-tokens', 'x-ratelimit-remaining-project-tokens',
    'x-ratelimit-reset-project-tokens',
}


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def safe_text(value, secret=None, limit=600):
    text = str(value)
    if secret:
        text = text.replace(secret, '[redacted]')
    text = re.sub(r'\bsk-[A-Za-z0-9_-]+', '[redacted]', text)
    text = re.sub(r'\b(Bearer|Basic)\s+[^\s,;\"\'<>]+', r'\1 [redacted]', text, flags=re.I)
    text = re.sub(r'(https?://)[^\s/@]+(?::[^\s/@]*)?@', r'\1[redacted]@', text, flags=re.I)
    text = re.sub(r'data:[^\s,]+;base64,[A-Za-z0-9+/=]+', '[image data omitted]', text)
    return ''.join(c if c.isprintable() else ' ' for c in text)[:limit]


def response_headers(headers, secret):
    return {str(k).lower(): safe_text(v, secret, 200)
            for k, v in (headers.items() if headers else ()) if str(k).lower() in HEADER_ALLOWLIST}


def exception_details(exc, secret):
    causes, seen, exceptions = [], set(), []
    current = exc
    while isinstance(current, BaseException) and id(current) not in seen and len(causes) < 4:
        seen.add(id(current))
        exceptions.append(current)
        item = {'type': type(current).__name__, 'message': safe_text(current, secret)}
        for name in ('errno', 'winerror', 'verify_code'):
            value = getattr(current, name, None)
            if type(value) is int:
                item[name] = value
        if getattr(current, 'verify_message', None):
            item['verify_message'] = safe_text(current.verify_message, secret)
        causes.append(item)
        inner = current.reason if isinstance(current, urllib.error.URLError) else current.__cause__
        if isinstance(inner, str):
            item['reason'] = safe_text(inner, secret)
        current = inner
    categories = ((socket.gaierror, 'dns_error'), (ssl.SSLCertVerificationError, 'tls_certificate_error'),
                  (ssl.SSLError, 'tls_error'), (TimeoutError, 'timeout'),
                  (ConnectionResetError, 'connection_reset'), (ConnectionRefusedError, 'connection_refused'))
    category = next((label for kind, label in categories if any(isinstance(e, kind) for e in exceptions)), None)
    if category is None:
        category = ('proxy_tunnel_error' if any('tunnel connection failed' in x['message'].lower() for x in causes)
                    else 'connection_error' if isinstance(exc, urllib.error.URLError) else 'io_error')
    return {'category': category, 'causes': causes}


def new_request(model, timeout):
    return {'schema_version': 1, 'client_request_id': str(uuid.uuid4()),
            'endpoint': 'https://api.openai.com/v1/responses', 'model': safe_text(model),
            'started_utc': utc_now(), 'timeout_seconds': timeout,
            'status': 'pending', 'phase': 'starting_worker'}


def save_snapshot(path, record):
    if path is not None:
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix('.json.tmp')
        temporary.write_text(json.dumps(record, indent=2, allow_nan=False) + '\n')
        temporary.replace(path)


def load_snapshot(path, fallback):
    if path is not None:
        try:
            saved = json.loads(Path(path).read_text())
            if saved.get('client_request_id') == fallback.get('client_request_id'):
                return saved
        except (OSError, ValueError, AttributeError):
            pass
    return fallback
