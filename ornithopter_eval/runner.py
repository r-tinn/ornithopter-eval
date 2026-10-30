import base64
import hashlib
import json
import shutil
import platform
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from .api import APIError, create_response
from .policy import FilePolicy, PolicyError
from .checks import TASK_VERSION

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG = ROOT / "configs/pilot.json"


def write_json(path, data):
    Path(path).write_text(json.dumps(data, indent=2, allow_nan=False) + "\n")


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def verify_sources():
    manifest = json.loads((ROOT / "task/source-manifest.json").read_text())
    selected = [x for x in manifest["archive_files"] if x["selected"]]
    for entry in selected:
        p = ROOT / "task/sources" / entry["file"]
        if digest(p) != entry["sha256"]:
            raise ValueError(f"Source hash mismatch: {entry['file']}")
    return selected


def prepare(output, config_path=DEFAULT_CONFIG):
    output = Path(output).resolve()
    if output.exists():
        raise ValueError("Run directory already exists; each attempt requires a fresh directory")
    selected = verify_sources()
    config = json.loads(Path(config_path).read_text())
    for key in ("max_output_tokens_total", "max_output_tokens_per_response", "max_requests",
                "max_wall_seconds", "max_submission_bytes"):
        if type(config.get(key)) is not int or config[key] <= 0:
            raise ValueError(f"Invalid budget: {key}")
    if config.get("task_version") != TASK_VERSION:
        raise ValueError("Unsupported task version")
    output.mkdir(parents=True)
    (output / "inputs/sources").mkdir(parents=True)
    for name in ("TASK.md", "SOURCE_GUIDE.md"):
        shutil.copyfile(ROOT / "task" / name, output / "inputs" / name)
    for entry in selected:
        shutil.copyfile(ROOT / "task/sources" / entry["file"], output / "inputs/sources" / entry["file"])
    shutil.copytree(ROOT / "task/starter", output / "submission")
    input_hashes = {str(p.relative_to(output)): digest(p)
                    for p in sorted((output / "inputs").rglob("*")) if p.is_file()}
    starter_hashes = {str(p.relative_to(output)): digest(p)
                      for p in sorted((output / "submission").rglob("*")) if p.is_file()}
    write_json(output / "manifest.json", {
        "task_version": config["task_version"], "config": config,
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "input_sha256": input_hashes, "starter_sha256": starter_hashes,
        "implementation_sha256": {str(p.relative_to(ROOT)): digest(p)
            for pattern in ("ornithopter_eval/*.py", "grader/*.mjs") for p in sorted(ROOT.glob(pattern))},
        "runtime": {"python":sys.version, "platform":platform.platform()},
        "protocol": "one instruction; file operations only; no execution or grader feedback",
        "status": "prepared", "model": None,
    })
    return output


def image_input(path):
    mime = "image/jpeg" if Path(path).suffix.lower() in (".jpg", ".jpeg") else "image/png"
    return {"type": "input_image", "image_url": "data:" + mime + ";base64," +
            base64.b64encode(Path(path).read_bytes()).decode(), "detail": "high"}


def initial_input(run):
    config = json.loads((run / "manifest.json").read_text())["config"]
    budget = "\n\nAttempt limits: " + json.dumps(config,sort_keys=True) + ". Output-token limits include reasoning."
    content = [{"type": "input_text", "text": (run / "inputs/TASK.md").read_text() +
               "\n\n" + (run / "inputs/SOURCE_GUIDE.md").read_text() +
               budget +
               "\n\nStarter files: submission/index.html, submission/physics.mjs, "
               "submission/interpretation.json. Images follow, labelled in filename order."}]
    for path in sorted((run / "inputs/sources").glob("*.jpg")):
        content.extend([{"type": "input_text", "text": path.name}, image_input(path)])
    return [{"role": "user", "content": content}]


def execute_call(policy, item):
    kind, call_id = item.get("type"), item.get("call_id")
    if not call_id:
        raise ValueError("Tool call missing call_id")
    if kind == "apply_patch_call":
        try:
            policy.apply(item.get("operation"))
            return {"type": "apply_patch_call_output", "call_id": call_id,
                    "status": "completed", "output": "File operation applied."}
        except (PolicyError, OSError, UnicodeError) as exc:
            return {"type": "apply_patch_call_output", "call_id": call_id,
                    "status": "failed", "output": str(exc)}
    if kind == "shell_call":
        commands = item.get("action", {}).get("commands", [])
        if not isinstance(commands, list) or not 1 <= len(commands) <= 8:
            commands = [None]
        result = []
        for command in commands:
            try:
                stdout = policy.inspect(command)
                result.append({"stdout": stdout, "stderr": "",
                               "outcome": {"type": "exit", "exit_code": 0}})
            except (PolicyError, OSError) as exc:
                result.append({"stdout": "", "stderr": str(exc),
                               "outcome": {"type": "exit", "exit_code": 1}})
        return {"type": "shell_call_output", "call_id": call_id, "output": result}
    raise ValueError(f"Unexpected tool: {kind}")


