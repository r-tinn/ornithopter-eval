"""Self-contained v4 review packets. Candidate tasks cannot start model trials."""
import http.server
import json
import shutil
import os
import subprocess
import threading
import signal
from datetime import datetime,timezone
from pathlib import Path

from .experiment import ArtifactServer
from .policy import FilePolicy, PolicyError
from .runner import ROOT, digest, verify_sources, write_json

CANDIDATE = ROOT / 'candidate/mechanical-v4'
EDITABLE = ('aircraft.mjs', 'physics.mjs', 'interpretation.json')


def prepare_world(output, reference=False):
    output = Path(output).resolve()
    if output.exists():
        raise ValueError('Use a fresh output directory; existing review packets are preserved')
    sources = verify_sources()
    output.mkdir(parents=True)
    inputs = output / 'inputs'
    inputs.mkdir()
    for name in ('TASK.md','SOURCE_GUIDE.md','AIRCRAFT_API.md','engineering.json'):
        shutil.copyfile(CANDIDATE / name, inputs / name)
    (inputs / 'sources').mkdir()
    for source in sources:
        shutil.copyfile(ROOT / 'task/sources' / source['file'],inputs / 'sources' / source['file'])
    submission = output / 'submission'
    shutil.copytree(CANDIDATE / 'scaffold',submission)
    if reference:
        for name in EDITABLE:
            fixture = ROOT / 'fixtures/mechanical-v4' / name
            if fixture.exists():
                shutil.copyfile(fixture,submission / name)
    hashes = {str(p.relative_to(submission)):digest(p) for p in sorted(submission.rglob('*')) if p.is_file()}
    write_json(output / 'manifest.json',{
        'task_version':'mechanical-v4-draft','status':'review_candidate',
        'reference_fixture':bool(reference),'not_a_model_submission':bool(reference),
        'editable_files':['submission/'+name for name in EDITABLE],
        'readonly_sha256':{name:sha for name,sha in hashes.items() if name not in EDITABLE},
        'input_sha256':{str(p.relative_to(output)):digest(p) for p in sorted(inputs.rglob('*')) if p.is_file()},
        'config':{'max_output_tokens_total':32000,'reasoning_effort':'medium','output_token_notice_percentages':[50,75]},
        'grading_status':'proposed checklist for review; not a scored model trial',
        'runtime_dependencies':'Only files inside this packet; no original-project paths, package install or network assets',
    })
    return output


class CandidateFilePolicy(FilePolicy):
    """The existing native file tools, limited to the three aircraft-owned files."""
    def __init__(self, root, max_bytes=2_000_000):
        super().__init__(root,max_bytes)
        manifest=json.loads((self.root / 'manifest.json').read_text())
        if manifest.get('task_version')!='mechanical-v4-draft' or manifest.get('reference_fixture'):
            raise PolicyError('Use an empty v4 candidate packet for model file operations')
        self.editable=set(manifest['editable_files'])

    def path(self, name, write=False):
        result=super().path(name,write)
        if write and str(result.relative_to(self.root)) not in self.editable:
            raise PolicyError('Only aircraft.mjs, physics.mjs and interpretation.json are writable; the world is fixed')
        return result


def serve_world(directory, port=8766):
    directory=Path(directory).resolve()
    manifest=json.loads((directory / 'manifest.json').read_text())
    if manifest.get('task_version')!='mechanical-v4-draft':
        raise ValueError('Select a prepared v4 world-review packet')
    for name,sha in manifest['readonly_sha256'].items():
        if digest(directory / 'submission' / name)!=sha:
            raise ValueError('Shared world changed: '+name)
    server=http.server.ThreadingHTTPServer(('127.0.0.1',port),ArtifactServer)
    server.artifact_root=directory / 'submission'
    print(f'Shared-world candidate: http://127.0.0.1:{server.server_port}/',flush=True)
    try:
        server.serve_forever()
    finally:
        server.server_close()


def validate_world(node='node'):
    """Regression-check the supplied world and withheld fixture, never an API trial."""
    stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    packet=prepare_world(ROOT / 'runs' / ('world-review-'+stamp),reference=True)
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),ArtifactServer)
    server.artifact_root=packet / 'submission'
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    env={k:os.environ[k] for k in ('PATH','TMPDIR','SYSTEMROOT','DISPLAY','PLAYWRIGHT_BROWSERS_PATH') if k in os.environ}
    if 'PLAYWRIGHT_BROWSERS_PATH' not in env and (ROOT / '.cache/browsers').exists():
        env['PLAYWRIGHT_BROWSERS_PATH']=str(ROOT / '.cache/browsers')
    try:
        with (packet / 'browser-review.log').open('w') as log:
            process=subprocess.Popen([node,str(ROOT/'grader/world-review.mjs'),f'http://127.0.0.1:{server.server_port}',str(packet)],env=env,stdout=log,stderr=log,start_new_session=True)
            try:
                returncode=process.wait(timeout=90)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid,signal.SIGKILL);process.wait()
                raise ValueError('World review timed out; evidence retained in '+str(packet)) from None
        report_path=packet / 'world-review.json'
        if not report_path.exists():
            raise ValueError('World review produced no report; see '+str(packet/'browser-review.log'))
        report=json.loads(report_path.read_text())
        report['shared_sha256']=json.loads((packet/'manifest.json').read_text())['readonly_sha256']
        report['fixture_sha256']={name:digest(packet/'submission'/name) for name in EDITABLE}
        report['reviewer_sha256']=digest(ROOT/'grader/world-review.mjs')
        write_json(report_path,report)
        if returncode or not report.get('passed'):
            raise ValueError('World review failed; evidence retained in '+str(packet))
        write_json(ROOT/'validation/world-review.json',report)
        shutil.copyfile(packet/'preview-chase.png',ROOT/'validation/world-preview.png')
        print('World review passed; evidence: '+str(packet))
        return report
    finally:
        server.shutdown();server.server_close()
