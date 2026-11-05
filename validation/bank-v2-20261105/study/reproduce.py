"""Replay the frozen author bank study, offline, into a fresh directory."""
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
        parser.error('Use a fresh output directory; previous evidence is preserved')
    bundle = Path(__file__).resolve().parent
    summary = json.loads((bundle / 'summary.json').read_text())
    packet = prepare_world(output / 'packet', reference=True,
                           task_version=LATEST_SOURCE_FIRST_VERSION)
    manifest = json.loads((packet / 'manifest.json').read_text())
    if any(manifest[key] != summary[key] for key in ('input_sha256', 'readonly_sha256')):
        raise RuntimeError('Current packet differs from the archived study')
    shutil.copytree(packet / 'submission', output / 'author')
    for file in (bundle / 'author').glob('*.mjs'):
        shutil.copyfile(file, output / 'author' / file.name)
    for name in ('run-author.mjs', 'source-probes.snapshot.mjs',
                 'author-candidates.json', 'reference-validation.json'):
        shutil.copyfile(bundle / name, output / name)
    clean = {key: os.environ[key] for key in ('PATH', 'TMPDIR', 'SYSTEMROOT')
             if key in os.environ}
    for batch, result in [('author-candidates', 'author-results'),
                          ('reference-validation', 'reference-validation-results')]:
        subprocess.run([args.node, str(output / 'run-author.mjs'),
                        batch + '.json', result + '.json'], env=clean, check=True)


if __name__ == '__main__':
    main()
