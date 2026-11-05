"""Run only the new stability probe on an unchanged archived submission."""
import argparse
import http.server
import json
import os
from pathlib import Path
import subprocess
import threading

from ornithopter_eval.grading import SubmissionServer
from ornithopter_eval.runner import ROOT,digest,write_json


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('submission',type=Path);parser.add_argument('output',type=Path)
    parser.add_argument('--node',required=True);args=parser.parse_args()
    submission=args.submission.resolve();output=args.output.resolve()
    if output.exists():raise ValueError('Use a new output directory; retain every observation')
    output.mkdir(parents=True)
    before={str(p.relative_to(submission)):digest(p) for p in submission.rglob('*') if p.is_file()}
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),SubmissionServer)
    server.submission=submission
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    clean={k:v for k,v in os.environ.items() if k in ('PATH','TMPDIR','SYSTEMROOT','DISPLAY')}
    clean['PLAYWRIGHT_BROWSERS_PATH']=str(ROOT/'.cache/browsers')
    try:
        with (output/'browser.log').open('w') as log:
            subprocess.run([args.node,str(ROOT/'grader/source-calibrate.mjs'),
                            f'http://127.0.0.1:{server.server_port}',str(output/'browser-results.json'),'stability'],
                           env=clean,stdout=log,stderr=log,timeout=120,check=True)
        after={str(p.relative_to(submission)):digest(p) for p in submission.rglob('*') if p.is_file()}
        if before!=after:raise ValueError('Archived submission changed')
        raw=json.loads((output/'browser-results.json').read_text())
        verdict=raw['physics'][0]
        write_json(output/'summary.json',{'scope':'Post-submission regression demonstration; no model trial or new full-task score',
                                         'submission_sha256':before,'grader_sha256':digest(ROOT/'grader/pitch-stability.mjs'),
                                         'id':verdict['id'],'pass':verdict['pass'],
                                         'slow_pitch_range_deg':verdict['detail'].get('slow_pitch_range_deg'),
                                         'large_reversals':len(verdict['detail'].get('reversals',[])),
                                         'error':verdict['detail'].get('error')})
        print((output/'summary.json').read_text())
    finally:
        server.shutdown();server.server_close();thread.join()


if __name__=='__main__':main()
