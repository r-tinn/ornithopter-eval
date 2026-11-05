"""Replay trusted author diagnostics offline into a fresh output directory."""
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
        parser.error('Use a fresh output directory to preserve evidence')
    bundle = Path(__file__).resolve().parent
    expected = json.loads((bundle / 'summary.json').read_text())
    packet = prepare_world(output / 'packet', reference=True,
                           task_version=LATEST_SOURCE_FIRST_VERSION)
    manifest = json.loads((packet / 'manifest.json').read_text())
    if any(manifest[key] != expected[key] for key in ('input_sha256', 'readonly_sha256')):
        raise RuntimeError('Current task/world differs from the archived witness; do not mix versions')
    shutil.copytree(packet / 'submission', output / 'author')
    for file in (bundle / 'author').glob('*.mjs'):
        shutil.copyfile(file, output / 'author' / file.name)
    for name in ('search.mjs', 'batch1.json', 'batch2.json', 'batch3.json',
                 'source-probes.snapshot.mjs', 'check-positive-power.mjs',
                 'check-positive-power-fine.mjs'):
        shutil.copyfile(bundle / name, output / name)
    clean_env = {key: os.environ[key] for key in ('PATH', 'TMPDIR', 'SYSTEMROOT')
                 if key in os.environ}
    for number in (1, 2, 3):
        subprocess.run([args.node, str(output / 'search.mjs'),
                        f'batch{number}.json', f'results{number}.json'],
                       env=clean_env, check=True)
    for name in ('check-positive-power.mjs', 'check-positive-power-fine.mjs'):
        subprocess.run([args.node, str(output / name)], env=clean_env, check=True)


if __name__ == '__main__':
    main()
