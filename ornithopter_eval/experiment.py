"""Repeatable model trials and a portable, local artifact workbench."""
import html
import http.server
import json
import re
import shutil
import subprocess
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote, urlsplit

from .api import create_response, get_api_key
from .checks import CHECKS, TASK_VERSION
from .grading import grade_submission
from .runner import ROOT, digest, initial_input, prepare, run_model, write_json

AUTOMATED = ("source", "physics", "interaction")


def automated_result(report):
    if report.get("status") in ("infrastructure_error", "submission_timeout", "partial"):
        return None
    observed = []
    groups = {}
    for group in AUTOMATED:
        checks = report.get("dimensions", {}).get(group, {}).get("checks", [])
        if len(checks) != len(CHECKS[group]) or {c["id"] for c in checks} != set(CHECKS[group]):
            return None
        if any(type(c.get("pass")) is not bool for c in checks):
            return None
        groups[group] = {"passed":sum(c["pass"] for c in checks), "total":len(checks)}
        observed.extend(checks)
    return {"passed":sum(c["pass"] for c in observed), "total":len(observed),
            "failed":[c["id"] for c in observed if not c["pass"]], "groups":groups}


def write_transcript(run):
    parts = ["INITIAL INSTRUCTION\n", initial_input(run)[0]["content"][0]["text"],
             "\nImages: inputs/sources/Unknown-2.jpg, inputs/sources/Unknown-14.jpg\n"]
    path = run / "events.jsonl"
    if path.exists():
        for line in path.read_text().splitlines():
            event = json.loads(line)
            if event["event"] == "request":
                parts.append("\nREQUEST\n" + json.dumps(event,indent=2))
            elif event["event"] == "tool_result":
                parts.append("\nTOOL RESULT\n" + json.dumps(event["result"],indent=2))
            elif event["event"] == "response":
                response = event["response"]
                parts.append("\nRESPONSE " + str(response.get("id")) + " / " + str(response.get("status")))
                for item in response.get("output", []):
                    if item.get("type") == "reasoning":
                        parts.append("[Private reasoning is not rendered; raw encrypted metadata is retained in events.jsonl.]")
                    else:
                        parts.append(json.dumps(item,indent=2))
    (run / "transcript.txt").write_text("\n".join(parts)+"\n")


