"""Versioned, deterministic supplemental airframe checks. No LLM or human judge."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import threading
import http.server

from .airframe_versions import AIRFRAME_BROWSER_REVISIONS, AIRFRAME_GRADING_REVISION, AIRFRAME_REVISIONS
from .grading import SubmissionServer
from .runner import ROOT, digest, write_json

RUBRIC = ROOT/'grader/protocols/airframe-binary-v1.json'
CHECKS = {'pilot_clearance','wing_drive_linkage','rear_truss_structure','wingtip_motion_continuity'}


def scored_checks(revision):
    if revision in AIRFRAME_REVISIONS[1:]:
        return CHECKS - {'rear_truss_structure'}
    return CHECKS


def require_calibration(revision=None):
    revised = revision in AIRFRAME_BROWSER_REVISIONS
    pin = revision if revised else AIRFRAME_GRADING_REVISION
    path = ROOT / 'validation' / (pin + '.json')
    if not path.is_file():
        raise ValueError('Airframe rubric has no adopted calibration')
    record = json.loads(path.read_text())
    if revised:
        index = AIRFRAME_BROWSER_REVISIONS.index(revision)
        require_calibration(AIRFRAME_BROWSER_REVISIONS[index - 1] if index else None)
    reference = 'reference_all_ten_pass' if revised else 'reference_all_eleven_pass'
    if record.get('all_passed') is not True or record.get(reference) is not True:
        raise ValueError('Airframe calibration or full reference failed')
    for name, sha in record['kernel_sha256'].items():
        if digest(ROOT / name) != sha:
            raise ValueError('Airframe kernel changed; recalibrate before scoring: ' + name)
    return record


def kernel_paths(revision):
    grader = ROOT / 'grader'
    suffix = f'-{revision[-2:]}' if revision in AIRFRAME_BROWSER_REVISIONS else ''
    browser = grader / f'airframe-evidence{suffix}.mjs'
    libraries = [grader / 'airframe-geometry.mjs']
    if suffix in ('-v5', '-v6', '-v7'):
        drive = 'wing-drive-v5.mjs' if suffix == '-v5' else 'wing-drive-v6.mjs'
        libraries.extend((grader / drive, grader / 'head-clearance.mjs'))
    elif suffix:
        libraries.append(grader / 'wing-drive.mjs')
    return browser, [RUBRIC, browser, Path(__file__), *libraries]


class AirframeServer(SubmissionServer):
    def do_GET(self):
        modules={'/__airframe-geometry.mjs':'airframe-geometry.mjs','/__wing-drive.mjs':'wing-drive.mjs','/__wing-drive-v5.mjs':'wing-drive-v5.mjs','/__wing-drive-v6.mjs':'wing-drive-v6.mjs','/__head-clearance.mjs':'head-clearance.mjs'}
        if self.path in modules:
            body=(ROOT/'grader'/modules[self.path]).read_bytes()
            self.send_response(200);self.send_header('Content-Type','text/javascript')
            self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
        else:
            super().do_GET()


def inspect(submission, output, node='node', *, revision=None):
    browser, kernels = kernel_paths(revision)
    # Revision 2's report retains revision 1's raw truss diagnostic.
    expected = scored_checks(revision) if revision in AIRFRAME_BROWSER_REVISIONS else CHECKS
    submission,output=Path(submission).resolve(),Path(output).resolve()
    if not submission.is_dir() or output.exists():
        raise ValueError('Use an existing submission and a fresh output directory')
    hashes={str(p.relative_to(submission)):digest(p) for p in sorted(submission.rglob('*')) if p.is_file()}
    output.mkdir(parents=True)
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),AirframeServer);server.submission=submission
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    env={k:v for k,v in os.environ.items() if k in ('PATH','TMPDIR','DISPLAY','SYSTEMROOT','PLAYWRIGHT_BROWSERS_PATH')}
    if (ROOT / '.cache/browsers').exists():
        env.setdefault('PLAYWRIGHT_BROWSERS_PATH', str(ROOT / '.cache/browsers'))
    result={'rubric':revision or 'airframe-binary-v1','kind':'deterministic supplemental inspection',
            'submission_sha256':hashes,'grader_sha256':{str(p.relative_to(ROOT)):digest(p) for p in kernels},
            'status':'partial','checks':[],'original_grades_unchanged':True,
            'scope':'Retrospective application of new requirements is exploratory; no new model generation, no human ratings and no LLM judges.'}
    try:
        with (output/'capture.log').open('w') as log:
            subprocess.run([node,str(browser),f'http://127.0.0.1:{server.server_port}',str(output)],env=env,stdout=log,stderr=log,timeout=240,check=True)
        measured=json.loads((output/'measurements.json').read_text())
        if (len(measured['checks']) != len(expected)
                or {c['id'] for c in measured['checks']} != expected
                or any(type(c['pass']) is not bool for c in measured['checks'])):
            raise ValueError('Incomplete or invalid binary check output')
        if hashes != {str(p.relative_to(submission)): digest(p)
                      for p in sorted(submission.rglob('*')) if p.is_file()}:
            raise ValueError('Submission changed during inspection')
        result.update(status='completed',checks=measured['checks'],passed=sum(c['pass'] for c in measured['checks']),total=len(expected),evidence=json.loads((output/'evidence.json').read_text()))
    except Exception as exc:
        result.update(status='inspection_error',error=str(exc))
    finally:
        server.shutdown();server.server_close();thread.join()
    write_json(output/'report.json',result)
    return result


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('submission');p.add_argument('--output',required=True);p.add_argument('--node',default='node')
    args=p.parse_args();r=inspect(args.submission,args.output,args.node)
    print(json.dumps({k:r.get(k) for k in ('status','passed','total','error')}))
    return 0 if r['status']=='completed' else 1


if __name__=='__main__':raise SystemExit(main())
