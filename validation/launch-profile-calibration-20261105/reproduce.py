"""Replay the archived author-only launch calibration without API calls."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess

from ornithopter_eval.checks import LATEST_SOURCE_FIRST_VERSION
from ornithopter_eval.world_candidate import prepare_world


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    parser.add_argument('--node', default='node')
    args = parser.parse_args()
    output = args.output.resolve()
    if output.exists():
        parser.error('Use a fresh directory; do not overwrite calibration evidence')
    bundle = Path(__file__).resolve().parent
    provenance = json.loads((bundle / 'provenance.json').read_text())
    packet = prepare_world(output / 'packet', reference=True,
                           task_version=LATEST_SOURCE_FIRST_VERSION)
    manifest = json.loads((packet / 'manifest.json').read_text())
    if any(manifest[key] != provenance[key] for key in ('input_sha256', 'readonly_sha256')):
        raise RuntimeError('Current task/world differs from the archived calibration')
    shutil.copytree(packet / 'submission', output / 'author')
    for file in (bundle / 'author').glob('*.mjs'):
        shutil.copyfile(file, output / 'author' / file.name)
    for name in ('search.mjs', 'coarse.json', 'timestep.json', 'rounded.json',
                 'extremes.json', 'source-probes.snapshot.mjs', 'power-validation.mjs'):
        shutil.copyfile(bundle / name, output / name)
    clean_env = {key: os.environ[key] for key in ('PATH', 'TMPDIR', 'SYSTEMROOT')
                 if key in os.environ}
    for batch in ('coarse', 'timestep', 'rounded', 'extremes'):
        subprocess.run([args.node, str(output / 'search.mjs'),
                        batch + '.json', batch + '-results.json'],
                       check=True, env=clean_env)
    subprocess.run([args.node, str(output / 'power-validation.mjs')],
                   check=True, env=clean_env)


if __name__ == '__main__':
    main()
