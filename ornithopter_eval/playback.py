"""Labelled interactive playback updates; archived submissions stay intact."""
import json
import re
from urllib.parse import parse_qs

from .checks import MECHANICAL_VERSION,MECHANICAL_LEGACY_VERSION,SOURCE_FIRST_VERSION,SOURCE_FIRST_VERSIONS,LATEST_SOURCE_FIRST_VERSION
CAMERA_PLAYBACK_VERSIONS=(MECHANICAL_VERSION,MECHANICAL_LEGACY_VERSION,*SOURCE_FIRST_VERSIONS)
from .runner import ROOT,digest


def powered_approach_playback(original):
    if b'releaseGlideForPower' in original:
        return original,False
    anchors=(b"import {E} from './engineering.mjs';",b'function requestDraw()',
             b'    controls.pitch=(keys.has',
             b'controls.throttle=+e.target.value;requestDraw();',
             b'GLIDE PRESET (Reset for powered flight)')
    if not all(anchor in original for anchor in anchors):
        return original,False
    function=b'''function engagePower(){
  const next=ready?releaseGlideForPower(state,controls.throttle,physics.parameters,wingPose):state;
  if(next!==state){state=next;previousState=copyPose(state);renderState=copyPose(state);accumulator=0;lastUI=0;}
}
'''
    updated=original.replace(anchors[0],anchors[0]+b"\nimport {releaseGlideForPower} from './flight-modes.mjs';",1)
    updated=updated.replace(anchors[1],function+anchors[1],1)
    updated=updated.replace(anchors[2],b'    engagePower();\n'+anchors[2],1)
    updated=updated.replace(anchors[3],b'controls.throttle=+e.target.value;engagePower();requestDraw();',1)
    return updated.replace(anchors[4],b'GLIDE (add throttle to engage wings)',1),True


def powered_approach_preset_playback(original):
    # Copy only the trusted host's preset function. Keep the archived renderer,
    # environment, model implementation and recorded initial-state evidence.
    pattern=rb'function preset\(approach=false\)\{.*?\n\}\n(?=function engagePower\()'
    source=(ROOT/'candidate/mechanical-v7/scaffold/environment/platform.mjs').read_bytes()
    current=re.search(pattern,source,re.S)
    recorded=re.search(pattern,original,re.S)
    if not current or not recorded:
        return original,False
    updated=original[:recorded.start()]+current[0]+original[recorded.end():]
    return updated,updated!=original


