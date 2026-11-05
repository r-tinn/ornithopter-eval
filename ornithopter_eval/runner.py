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
from .checks import TASK_VERSION, MECHANICAL_VERSIONS
from .protocol import load_config, validate_config
from .deadline import DeadlineExceeded, call_before_deadline
from .diagnostics import new_request, save_snapshot, utc_now
from .rollout import POLICY_VERSION, ProtocolViolation, audit_rollout

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


def prepare(output, config_path=DEFAULT_CONFIG, *, generation_profile=None):
    output = Path(output).resolve()
    if output.exists():
        raise ValueError("Run directory already exists; each attempt requires a fresh directory")
    selected = verify_sources()
    config = load_config(config_path, generation_profile)
    if config.get("task_version") in MECHANICAL_VERSIONS:
        from .world_candidate import prepare_world_trial
        return prepare_world_trial(output, config_path, config=config)
    if config.get("task_version") != TASK_VERSION:
        raise ValueError("Unsupported task version")
    validate_config(config)
    output.mkdir(parents=True)
    (output / "inputs/sources").mkdir(parents=True)
    for name in ("TASK.md", "SOURCE_GUIDE.md"):
        shutil.copyfile(ROOT / "task" / name, output / "inputs" / name)
    shutil.copyfile(ROOT / 'task/DESIGN_BRIEF.md', output / 'inputs/DESIGN_BRIEF.md')
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
        "protocol": "one instruction; file operations only; no execution or grader feedback; configured budget checkpoints",
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
    budget_text = (f"The generation deadline is {config['max_wall_seconds']} seconds from the first API request. "
                   "There is no benchmark output-token or request-count limit; model/service limits still apply. "
                   "Time warnings are delivered at the next exchange after 50% and 75% of the deadline. "
                   "Prioritise completing files before the deadline. " if config.get('budget_mode') == 'wall_time' else
                   "The total output-token budget spans ALL responses, including reasoning, code/tool calls and final text. ")
    budget = "\n\nAttempt limits: " + json.dumps(config,sort_keys=True) + \
        ". These attempt limits override any historical budget numbers in the task prose. " + \
        budget_text + \
        "The shell tool is a virtual file reader: only ls PATH, cat PATH and head -n N PATH are available. " + \
        "Use targeted reads and declared file edits only. Do not request execution, syntax checks, builds, tests, " + \
        "browser previews, HTTP requests or grader feedback. Blocked out-of-policy requests are recorded. " + \
        "Reading your edited files and reasoning about them are allowed; do not claim executed verification."
    mechanical = manifest.get("task_version") in MECHANICAL_VERSIONS
    api = ("\n\n" + (run / "inputs/AIRCRAFT_API.md").read_text() +
           "\n\nENGINEERING ASSUMPTIONS\n" + (run / "inputs/engineering.json").read_text()) if mechanical else ""
    starter = (("Writable files: "+", ".join(manifest['editable_files'])+". ") +
               "All other submission files are supplied read-only infrastructure. " if mechanical else
               "Starter files: submission/index.html, submission/physics.mjs, submission/interpretation.json. ")
    content = [{"type": "input_text", "text": (run / "inputs/TASK.md").read_text() +
               "\n\n" + (run / "inputs/SOURCE_GUIDE.md").read_text() +
               ('\n\n' + (run / 'inputs/DESIGN_BRIEF.md').read_text() if (run / 'inputs/DESIGN_BRIEF.md').is_file() else '') +
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


def run_model(run, model, transport=create_response, *, clock=None):
    clock = time.monotonic if clock is None else clock
    run = Path(run).resolve()
    manifest = json.loads((run / "manifest.json").read_text())
    if manifest["status"] != "prepared":
        raise ValueError("An attempt cannot be resumed or overwritten")
    for name, expected in {**manifest["input_sha256"], **manifest["starter_sha256"]}.items():
        if digest(run / name) != expected:
            raise ValueError(f"Prepared file changed: {name}")
    config = manifest["config"]
    policy_type = FilePolicy
    if manifest.get("task_version") in MECHANICAL_VERSIONS:
        from .world_candidate import CandidateFilePolicy
        policy_type = CandidateFilePolicy
    policy = policy_type(run, config["max_submission_bytes"])
    history = initial_input(run)
    usage = {"input_tokens": 0, "output_tokens": 0, "requests": 0}
    notified = set()
    time_notified = set()
    timed = config.get('budget_mode') == 'wall_time'
    started = clock()
    manifest.update(model=model, status="running")
    write_json(run / "manifest.json", manifest)
    status, reason = "budget_exhausted", "request_limit"
    undispatched = []
    api_records = []
    try:
        with (run / "events.jsonl").open("x") as log:
            while config['max_requests'] is None or usage['requests'] < config['max_requests']:
                elapsed = clock() - started
                remaining = config["max_wall_seconds"] - elapsed
                tokens = None if timed else config["max_output_tokens_total"] - usage["output_tokens"]
                if remaining <= 0 or (tokens is not None and tokens < 16):
                    reason = "wall_time_limit" if remaining <= 0 else "output_token_limit"
                    break
                crossed = [] if timed else [p for p in config.get("output_token_notice_percentages", [50, 75])
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
                crossed_time = [p for p in config.get('time_notice_percentages', [])
                                if p not in time_notified and elapsed * 100 >= config['max_wall_seconds'] * p]
                if crossed_time:
                    thresholds = ', '.join(f'{p}%' for p in crossed_time)
                    notice = (f'Time budget checkpoint ({thresholds} crossed): {elapsed:.1f}/{config["max_wall_seconds"]} seconds elapsed; '
                              f'{remaining:.1f} seconds remaining. Complete the files now; no verification tools.')
                    history.append({'role': 'developer', 'content': [{'type': 'input_text', 'text': notice}]})
                    time_notified.update(crossed_time)
                    log.write(json.dumps({'event': 'budget_notice', 'budget_type': 'time', 'percentages': crossed_time,
                                          'elapsed_seconds': elapsed, 'remaining_seconds': remaining, 'text': notice}) + '\n')
                payload = {"model": model, "input": history, "store": False,
                           "include": ["reasoning.encrypted_content"],
                           "instructions": "Follow the task's file-only tool policy. "
                           "The shell is virtual: only ls PATH, cat PATH and head -n N PATH, within inputs/ or submission/. "
                           "Edits use apply_patch on declared writable files. Do not request tests, syntax checks, builds, "
                           "code execution, browser/HTTP access or grader feedback. Blocked attempts violate the file-only protocol. "
                           "File rereads, patch-error correction and mental review are allowed. Submit once.",
                           "tools": [{"type": "apply_patch"}, {"type": "shell", "environment": {"type": "local"}}]}
                if tokens is not None:
                    payload['max_output_tokens'] = min(tokens, config['max_output_tokens_per_response'])
                payload["reasoning"] = {"effort": config.get("reasoning_effort") or "medium"}
                diagnostic = new_request(model, remaining) if transport is create_response else None
                diagnostic_path = run / 'api-diagnostics' / f'request-{usage["requests"]+1:04d}.json'
                if diagnostic is not None:
                    diagnostic['request_index'] = usage['requests']+1
                log.write(json.dumps({"event":"request","index":usage["requests"]+1,
                    "model":model,"max_output_tokens":payload.get("max_output_tokens"),
                    "reasoning":payload.get("reasoning"),"tools":payload["tools"],
                    "instructions":payload["instructions"],
                    "input_sha256":hashlib.sha256(json.dumps(history,sort_keys=True).encode()).hexdigest(),
                    **({'client_request_id':diagnostic['client_request_id'],
                        'diagnostic_file':str(diagnostic_path.relative_to(run))} if diagnostic is not None else {})})+"\n")
                log.flush()
                try:
                    if timed and transport is create_response:
                        response = call_before_deadline(transport, payload, config['max_wall_seconds'] - (clock() - started),
                                                       diagnostics=diagnostic, diagnostic_path=diagnostic_path)
                    elif transport is create_response:
                        response = transport(payload, timeout=max(1, remaining), diagnostics=diagnostic, diagnostic_path=diagnostic_path)
                    else:
                        response = transport(payload, timeout=remaining if timed else max(1, remaining))
                except DeadlineExceeded:
                    reason = 'wall_time_limit'
                    usage['interrupted_requests'] = usage.get('interrupted_requests', 0) + 1
                    log.write(json.dumps({'event': 'request_interrupted', 'index': usage['requests'] + 1,
                                          'reason': reason, 'tool_dispatch': False}) + '\n')
                    if diagnostic is not None and diagnostic['status'] == 'pending':
                        diagnostic.update(status='deadline_exceeded', category='generation_deadline', usage_unknown=True,
                                          finished_utc=utc_now())
                    break
                except APIError as exc:
                    if diagnostic is not None:
                        diagnostic.update(exc.diagnostics or {})
                        if diagnostic['status'] == 'pending':
                            diagnostic.update(status='failed', category='transport_setup_error', finished_utc=utc_now())
                    raise
                finally:
                    if diagnostic is not None:
                        save_snapshot(diagnostic_path, diagnostic)
                        api_records.append(diagnostic)
                        write_json(run/'api-diagnostics.json', {'schema_version':1, 'requests':api_records,
                            'scope':'Harness HTTP observations only. Waiting for headers includes network setup, upload and server processing; it does not identify which was slow. Interrupted usage is unknown.'})
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
                if clock() - started >= config["max_wall_seconds"]:
                    reason = "wall_time_limit"
                    undispatched = [x.get('call_id') for x in response.get('output', [])
                                    if (x.get('type') in ('apply_patch_call', 'shell_call')
                                        and (response['status'] == 'completed' or x.get('status') == 'completed'))]
                    break
                output = response.get("output", [])
                history.extend(output)
                calls = [x for x in output if x.get("type") in ("apply_patch_call", "shell_call")]
                if len(calls) > 64:
                    raise ValueError("Too many tool calls in one response")
                for item in output:
                    if item.get("type", "").endswith("_call") and item not in calls:
                        undispatched = [x.get('call_id') for x in output if x.get('type', '').endswith('_call')]
                        raise ProtocolViolation("Unsupported tool requested")
                incomplete = response["status"] == "incomplete"
                eligible = [call for call in calls if not incomplete or call.get('status') == 'completed']
                deadline_hit = False
                for index, call in enumerate(eligible):
                    # A response can hit its cap after finishing earlier file operations.
                    # Retain those operations; never apply an unfinished or unmarked call.
                    if timed and clock() - started >= config['max_wall_seconds']:
                        undispatched = [x.get('call_id') for x in eligible[index:]]
                        deadline_hit = True
                        break
                    before = None
                    target = None
                    if timed and call.get('type') == 'apply_patch_call':
                        try:
                            target = policy.path((call.get('operation') or {}).get('path'), write=True)
                            before = target.read_bytes() if target.is_file() else None
                        except (PolicyError, OSError):
                            target = None
                    result = execute_call(policy, call)
                    if timed and clock() - started >= config['max_wall_seconds']:
                        if target is not None:
                            if before is None:
                                target.unlink(missing_ok=True)
                            else:
                                target.write_bytes(before)
                            result.update(status='failed', output='Deadline reached; late edit discarded.')
                        undispatched = [x.get('call_id') for x in eligible[index + 1:]]
                        deadline_hit = True
                    history.append(result)
                    log.write(json.dumps({"event": "tool_result", "result": result}) + "\n")
                    if deadline_hit:
                        break
                if deadline_hit:
                    reason = 'wall_time_limit'
                    break
                if incomplete:
                    reason = "incomplete_response"
                    break
                if not calls:
                    status, reason = "submitted", None
                    break
    except ProtocolViolation as exc:
        status, reason = 'protocol_violation', str(exc)
    except (APIError, ValueError, OSError) as exc:
        status, reason = "infrastructure_error", str(exc)
    for name, expected in manifest.get("readonly_sha256", {}).items():
        if not (run / "submission" / name).is_file() or digest(run / "submission" / name) != expected:
            status, reason = "infrastructure_error", "Shared world changed: " + name
    with (run / 'events.jsonl').open('a') as log:
        log.write(json.dumps({'event': 'run_end', 'status': status, 'reason': reason,
                              'usage': usage, 'undispatched_call_ids': undispatched}) + '\n')
    manifest.update(status=status, reason=reason, usage=usage,
                    usage_scope='Completed API responses only; interrupted request usage is unknown' if usage.get('interrupted_requests') else 'All completed API responses',
                    rollout_policy_version=POLICY_VERSION, events_sha256=digest(run / 'events.jsonl'),
                    output_token_notice_percentages_sent=sorted(notified),
                    time_notice_percentages_sent=sorted(time_notified),
                    elapsed_seconds=round(clock() - started, 3),
                    submission_sha256={str(p.relative_to(run / "submission")): digest(p)
                                       for p in sorted((run / "submission").rglob("*")) if p.is_file()})
    if api_records:
        manifest['api_diagnostics'] = {'file':'api-diagnostics.json', 'sha256':digest(run/'api-diagnostics.json'),
                                       'requests':len(api_records)}
    write_json(run / "manifest.json", manifest)
    review = audit_rollout(run)
    write_json(run / 'rollout-review.json', review)
    manifest['rollout_review'] = {'file': 'rollout-review.json', 'pass': review['pass'], 'status': review['status'],
                                 'sha256': digest(run / 'rollout-review.json')}
    write_json(run / 'manifest.json', manifest)
    return manifest