def _page(title, body):
    return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' + \
        '<title>'+html.escape(title)+'</title><style>body{font:16px/1.55 system-ui,sans-serif;background:#f4f2ec;color:#20343c;max-width:1200px;margin:40px auto;padding:0 24px}h1{font:40px Georgia,serif;margin-bottom:8px}h2{font-size:22px}a{color:#1c626b}table{width:100%;border-collapse:collapse;background:white}td,th{padding:14px 16px;border-bottom:1px solid #ddd;text-align:left}th{font-size:13px;color:#68736f}small,.muted{color:#68736f}.cards{display:flex;gap:20px;flex-wrap:wrap;margin:24px 0}.card{background:white;border:1px solid #ddd;border-radius:10px;padding:20px;min-width:240px}.score{font-size:30px;font-weight:650}.actions a{display:inline-block;margin:3px 12px 3px 0}figure{margin:24px 0;background:white;padding:16px;border-radius:10px}img{display:block;max-width:100%;height:auto;border:1px solid #ddd}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:white;padding:20px}code{font:13px monospace}.badge{font-size:12px;padding:3px 8px;background:#e4ebe7;border-radius:4px}</style><body>' + body + '</body></html>'


def _write_html(path, contents):
    temp = path.with_suffix(".html.tmp")
    temp.write_text(contents)
    temp.replace(path)


def write_trial_pages(run):
    evidence = []
    report_path = run / "grade/report.json"
    if report_path.exists():
        report = json.loads(report_path.read_text())
        evidence = report.get("evidence", {}).get("screenshots", [])
    figures = ''.join('<figure><figcaption>'+html.escape(name)+'</figcaption><img src="grade/'+html.escape(name,quote=True)+'" alt="'+html.escape(name,quote=True)+'"></figure>' for name in evidence)
    _write_html(run / "evidence.html",_page("Grader captures",'<p><a href="../../index.html">All trials</a></p><h1>Grader captures</h1><p>Captured after submission. No feedback was returned to the generator.</p>'+figures+('<p>No screenshots were captured; inspect the report and logs.</p>' if not figures else '')+'<p><a href="grade/report.json">Full report</a> · <a href="grade/grader.log">Grader log</a></p>'))
    sources = []
    for path in sorted((run / "submission").rglob("*")):
        if path.is_file() and not path.is_symlink():
            name = str(path.relative_to(run / "submission"))
            sources.append("FILE: "+name+"\n"+path.read_text()+"\n")
    (run / "submission-source.txt").write_text("\n".join(sources))


def refresh_workbench(root, experiment):
    summaries = {}
    for model in experiment["models"]:
        trials = [t for t in experiment["trials"] if t["model"] == model]
        valid = [t["automated"] for t in trials if t.get("automated") is not None]
        summaries[model] = {"attempts":len(trials), "graded_attempts":len(valid),
            "mean_passed":round(sum(t["passed"] for t in valid)/len(valid),2) if valid else None,
            "total_checks":20, "all_automated_passes":sum(t["passed"]==20 for t in valid),
            "range":[min(t["passed"] for t in valid),max(t["passed"] for t in valid)] if valid else None}
    summary = {"task_version":TASK_VERSION,"status":experiment["status"],"models":summaries,
               "comparison_scope":"20 deterministic checks; all five visual checks remain separately ungraded.",
               "full_task_pass_rate":None,"note":"Three repeats per model are exploratory, not a definitive ranking.",
               "trials":experiment["trials"]}
    write_json(root / "summary.json", summary)
    write_json(root / "experiment.json", experiment)
    cards = ''.join('<div class="card"><strong>'+html.escape(model)+'</strong><div class="score">'+str(s["mean_passed"] if s["mean_passed"] is not None else '—')+' <small>/ 20</small></div><span class="muted">Mean automated checks · '+str(s["graded_attempts"])+' / '+str(s["attempts"])+' graded</span></div>' for model,s in summaries.items())
    rows = []
    for t in experiment["trials"]:
        prefix = 'trials/'+t["id"]+'/'
        result = t.get("automated")
        score = str(result["passed"])+" / 20" if result else '—'
        simulator_label = 'Fly simulator ↗' if result and result['groups']['interaction']['passed'] else 'Open submission ↗'
        actions = '<a target="_blank" rel="noopener" href="'+prefix+'submission/index.html">'+simulator_label+'</a><a href="'+prefix+'evidence.html">Captures</a><a href="'+prefix+'grade/report.json">Checks</a><a href="'+prefix+'transcript.txt">Transcript</a><a href="'+prefix+'submission-source.txt">Source</a>' if t["status"] not in ("prepared","running") else '<span class="muted">Artifacts appear when this attempt finishes.</span>'
        reason = '<br><small>'+html.escape(t['reason'])+'</small>' if t.get('reason') else ''
        rows.append('<tr><td>'+str(t["repeat"])+'</td><td>'+html.escape(t["model"])+'</td><td><strong>'+score+'</strong></td><td><span class="badge">'+html.escape(t["status"])+'</span>'+reason+'</td><td class="actions">'+actions+'</td></tr>')
    effort = html.escape(str(experiment["config"].get("reasoning_effort","default")))
    tokens = str(experiment["config"]["max_output_tokens_total"])
    body = '<p class="muted">Stanley’s Swan · '+TASK_VERSION+'</p><h1>Frontier model calibration</h1><p>Open each unchanged model submission to fly it yourself, or inspect what the graders captured.</p><p><strong>Automated checks only.</strong> Five visual checks remain ungraded. A 20/20 result is not a full-task pass.</p>'+cards+'<table><thead><tr><th>Repeat</th><th>Model</th><th>Automated</th><th>Attempt</th><th>Inspect</th></tr></thead><tbody>'+''.join(rows)+'</tbody></table><p class="muted">Same source packet, starter, '+effort+' reasoning and '+tokens+' total output tokens. No execution, testing or grader feedback during generation. Refresh this page for completed attempts.</p><p><a href="experiment.json">Protocol and provenance</a> · <a href="summary.json">Results JSON</a> · <a href="config.json">Fixed budget</a></p>'
    if (root / "artifacts.zip").exists():
        body += '<p><a href="artifacts.zip">Download all artifacts</a></p>'
    if (root / "CALIBRATION.md").exists():
        body = '<p><strong>Read before comparing scores:</strong> <a href="CALIBRATION.md">Calibration findings and known protocol problems</a>.</p>' + body
    _write_html(root / "index.html", _page("Frontier model calibration", body))
    return summary


def run_experiment(output, models, repeats, config_path, node="node", transport=create_response, grader=grade_submission):
    root = Path(output).resolve()
    if root.exists():
        raise ValueError("Experiment directory already exists; preserve all previous attempts")
    if len(models)!=2 or len(set(models))!=2 or any(not re.fullmatch(r"[a-z0-9][a-z0-9._-]{0,99}",m) for m in models):
        raise ValueError("Provide two distinct explicit model IDs")
    if type(repeats) is not int or not 1<=repeats<=20:
        raise ValueError("Repeats must be between 1 and 20")
    if transport is create_response and not get_api_key():
        raise ValueError("A local API key is required; no experiment was created")
    frozen = {str(p.relative_to(ROOT)):digest(p) for pattern in
              ("ornithopter_eval/*.py","grader/*.mjs","task/*.md","task/starter/*","task/sources/*.jpg")
              for p in sorted(ROOT.glob(pattern)) if p.is_file()}
    root.mkdir(parents=True)
    shutil.copyfile(config_path, root / "config.json")
    config = json.loads((root / "config.json").read_text())
    try:
        commit = subprocess.check_output(["git","rev-parse","HEAD"],cwd=ROOT,text=True).strip()
    except (OSError,subprocess.CalledProcessError):
        commit = None
    experiment = {"task_version":TASK_VERSION,"created_utc":datetime.now(timezone.utc).isoformat(),
        "git_commit":commit,"frozen_sha256":frozen,"config_sha256":digest(root / "config.json"),
        "models":models,"repeats":repeats,"config":config,"status":"prepared",
        "protocol":f"Two generators in parallel per round; {repeats} independent rounds; grading only after submission; no retries.",
        "visual_review":"Not scored: previous image judge failed calibration.","trials":[]}
    for repeat in range(1,repeats+1):
        for model in models:
            name = model+f"-{repeat:02d}"
            run = prepare(root / "trials" / name,root / "config.json")
            (run / "initial-instruction.txt").write_text(initial_input(run)[0]["content"][0]["text"])
            experiment["trials"].append({"id":name,"model":model,"repeat":repeat,"status":"prepared","automated":None})
    refresh_workbench(root,experiment)

    def generate(trial):
        run = root / "trials" / trial["id"]
        manifest = run_model(run,trial["model"],transport)
        write_transcript(run)
        return manifest

    with ThreadPoolExecutor(max_workers=2) as pool:
        for repeat in range(1,repeats+1):
            if digest(root / "config.json")!=experiment["config_sha256"] or any(digest(ROOT/name)!=sha for name,sha in frozen.items()):
                raise ValueError("Task, harness, grader or configuration changed during the frozen experiment")
            pair = [t for t in experiment["trials"] if t["repeat"]==repeat]
            for trial in pair:
                trial["status"]="running"
            experiment["status"]="running"
            refresh_workbench(root,experiment)
            pending = {pool.submit(generate,t):t for t in pair}
            for future in as_completed(pending):
                trial = pending[future]
                run = root / "trials" / trial["id"]
                try:
                    manifest = future.result()
                    trial.update(status=manifest["status"],reason=manifest.get("reason"),usage=manifest.get("usage"),elapsed_seconds=manifest.get("elapsed_seconds"))
                    if manifest["status"] in ("submitted","budget_exhausted"):
                        report = grader(run / "submission",run / "grade",node=node)
                        trial["grading_status"] = report["status"]
                        trial["automated"] = automated_result(report)
                        if trial["automated"] is None:
                            trial["grading_error"] = report.get("error","Incomplete automated grading")
                    write_trial_pages(run)
                except Exception as exc:
                    trial.update(status="infrastructure_error",reason=str(exc))
                    write_trial_pages(run)
                refresh_workbench(root,experiment)
                print(trial["id"]+": "+json.dumps({k:trial.get(k) for k in ("status","automated","reason","grading_error")}),flush=True)
            if any(t["status"]=="infrastructure_error" or t.get("grading_error") for t in pair):
                experiment["status"]="attention_required"
                return refresh_workbench(root,experiment)
    experiment["status"]="completed"
    return refresh_workbench(root,experiment)


def export_experiment(source, destination):
    source,destination = Path(source).resolve(),Path(destination).resolve()
    if destination.exists() or destination.is_relative_to(source):
        raise ValueError("Export requires a fresh directory outside the running experiment")
    if any(p.is_symlink() or p.name.startswith(".") for p in source.rglob("*")):
        raise ValueError("Unexpected hidden file or symlink in experiment")
    shutil.copytree(source,destination)
    expected = {str(p.relative_to(source)):digest(p) for p in source.rglob("*") if p.is_file()}
    for name,sha in expected.items():
        if digest(destination / name)!=sha:
            raise ValueError("Artifact export changed bytes: "+name)
    write_json(destination / "export-sha256.json",expected)
    with tempfile.TemporaryDirectory() as temp:
        archive = shutil.make_archive(str(Path(temp)/"artifacts"),"zip",root_dir=destination)
        shutil.copyfile(archive,destination / "artifacts.zip")
    return destination


class ArtifactServer(http.server.BaseHTTPRequestHandler):
    def log_message(self,*_):
        pass

    def do_GET(self):
        name = unquote(urlsplit(self.path).path).lstrip("/") or "index.html"
        path = self.server.artifact_root / name
        allowed = {".html":"text/html",".mjs":"text/javascript",".js":"text/javascript",".css":"text/css",
                   ".json":"application/json",".jsonl":"text/plain",".txt":"text/plain",".log":"text/plain",
                   ".md":"text/plain",".png":"image/png",".jpg":"image/jpeg",".zip":"application/zip"}
        if (not path.resolve().is_relative_to(self.server.artifact_root) or any(part.startswith(".") for part in Path(name).parts)
            or any(p.is_symlink() for p in (path,*path.parents)) or not path.is_file() or path.suffix not in allowed):
            self.send_error(404);return
        body = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type",allowed[path.suffix]);self.send_header("Content-Length",str(len(body)))
        self.send_header("Content-Security-Policy","default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'")
        self.send_header("Cache-Control","no-store");self.end_headers();self.wfile.write(body)


def serve_artifacts(root, port=8765):
    root = Path(root).resolve()
    if not (root / "experiment.json").is_file() or not (root / "index.html").is_file():
        raise ValueError("Select an experiment artifact directory")
    server = http.server.ThreadingHTTPServer(("127.0.0.1",port),ArtifactServer)
    server.artifact_root = root
    print(f"Artifact workbench: http://127.0.0.1:{server.server_port}/",flush=True)
    try:
        server.serve_forever()
    finally:
        server.server_close()
