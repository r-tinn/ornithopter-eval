"""Run only the new binary wheel check against an immutable saved cohort."""
import http.server
import json
import os
import signal
import subprocess
import threading
from pathlib import Path
from .runner import ROOT,digest,write_json
from .grading import SubmissionServer
from .checks import MECHANICAL_VERSIONS


def audit_wheels(experiment,output,node='node'):
    experiment,output=Path(experiment).resolve(),Path(output).resolve()
    if output.is_relative_to(experiment):
        raise ValueError('Write the post-hoc audit outside the immutable cohort')
    if output.exists():
        raise ValueError('Use a fresh audit directory; preserve prior findings')
    metadata=json.loads((experiment/'experiment.json').read_text())
    if metadata.get('task_version') not in MECHANICAL_VERSIONS:
        raise ValueError('The wheel audit needs a mechanical cohort')
    before={str(p.relative_to(experiment)):digest(p) for p in experiment.rglob('*') if p.is_file()}
    items=[]
    for item in metadata['trials']:
        trial=experiment/'trials'/item['id'];submission=trial/'submission'
        if not submission.resolve().is_relative_to(experiment):
            raise ValueError('Trial escapes the cohort')
        manifest=json.loads((trial/'manifest.json').read_text())
        actual={str(p.relative_to(submission)):digest(p) for p in submission.rglob('*') if p.is_file()}
        if manifest.get('status') not in ('submitted','budget_exhausted') or actual!=manifest.get('submission_sha256'):
            raise ValueError('A saved submission changed or is not gradable: '+item['id'])
        items.append({'trial':item['id'],'model':item['model'],'submission':'trials/'+item['id']+'/submission'})
    output.mkdir(parents=True);write_json(output/'inputs.json',items)
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),SubmissionServer);server.submission=experiment
    threading.Thread(target=server.serve_forever,daemon=True).start()
    env={k:os.environ[k] for k in ('PATH','TMPDIR','SYSTEMROOT','DISPLAY','PLAYWRIGHT_BROWSERS_PATH') if k in os.environ}
    if 'PLAYWRIGHT_BROWSERS_PATH' not in env and (ROOT/'.cache/browsers').exists():
        env['PLAYWRIGHT_BROWSERS_PATH']=str(ROOT/'.cache/browsers')
    try:
        with (output/'audit.log').open('w') as log:
            process=subprocess.Popen([node,str(ROOT/'grader/wheel-axis-review.mjs'),f'http://127.0.0.1:{server.server_port}',str(output),str(output/'inputs.json')],env=env,stdout=log,stderr=log,start_new_session=True)
            try:process.wait(timeout=90)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid,signal.SIGKILL);process.wait();raise ValueError('Wheel audit timed out; evidence retained') from None
        report=json.loads((output/'wheel-axis.json').read_text())
        after={str(p.relative_to(experiment)):digest(p) for p in experiment.rglob('*') if p.is_file()}
        if before!=after:raise ValueError('Cohort files changed during the audit')
        if report.get('infrastructure_error'):raise ValueError(report['infrastructure_error'])
        report.update(archive_sha256=before,archive_unchanged=True,source_cohort=str(experiment),
            grader_sha256={name:digest(ROOT/'grader'/name) for name in ('wheel-axis.mjs','wheel-axis-review.mjs')})
        write_json(output/'wheel-axis.json',report)
        return report
    finally:server.shutdown();server.server_close()
