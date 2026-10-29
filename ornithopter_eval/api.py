"""Small Responses API transport; standard library only, no implicit retries."""
import json
import os
import urllib.error
import urllib.request


class APIError(RuntimeError):
    pass


def create_response(payload, timeout=120):
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        raise APIError("Set OPENAI_API_KEY in your environment before making live calls")
    request = urllib.request.Request(
        "https://api.openai.com/v1/responses", data=json.dumps(payload).encode(),
        headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"},
        method="POST")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        # Avoid writing request headers, credentials, or entire server responses to logs.
        raise APIError(f"Responses API returned HTTP {exc.code}; no automatic retry") from None
    except (OSError, ValueError) as exc:
        raise APIError(f"Responses API transport failed ({type(exc).__name__}); no automatic retry") from None