class CameraPlayback:
    def __init__(self, root):
        self.root=root
        self.files={}
        self.trials={}
        self.trial_files={}
        self.source_first=False
        self.approach_trials=[]
        self.approach_start_trials=[]
        self.capture_trials=[]
        experiment=json.loads((root/'experiment.json').read_text())
        if experiment.get('task_version') not in CAMERA_PLAYBACK_VERSIONS:
            return
        self.source_first=experiment.get('task_version') in SOURCE_FIRST_VERSIONS
        if not self.source_first:
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
            if self.source_first:
                # Preserve this trial's host and model physics. Explicitly label
                # the user-operated Approach control fix as playback only.
                original=platform.read_bytes()
                updated=original.replace(b'antialias:false',b'antialias:true',1).replace(
                    b'Math.min(devicePixelRatio,WORLD.pixel_ratio)',b'Math.min(devicePixelRatio,2)',1)
                updated,approach=powered_approach_playback(updated)
                updated,preset=powered_approach_preset_playback(updated)
                capture_files={}
                # Only the matching v7 host receives the capture studio. Its
                # physics/geometry and all other environment modules stay in
                # the saved packet; compatibility is checked by content hash.
                native=ROOT/'candidate/mechanical-v7/scaffold/environment'
                shared=('engineering.mjs','flight-modes.mjs','source-mechanism.mjs','view-motion.mjs','world.mjs','style.css','vendor/three.module.min.js','vendor/three.core.min.js')
                if (experiment['task_version']==LATEST_SOURCE_FIRST_VERSION and
                    all((directory/'submission/environment'/file).is_file() and
                        digest(directory/'submission/environment'/file)==digest(native/file) for file in shared)):
                    updated=(native/'platform.mjs').read_bytes()
                    recorded_capture=directory/'submission/environment/capture.mjs'
                    if updated!=original or not recorded_capture.is_file() or digest(recorded_capture)!=digest(native/'capture.mjs'):
                        capture_files={'capture.mjs':(native/'capture.mjs').read_bytes()}
                        self.capture_trials.append(name)
                if updated==original and not capture_files:
                    continue
                self.trial_files[name]={'platform.mjs':updated,**capture_files}
                if approach:
                    self.approach_trials.append(name)
                    self.trial_files[name]['flight-modes.mjs']=(ROOT/'candidate/mechanical-v7/scaffold/environment/flight-modes.mjs').read_bytes()
                if preset:
                    self.approach_start_trials.append(name)
            elif platform.read_bytes()!=self.files['platform.mjs']:
                self.trial_files[name]=self.files
            else:
                continue
            self.trials[name]=expected
        import hashlib
        self.provenance={'kind':'rendering and Approach-control interactive playback update' if self.source_first else 'camera-only interactive playback update',
            'original_files_rewritten':False,'scores_or_captures_changed':False,
            'model_physics_or_geometry_rewritten':False,'approach_controls_updated':self.approach_trials,
            'approach_start_updated':self.approach_start_trials,
            'capture_studio_updated':self.capture_trials,
            'capture_studio':{'resolution':[1920,1080],'fps':30,'durations_s':[8,12],
                              'exports':['browser-supported MP4/WebM','PNG'],
                              'camera':'presentation-only cinematic sweep; actual model flight'} if self.capture_trials else None,
            'approach_start':{'distance_before_runway_m':450,'height_above_local_gear_contact_m':100,
                              'airspeed_m_s':16,'pitch_rad':.1,'wing_omega_rad_s':6,'throttle':.9,'gliding':False,
                              'kind':'already-powered initial condition; not a glide restart or scored flight'} if self.approach_start_trials else None,
            'original_platform_sha256':self.trials,
            'playback_sha256':{} if self.source_first else {name:hashlib.sha256(data).hexdigest() for name,data in self.files.items()},
            'trial_playback_sha256':{trial:{name:hashlib.sha256(data).hexdigest() for name,data in files.items()} for trial,files in self.trial_files.items()},
            'original_playback':'Open a trial index.html?original=1 or use serve-artifacts --original-camera.'}

    def response(self, name, query=''):
        if not self.trials:
            return None
        if name=='viewer-camera.json':
            return (json.dumps(self.provenance,indent=2)+'\n').encode()
        if name=='index.html':
            description='Interactive playback updated:</strong> sharper rendering; adding throttle in Approach engages the powered wings.' if self.source_first else 'Interactive camera updated:</strong> centred chase view and smoother rendering.'
            if self.approach_start_trials:
                description='Interactive playback updated:</strong> Approach starts already flapping at 90% throttle, 450 m before the runway and 100 m above local ground contact.'
            if self.capture_trials:
                description+=' Open a simulator and choose Film a flyby for clean 1080p video and PNG exports.'
            banner=('<p role="status"><strong>'+description+' '
                    'Saved submissions, scores and grader captures retain the original rendering. '
                    '<a href="viewer-camera.json">Playback details</a></p>')
            return (self.root/name).read_text().replace('<body>','<body>'+banner,1).encode()
        match=re.fullmatch(r'trials/([^/]+)/submission/(index\.html|environment/(platform\.mjs|view-motion\.mjs|flight-modes\.mjs|capture\.mjs))',name)
        if not match or match[1] not in self.trials:
            return None
        original=parse_qs(query).get('original')==['1']
        if match[2]=='index.html':
            body=(self.root/name).read_text()
            if original:
                body=body.replace('src="./environment/platform.mjs"','src="./environment/platform.mjs?original=1"')
                note='Original recorded playback. <a href="index.html">Use updated rendering</a>.'
            else:
                note=('Updated playback: Approach throttle engages wings.' if self.source_first else 'Updated camera playback.')+' Saved trial and grades preserved. <a href="?original=1">Original playback</a>.'
                if match[1] in self.approach_start_trials:
                    note='Updated playback: Approach starts already flapping at 90% throttle, 450 m before the runway and 100 m above local ground contact. Saved trial and grades preserved. <a href="?original=1">Original playback</a>.'
            return body.replace('Shared scaffold · aircraft implementation pending.',note).encode()
        if original:
            return None
        return self.trial_files[match[1]].get(match[3])


def configure_camera_playback(server, root, enabled=True):
    if enabled:
        server.camera_playback=CameraPlayback(root)
