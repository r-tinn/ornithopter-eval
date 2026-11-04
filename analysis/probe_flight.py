"""Run saved physics in an isolated browser: python3 analysis/probe_flight.py --node /path/to/node."""
import argparse
import http.server
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import threading

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from ornithopter_eval.grading import SubmissionServer
from ornithopter_eval.runner import digest


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--node',default='node')
    parser.add_argument('--output',default=str(ROOT/'analysis/flight-probe.json'))
    args=parser.parse_args();output=Path(args.output).resolve()
    if output.exists():
        raise ValueError('Use a fresh output path; preserve prior diagnostics')
    cohort=ROOT/'experiments/mechanical-v4-smoke-20261030'
    if output.is_relative_to(cohort):
        raise ValueError('Diagnostics must be outside the immutable cohort')
    hashes=lambda:{str(p.relative_to(cohort)):digest(p) for p in cohort.rglob('*') if p.is_file()}
    before=hashes()
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),SubmissionServer);server.submission=cohort
    threading.Thread(target=server.serve_forever,daemon=True).start()
    env={k:os.environ[k] for k in ('PATH','TMPDIR','SYSTEMROOT','DISPLAY','PLAYWRIGHT_BROWSERS_PATH') if k in os.environ}
    if 'PLAYWRIGHT_BROWSERS_PATH' not in env and (ROOT/'.cache/browsers').exists():
        env['PLAYWRIGHT_BROWSERS_PATH']=str(ROOT/'.cache/browsers')
    try:
        process=subprocess.Popen([args.node,str(ROOT/'analysis/probe-flight.mjs'),f'http://127.0.0.1:{server.server_port}',str(output)],env=env,start_new_session=True)
        try:
            process.wait(timeout=90)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid,signal.SIGKILL);process.wait()
            raise ValueError('Diagnostic timed out; partial evidence retained') from None
        if process.returncode:
            raise ValueError('Browser diagnostic failed; evidence retained')
        if before!=hashes():
            raise ValueError('Saved cohort changed during diagnostics')
        report=json.loads(output.read_text());report['archive_unchanged']=True
        report['source_sha256']={name:before[name] for name in before if name.endswith('/physics.mjs')}
        report['probe_sha256']=digest(ROOT/'analysis/probe-flight.mjs')
        output.write_text(json.dumps(report,indent=2,allow_nan=False)+'\n')
        print(output)
    finally:
        server.shutdown();server.server_close()


if __name__=='__main__':
    main()
