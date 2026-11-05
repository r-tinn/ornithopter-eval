import json
import tempfile
import unittest
from pathlib import Path
from ornithopter_eval.playback import CameraPlayback
from ornithopter_eval.runner import ROOT,digest,write_json
from ornithopter_eval.checks import MECHANICAL_VERSION,PILOTED_VERSION


class PlaybackTests(unittest.TestCase):
    def test_v5_is_never_replaced_with_the_old_v4_platform(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            write_json(root/'experiment.json',{'task_version':PILOTED_VERSION,'trials':[]})
            playback=CameraPlayback(root)
            self.assertFalse(playback.trials)
            self.assertIsNone(playback.response('index.html'))

    def test_camera_overlay_is_labelled_and_preserves_every_archived_byte(self):
        root=ROOT/'experiments/mechanical-v4-smoke-20261030'
        hashes={str(p.relative_to(root)):digest(p) for p in root.rglob('*') if p.is_file()}
        playback=CameraPlayback(root)
        self.assertEqual(len(playback.trials),2)
        prefix='trials/gpt-5.6-sol-01/submission/'
        self.assertIn(b'Interactive camera updated',playback.response('index.html'))
        self.assertIn(b'Updated camera playback',playback.response(prefix+'index.html'))
        original=playback.response(prefix+'index.html','original=1')
        self.assertIn(b'platform.mjs?original=1',original)
        self.assertIn(b'chaseView',playback.response(prefix+'environment/platform.mjs'))
        self.assertIn(b'nextFrameDeadline',playback.response(prefix+'environment/view-motion.mjs'))
        self.assertIsNone(playback.response(prefix+'environment/platform.mjs','original=1'))
        for name in ('physics.mjs','aircraft.mjs','interpretation.json','environment/world.mjs','environment/vendor/three.core.min.js'):
            self.assertIsNone(playback.response(prefix+name))
        self.assertIsNone(playback.response('trials/other/submission/environment/platform.mjs'))
        for name in ('summary.json','artifacts.zip','trials/gpt-5.6-sol-01/grade/report.json'):
            self.assertIsNone(playback.response(name))
        provenance=json.loads(playback.response('viewer-camera.json'))
        self.assertFalse(provenance['scores_or_captures_changed'])
        self.assertEqual(hashes,{str(p.relative_to(root)):digest(p) for p in root.rglob('*') if p.is_file()})

    def test_mismatched_archive_platform_is_never_silently_replaced(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp);trial=root/'trials/model-01';(trial/'submission/environment').mkdir(parents=True)
            (trial/'submission/environment/platform.mjs').write_text('// changed')
            write_json(root/'experiment.json',{'task_version':MECHANICAL_VERSION,'trials':[{'id':'model-01'}]})
            write_json(trial/'manifest.json',{'task_version':MECHANICAL_VERSION,'readonly_sha256':{'environment/platform.mjs':'wrong hash'}})
            self.assertFalse(CameraPlayback(root).trials)

    def test_v6_sharper_rendering_changes_only_two_options_and_keeps_archive_intact(self):
        root=ROOT/'experiments/source-first-v6-20261104-one-each'
        playback=CameraPlayback(root)
        self.assertEqual(len(playback.trials),2)
        self.assertIn(b'Interactive rendering updated',playback.response('index.html'))
        for trial in playback.trials:
            prefix=f'trials/{trial}/submission/'
            path=root/prefix/'environment/platform.mjs'
            before=digest(path)
            original=path.read_bytes()
            updated=playback.response(prefix+'environment/platform.mjs')
            self.assertEqual(updated,original.replace(b'antialias:false',b'antialias:true',1).replace(
                b'Math.min(devicePixelRatio,WORLD.pixel_ratio)',b'Math.min(devicePixelRatio,2)',1))
            self.assertIn(b'Sharper rendering playback',playback.response(prefix+'index.html'))
            self.assertIn(b'platform.mjs?original=1',playback.response(prefix+'index.html','original=1'))
            for name in ('environment/platform.mjs','physics.mjs','environment/world.mjs','environment/view-motion.mjs'):
                self.assertIsNone(playback.response(prefix+name,'original=1'))
            for name in ('physics.mjs','environment/world.mjs','environment/view-motion.mjs'):
                self.assertIsNone(playback.response(prefix+name))
            self.assertEqual(digest(path),before)
        provenance=json.loads(playback.response('viewer-camera.json'))
        self.assertEqual(provenance['kind'],'rendering-only interactive playback update')
        self.assertFalse(provenance['original_files_rewritten'])
        self.assertFalse(provenance['scores_or_captures_changed'])
