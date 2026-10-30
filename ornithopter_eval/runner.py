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
    if config.get("task_version") == "mechanical-v4-draft":
        from .world_candidate import prepare_world_trial
        return prepare_world_trial(output, config_path)
    for key in ("max_output_tokens_total", "max_output_tokens_per_response", "max_requests",
                "max_wall_seconds", "max_submission_bytes"):
        if type(config.get(key)) is not int or config[key] <= 0:
            raise ValueError(f"Invalid budget: {key}")
    if config.get("task_version") != TASK_VERSION:
        raise ValueError("Unsupported task version")
    config["reasoning_effort"] = config.get("reasoning_effort") or "medium"
    percentages = config.setdefault("output_token_notice_percentages", [50, 75])
    if (not isinstance(percentages, list) or
        any(type(p) is not int or not 0 < p < 100 for p in percentages) or
        percentages != sorted(set(percentages))):
        raise ValueError("Output-token notice percentages must be distinct, ascending integers between 1 and 99")
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
        "protocol": "one instruction; file operations only; no execution or grader feedback; configured token-only checkpoints",
        "status": "prepared", "model": None,
    })
    return output


def image_input(path):
    mime = "image/jpeg" if Path(path).suffix.lower() in (".jpg", ".jpeg") else "image/png"
    return {"type": "input_image", "image_url": "data:" + mime + ";base64," +
            base64.b64encode(Path(path).read_bytes()).decode(), "detail": "high"}


def initial_input(run):
    manifest = json.loads((run / "manifest.json").read_text())
    config = manifest["config"]
    budget = "\n\nAttempt limits: " + json.dumps(config,sort_keys=True) + \
        ". The total output-token budget spans ALL responses, including reasoning, code/tool calls and final text."
    mechanical = manifest.get("task_version") == "mechanical-v4-draft"
    api = ("\n\n" + (run / "inputs/AIRCRAFT_API.md").read_text() +
           "\n\nENGINEERING ASSUMPTIONS\n" + (run / "inputs/engineering.json").read_text()) if mechanical else ""
    starter = ("Writable files: submission/aircraft.mjs, submission/physics.mjs, submission/interpretation.json. "
               "All other submission files are supplied read-only infrastructure. " if mechanical else
               "Starter files: submission/index.html, submission/physics.mjs, submission/interpretation.json. ")
    content = [{"type": "input_text", "text": (run / "inputs/TASK.md").read_text() +
               "\n\n" + (run / "inputs/SOURCE_GUIDE.md").read_text() +
               api + budget + "\n\n" + starter + "Images follow, labelled in filename order."}]
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
    policy_type = FilePolicy
    if manifest.get("task_version") == "mechanical-v4-draft":
        from .world_candidate import CandidateFilePolicy
        policy_type = CandidateFilePolicy
    policy = policy_type(run, config["max_submission_bytes"])
    history = initial_input(run)
    usage = {"input_tokens": 0, "output_tokens": 0, "requests": 0}
    notified = set()
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
                crossed = [p for p in config.get("output_token_notice_percentages", [50, 75])
                           if p not in notified and usage["output_tokens"] * 100 >= config["max_output_tokens_total"] * p]
                if crossed:
                    thresholds = ", ".join(f"{p}%" for p in crossed)
                    notice = (f"Output-token budget checkpoint ({thresholds} crossed): "
                              f"{usage['output_tokens']:,}/{config['max_output_tokens_total']:,} used; "
                              f"{tokens:,} remaining. Counts include reasoning and all generated output.")
                    history.append({"role":"developer", "content":[{"type":"input_text", "text":notice}]})
                    notified.update(crossed)
                    log.write(json.dumps({"event":"budget_notice", "percentages":crossed,
                        "output_tokens_used":usage["output_tokens"],"output_tokens_remaining":tokens,"text":notice})+"\n")
                payload = {"model": model, "input": history, "store": False,
                           "include": ["reasoning.encrypted_content"],
                           "instructions": "Follow the task's file-only tool policy. "
                           "The shell is virtual and cannot execute programs. Submit once; no verification.",
                           "tools": [{"type": "apply_patch"}, {"type": "shell", "environment": {"type": "local"}}],
                           "max_output_tokens": min(tokens, config["max_output_tokens_per_response"])}
                payload["reasoning"] = {"effort": config.get("reasoning_effort") or "medium"}
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
                incomplete = response["status"] == "incomplete"
                for call in calls:
                    # A response can hit its cap after finishing earlier file operations.
                    # Retain those operations; never apply an unfinished or unmarked call.
                    if incomplete and call.get("status") != "completed":
                        continue
                    result = execute_call(policy, call)
                    history.append(result)
                    log.write(json.dumps({"event": "tool_result", "result": result}) + "\n")
                if incomplete:
                    reason = "incomplete_response"
                    break
                if not calls:
                    status, reason = "submitted", None
                    break
    except (APIError, ValueError, OSError) as exc:
        status, reason = "infrastructure_error", str(exc)
    for name, expected in manifest.get("readonly_sha256", {}).items():
        if not (run / "submission" / name).is_file() or digest(run / "submission" / name) != expected:
            status, reason = "infrastructure_error", "Shared world changed: " + name
    manifest.update(status=status, reason=reason, usage=usage,
                    output_token_notice_percentages_sent=sorted(notified),
                    elapsed_seconds=round(time.monotonic() - started, 3),
                    submission_sha256={str(p.relative_to(run / "submission")): digest(p)
                                       for p in sorted((run / "submission").rglob("*")) if p.is_file()})
    write_json(run / "manifest.json", manifest)
    return manifest