def run_model(run, model, transport=create_response):
    run = Path(run).resolve()
    manifest = json.loads((run / "manifest.json").read_text())
    if manifest["status"] != "prepared":
        raise ValueError("An attempt cannot be resumed or overwritten")
    for name, expected in {**manifest["input_sha256"], **manifest["starter_sha256"]}.items():
        if digest(run / name) != expected:
            raise ValueError(f"Prepared file changed: {name}")
    config = manifest["config"]
    policy = FilePolicy(run, config["max_submission_bytes"])
    history = initial_input(run)
    usage = {"input_tokens": 0, "output_tokens": 0, "requests": 0}
    started = time.monotonic()
    manifest.update(model=model, status="running")
    write_json(run / "manifest.json", manifest)
    status, reason = "budget_exhausted", "request_limit"
    try:
        with (run / "events.jsonl").open("x") as log:
            for _ in range(config["max_requests"]):
                remaining = config["max_wall_seconds"] - (time.monotonic() - started)
                tokens = config["max_output_tokens_total"] - usage["output_tokens"]
                if remaining <= 0 or tokens < 16:
                    reason = "wall_time_limit" if remaining <= 0 else "output_token_limit"
                    break
                payload = {"model": model, "input": history, "store": False,
                           "include": ["reasoning.encrypted_content"],
                           "instructions": "Follow the task's file-only tool policy. "
                           "The shell is virtual and cannot execute programs. Submit once; no verification.",
                           "tools": [{"type": "apply_patch"}, {"type": "shell", "environment": {"type": "local"}}],
                           "max_output_tokens": min(tokens, config["max_output_tokens_per_response"])}
                if config.get("reasoning_effort"):
                    payload["reasoning"] = {"effort": config["reasoning_effort"]}
                log.write(json.dumps({"event":"request","index":usage["requests"]+1,
                    "model":model,"max_output_tokens":payload["max_output_tokens"],
                    "reasoning":payload.get("reasoning"),"tools":payload["tools"],
                    "instructions":payload["instructions"],
                    "input_sha256":hashlib.sha256(json.dumps(history,sort_keys=True).encode()).hexdigest()})+"\n")
                log.flush()
                response = transport(payload, timeout=max(1, remaining))
                usage["requests"] += 1
                log.write(json.dumps({"event": "response", "response": response}) + "\n")
                log.flush()
                for key in ("input_tokens", "output_tokens"):
                    value = response.get("usage", {}).get(key)
                    if type(value) is not int or value < 0:
                        raise ValueError("Missing or invalid API usage; budget cannot be enforced")
                    usage[key] += value
                if response.get("status") not in ("completed", "incomplete"):
                    raise ValueError("Response did not complete")
                if time.monotonic() - started > config["max_wall_seconds"]:
                    reason = "wall_time_limit"
                    break
                output = response.get("output", [])
                history.extend(output)
                calls = [x for x in output if x.get("type") in ("apply_patch_call", "shell_call")]
                if len(calls) > 64:
                    raise ValueError("Too many tool calls in one response")
                for item in output:
                    if item.get("type", "").endswith("_call") and item not in calls:
                        raise ValueError("Unsupported tool requested")
                if response["status"] == "incomplete":
                    reason = "incomplete_response"
                    break  # Truncated patches are never silently applied.
                for call in calls:
                    result = execute_call(policy, call)
                    history.append(result)
                    log.write(json.dumps({"event": "tool_result", "result": result}) + "\n")
                if not calls:
                    status, reason = "submitted", None
                    break
    except (APIError, ValueError, OSError) as exc:
        status, reason = "infrastructure_error", str(exc)
    manifest.update(status=status, reason=reason, usage=usage,
                    elapsed_seconds=round(time.monotonic() - started, 3),
                    submission_sha256={str(p.relative_to(run / "submission")): digest(p)
                                       for p in sorted((run / "submission").rglob("*")) if p.is_file()})
    write_json(run / "manifest.json", manifest)
    return manifest
