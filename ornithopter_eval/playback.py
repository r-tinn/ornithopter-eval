"""Labelled camera/rendering playback updates; archived submissions stay intact."""
import json
import re
from urllib.parse import parse_qs

from .checks import MECHANICAL_VERSION,MECHANICAL_LEGACY_VERSION,SOURCE_FIRST_VERSION
CAMERA_PLAYBACK_VERSIONS=(MECHANICAL_VERSION,MECHANICAL_LEGACY_VERSION,SOURCE_FIRST_VERSION)
from .runner import ROOT,digest


class CameraPlayback:
    def __init__(self, root):
        self.root=root
        self.files={}
        self.trials={}
        self.trial_files={}
        self.rendering_only=False
        experiment=json.loads((root/'experiment.json').read_text())
        if experiment.get('task_version') not in CAMERA_PLAYBACK_VERSIONS:
            return
        self.rendering_only=experiment.get('task_version')==SOURCE_FIRST_VERSION
        if not self.rendering_only:
            self.files={name:(ROOT/'candidate/mechanical-v4/scaffold/environment'/name).read_bytes()
                        for name in ('platform.mjs','view-motion.mjs')}
        for trial in experiment['trials']:
            name=trial['id']
            if not re.fullmatch(r'[a-z0-9][a-z0-9._-]{0,99}',name):
                raise ValueError('Invalid trial ID for playback')
            directory=root/'trials'/name
            manifest=json.loads((directory/'manifest.json').read_text())
            platform=directory/'submission/environment/platform.mjs'
            expected=manifest.get('readonly_sha256',{}).get('environment/platform.mjs')
            if not (manifest.get('task_version')==experiment.get('task_version') and expected
                    and platform.is_file() and digest(platform)==expected):
                continue
            if self.rendering_only:
                # Patch only rendering options in this trial's original host. Never
                # replace its simulation loop or copy a different version's host.
                original=platform.read_bytes()
                updated=original.replace(b'antialias:false',b'antialias:true',1).replace(
                    b'Math.min(devicePixelRatio,WORLD.pixel_ratio)',b'Math.min(devicePixelRatio,2)',1)
                if updated==original:
                    continue
                self.trial_files[name]={'platform.mjs':updated}
            elif platform.read_bytes()!=self.files['platform.mjs']:
                self.trial_files[name]=self.files
            else:
                continue
            self.trials[name]=expected
        import hashlib
        self.provenance={'kind':'rendering-only interactive playback update' if self.rendering_only else 'camera-only interactive playback update',
            'original_files_rewritten':False,'scores_or_captures_changed':False,
            'original_platform_sha256':self.trials,
            'playback_sha256':{} if self.rendering_only else {name:hashlib.sha256(data).hexdigest() for name,data in self.files.items()},
            'trial_playback_sha256':{trial:{name:hashlib.sha256(data).hexdigest() for name,data in files.items()} for trial,files in self.trial_files.items()},
            'original_playback':'Open a trial index.html?original=1 or use serve-artifacts --original-camera.'}

    def response(self, name, query=''):
        if not self.trials:
            return None
        if name=='viewer-camera.json':
            return (json.dumps(self.provenance,indent=2)+'\n').encode()
        if name=='index.html':
            description='Interactive rendering updated:</strong> antialiasing and Retina resolution (up to 2×).' if self.rendering_only else 'Interactive camera updated:</strong> centred chase view and smoother rendering.'
            banner=('<p role="status"><strong>'+description+' '
                    'Saved submissions, scores and grader captures retain the original rendering. '
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
                note='Original recorded rendering. <a href="index.html">Use updated rendering</a>.'
            else:
                note=('Sharper rendering playback.' if self.rendering_only else 'Updated camera playback.')+' Saved trial and grades preserved. <a href="?original=1">Original rendering</a>.'
            return body.replace('Shared scaffold · aircraft implementation pending.',note).encode()
        if original:
            return None
        return self.trial_files[match[1]].get(match[3])


def configure_camera_playback(server, root, enabled=True):
    if enabled:
        server.camera_playback=CameraPlayback(root)
