"""Offline clearance audit; no original reports are overwritten."""
import argparse
import http.server
import json
import os
from pathlib import Path
import subprocess
import threading

from ornithopter_eval.airframe import AirframeServer
from ornithopter_eval.runner import ROOT


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('comparison',type=Path)
    p.add_argument('output',type=Path)
    p.add_argument('--node',required=True)
    args=p.parse_args()
    rows=json.loads((args.comparison/'results.json').read_text())['rows']
    args.output.mkdir(parents=True)
    results=[]
    env={k:v for k,v in os.environ.items() if k in ('PATH','TMPDIR','SYSTEMROOT','DISPLAY')}
    env['PLAYWRIGHT_BROWSERS_PATH']=str(ROOT/'.cache/browsers')
    for i,row in enumerate(rows):
        if row['model'] not in ('gpt-6.1-sol','gpt-6.2-astra'):
            continue
        detail=next(c['detail'] for c in json.loads((args.comparison/row['report']).read_text())['checks'] if c['id']=='pilot_clearance')
        inputs=args.output/f'witnesses-{i}.json'
        inputs.write_text(json.dumps(detail['witnesses']))
        server=http.server.ThreadingHTTPServer(('127.0.0.1',0),AirframeServer)
        server.submission=ROOT/row['cohort']/'trials'/row['trial_id']/'submission'
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            result=json.loads(subprocess.check_output([args.node,str(ROOT/'analysis/audit_airframe_clearance.mjs'),f'http://127.0.0.1:{server.server_port}',str(inputs)],env=env,timeout=90,text=True))
            result.update(model=row['model'],trial=row['trial_id'],cohort=row['cohort'])
            results.append(result)
            print(json.dumps(result),flush=True)
        finally:
            server.shutdown();server.server_close();thread.join()
    (args.output/'audit.json').write_text(json.dumps(results,indent=2)+'\n')


if __name__=='__main__':
    main()
