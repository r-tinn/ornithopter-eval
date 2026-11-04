"""Labelled camera-only playback updates. Published files are never rewritten."""
import json
import re
from urllib.parse import parse_qs

from .checks import MECHANICAL_VERSION,MECHANICAL_LEGACY_VERSION
CAMERA_PLAYBACK_VERSIONS=(MECHANICAL_VERSION,MECHANICAL_LEGACY_VERSION)
from .runner import ROOT,digest


class CameraPlayback:
    def __init__(self, root):
        self.root=root
        self.files={name:(ROOT/'candidate/mechanical-v4/scaffold/environment'/name).read_bytes()
                    for name in ('platform.mjs','view-motion.mjs')}
        self.trials={}
        experiment=json.loads((root/'experiment.json').read_text())
        if experiment.get('task_version') not in CAMERA_PLAYBACK_VERSIONS:
            return
        for trial in experiment['trials']:
            name=trial['id']
            if not re.fullmatch(r'[a-z0-9][a-z0-9._-]{0,99}',name):
                raise ValueError('Invalid trial ID for playback')
            directory=root/'trials'/name
            manifest=json.loads((directory/'manifest.json').read_text())
            platform=directory/'submission/environment/platform.mjs'
            expected=manifest.get('readonly_sha256',{}).get('environment/platform.mjs')
            if (manifest.get('task_version') in CAMERA_PLAYBACK_VERSIONS and expected and
                    platform.is_file() and digest(platform)==expected and
                    platform.read_bytes()!=self.files['platform.mjs']):
                self.trials[name]=expected
        import hashlib
        self.provenance={'kind':'camera-only interactive playback update',
            'original_files_rewritten':False,'scores_or_captures_changed':False,
            'original_platform_sha256':self.trials,
            'playback_sha256':{name:hashlib.sha256(data).hexdigest() for name,data in self.files.items()},
            'original_playback':'Open a trial index.html?original=1 or use serve-artifacts --original-camera.'}

    def response(self, name, query=''):
        if not self.trials:
            return None
        if name=='viewer-camera.json':
            return (json.dumps(self.provenance,indent=2)+'\n').encode()
        if name=='index.html':
            banner=('<p role="status"><strong>Interactive camera updated:</strong> centred chase view and smoother rendering. '
                    'Saved submissions, scores and grader captures retain the original camera. '
                    '<a href="viewer-camera.json">Playback details</a></p>')
            return (self.root/name).read_text().replace('<body>','<body>'+banner,1).encode()
        match=re.fullmatch(r'trials/([^/]+)/submission/(index\.html|environment/(platform\.mjs|view-motion\.mjs))',name)
        if not match or match[1] not in self.trials:
            return None
        original=parse_qs(query).get('original')==['1']
        if match[2]=='index.html':
            body=(self.root/name).read_text()
            if original:
                body=body.replace('src="./environment/platform.mjs"','src="./environment/platform.mjs?original=1"')
                note='Original recorded camera. <a href="index.html">Use updated camera</a>.'
            else:
                note='Updated camera playback. Saved trial and grades preserved. <a href="?original=1">Original camera</a>.'
            return body.replace('Shared scaffold · aircraft implementation pending.',note).encode()
        if original:
            return None
        return self.files[match[3]]


def configure_camera_playback(server, root, enabled=True):
    if enabled:
        server.camera_playback=CameraPlayback(root)
