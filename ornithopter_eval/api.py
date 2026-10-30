"""Small Responses API transport; standard library only, no implicit retries."""
import json
import os
from pathlib import Path
import urllib.error
import urllib.request


class APIError(RuntimeError):
    pass


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


def create_response(payload, timeout=120):
    key = get_api_key()
    if not key:
        raise APIError("Set OPENAI_API_KEY in your environment or Git-ignored .env before making live calls")
    request = urllib.request.Request(
        "https://api.openai.com/v1/responses", data=json.dumps(payload).encode(),
        headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"},
        method="POST")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        # Keep useful protocol diagnostics, never headers or a complete response body.
        detail = ""
        try:
            error = json.loads(exc.read(8192)).get("error", {})
            fields = {name:str(error[name]).replace(key,"[redacted]")[:600]
                      for name in ("code","param","message") if error.get(name)}
            detail = "; " + json.dumps(fields) if fields else ""
        except (ValueError,AttributeError,OSError):
            pass
        finally:
            exc.close()
        raise APIError(f"Responses API returned HTTP {exc.code}{detail}; no automatic retry") from None
    except (OSError, ValueError) as exc:
        raise APIError(f"Responses API transport failed ({type(exc).__name__}); no automatic retry") from None
