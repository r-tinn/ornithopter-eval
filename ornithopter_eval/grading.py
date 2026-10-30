import http.server
import json
import os
import signal
import subprocess
import threading
from pathlib import Path
from urllib.parse import unquote, urlsplit

from .runner import ROOT, digest, write_json
from .checks import CHECKS, TASK_VERSION, normalize_checks, refresh_verdict


class SubmissionServer(http.server.BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_GET(self):
        name = unquote(urlsplit(self.path).path)
        if name == "/__probe.html":
            body, mime = b"<!doctype html><title>Isolated physics probe</title>", "text/html"
        else:
            p = self.server.submission / name.lstrip("/")
            if (not p.resolve().is_relative_to(self.server.submission) or
                any(x.is_symlink() for x in [p, *p.parents]) or not p.is_file() or
                p.suffix not in (".html", ".mjs", ".js", ".css", ".json", ".png", ".jpg")):
                self.send_error(404)
                return
            body = p.read_bytes()
            mime = {".html":"text/html", ".mjs":"text/javascript", ".js":"text/javascript",
                    ".css":"text/css", ".json":"application/json", ".png":"image/png", ".jpg":"image/jpeg"}[p.suffix]
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Security-Policy", "default-src 'none'; script-src 'self' 'unsafe-inline'; "
                         "style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; "
                         "worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'")
        self.end_headers()
        self.wfile.write(body)


def grade_submission(submission, output, node="node", timeout=60):
    submission, output = Path(submission).resolve(), Path(output).resolve()
    if not submission.is_dir():
        raise ValueError("Submission directory missing")
    if output.exists():
        raise ValueError("Grade directory already exists; preserve prior evidence")
    output.mkdir(parents=True)
    hashes = {str(p.relative_to(submission)): digest(p) for p in sorted(submission.rglob("*"))
              if p.is_file() and not p.is_symlink()}
    report = {"task_version":TASK_VERSION, "submission_sha256":hashes,
              "grader_sha256": {"browser.mjs":digest(ROOT / "grader/browser.mjs"),
                                "grading.py":digest(Path(__file__)),
                                "checks.py":digest(ROOT / "ornithopter_eval/checks.py")},
              "passed":None, "status":"partial", "dimensions":{},
              "limitations":["Single task, no evidence of general benchmark validity.",
                             "Force checks test three properties of an assumed model, not realistic aerodynamics or full equation compliance.",
                             "Browser checks observe the required production state hook; they do not independently prove mesh motion or truthful coupling.",
                             "Two visual judgments cover wing placement and tail position only; model judges can be wrong.",
                             "Browser isolation is defense in depth, not a hardened sandbox for hostile code."]}
    manifest_path = submission.parent / "manifest.json"
    if manifest_path.exists():
        attempt = json.loads(manifest_path.read_text())
        report["attempt"] = {k:attempt.get(k) for k in
            ("model","status","reason","config","usage","elapsed_seconds","input_sha256","runtime")}
        if attempt.get("task_version") != TASK_VERSION:
            report.update(status="infrastructure_error", error="Attempt uses a different task version")
            write_json(output / "report.json", report)
            return report
        if attempt.get("status") not in ("submitted","budget_exhausted"):
            report.update(status="infrastructure_error",error="Attempt did not produce a gradable submission: "+str(attempt.get("status")))
            write_json(output / "report.json",report)
            return report
        if hashes != attempt.get("submission_sha256"):
            report.update(status="infrastructure_error",error="Submission changed after the attempt; refusing to grade a revision")
            write_json(output / "report.json",report)
            return report
    # Do not pass API keys, GitHub credentials or the parent process environment to Chromium.
    allowed = ("PATH", "TMPDIR", "SYSTEMROOT", "DISPLAY", "PLAYWRIGHT_BROWSERS_PATH")
    clean_env = {k:os.environ[k] for k in allowed if k in os.environ}
    if "PLAYWRIGHT_BROWSERS_PATH" not in clean_env and (ROOT / ".cache/browsers").exists():
        clean_env["PLAYWRIGHT_BROWSERS_PATH"] = str(ROOT / ".cache/browsers")
    try:
        server = http.server.ThreadingHTTPServer(("127.0.0.1",0), SubmissionServer)
    except OSError as exc:
        report.update(status="infrastructure_error",error="Local test server could not start: "+str(exc))
        write_json(output / "report.json",report)
        return report
    server.submission = submission
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        command = [node,str(ROOT / "grader/browser.mjs"), f"http://127.0.0.1:{server.server_port}",str(output)]
        with (output / "grader.log").open("w") as log:
            process = subprocess.Popen(command, env=clean_env, stdout=log, stderr=log, start_new_session=True)
            try:
                process.wait(timeout=timeout)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
                report.update(status="submission_timeout", error="Grading exceeded its time limit; manual inspection required.")
                write_json(output / "report.json", report)
                return report
        raw_path = output / "browser-results.json"
        if not raw_path.exists():
            raise RuntimeError("Browser grader did not produce results; see grader.log")
        raw = json.loads(raw_path.read_text())
        if raw.get("infrastructure_error"):
            raise RuntimeError(raw["infrastructure_error"])
        for key in ("source","physics","interaction"):
            report["dimensions"][key] = {"kind":"deterministic", "checks":normalize_checks(key,raw[key])}
        report["diagnostics"] = raw.get("diagnostics", {})
        report["dimensions"]["visual"] = {"kind":"review", "checks":[
            {"id":name,"question":question,"pass":None} for name, question in CHECKS["visual"].items()]}
        report["evidence"] = raw["evidence"]
        refresh_verdict(report)
    except (OSError,ValueError,RuntimeError) as exc:
        report.update(status="infrastructure_error",error=str(exc))
    finally:
        server.shutdown()
        server.server_close()
    write_json(output / "report.json", report)
    return report
