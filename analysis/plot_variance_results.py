"""Plot the eight-grader overall score from recorded checks and verified ratings."""
import argparse
import csv
import hashlib
import json
import os
from pathlib import Path
import statistics
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from ornithopter_eval.aesthetics import AestheticStore


def collect(comparison):
    data = json.loads(comparison.read_text())
    roots = {data['baseline_cohort']: ROOT / data['baseline_artifact_directory'],
             data['additional_cohort']: comparison.parent}
    snapshots = {}
    ledgers = {}
    for cohort, root in roots.items():
        identity = AestheticStore(root, Path('/unused'), 'http://127.0.0.1', False).cohort_id
        ledger = ROOT / 'reviews/aesthetics' / (identity + '.jsonl')
        snapshot = AestheticStore(root, ledger, 'http://127.0.0.1', False).snapshot()
        snapshots[cohort] = {t['id']: t for t in snapshot['trials']}
        ledgers[cohort] = hashlib.sha256(ledger.read_bytes()).hexdigest()
    rows = []
    for model in data['models']:
        for trial in model['observations']:
            evidence = snapshots[trial['source_cohort']][trial['trial_id']]
            latest = evidence['latest']
            if evidence['error'] or not latest or latest['submission_digest'] != evidence['submission_digest']:
                raise ValueError('Missing or identity-mismatched human rating: ' + trial['trial_id'])
            rows.append({'model': model['model'], 'observation': trial['observation'],
                'cohort': trial['source_cohort'], 'trial_id': trial['trial_id'],
                'task_points': trial['passed'], 'raw_task_checks': trial['raw_passed'],
                'file_only_valid': trial['file_only_valid'], 'aesthetic_realism': latest['score'],
                'human_rating_revision': latest['revision'], 'human_rating_id': latest['id'],
                'human_rating_created_utc': latest['created_utc'],
                'submission_digest': evidence['submission_digest']})
    summaries = []
    for model in data['models']:
        subset = [r for r in rows if r['model'] == model['model']]
        summaries.append({'model': model['model'], 'n': len(subset),
            'task_scores': [r['task_points'] for r in subset],
            'task_mean': statistics.mean(r['task_points'] for r in subset),
            'human_scores': [r['aesthetic_realism'] for r in subset],
            'human_mean': statistics.mean(r['aesthetic_realism'] for r in subset)})
    return {'score_policy': data['score_policy'], 'rating_ledger_sha256': ledgers,
            'scope': 'Three attempts per model. Task points /7 include file-only failures as zero. Human aesthetic realism /5 is a separate ordinal rating by one reviewer. Descriptive means only; no combined score. Cohorts were generated on different dates; model aliases do not guarantee an immutable backend.',
            'rows': rows, 'models': summaries}


def combine(data):
    """Eight equally weighted graders; file-only violations gate the whole score."""
    for row in data['rows']:
        if type(row.get('file_only_valid')) is not bool:
            raise ValueError('A completed file-only audit is required')
        if type(row.get('raw_task_checks')) is not int or not 0 <= row['raw_task_checks'] <= 7:
            raise ValueError('Seven completed raw task checks are required')
        human = row['aesthetic_realism']
        if type(human) is not int or not 1 <= human <= 5:
            raise ValueError('A recorded human rating from 1 to 5 is required')
        row['combined_points'] = (row['raw_task_checks'] + human / 5
                                  if row['file_only_valid'] is True else 0)
        row['combined_percent'] = row['combined_points'] / 8 * 100
    for model in data['models']:
        rows = [r for r in data['rows'] if r['model'] == model['model']]
        model['combined_points'] = [r['combined_points'] for r in rows]
        model['combined_scores'] = [r['combined_percent'] for r in rows]
        model['combined_mean'] = statistics.mean(model['combined_scores'])
    data['overall_score_policy'] = 'eight-grader-equal-v1'
    data['combined_max_points'] = 8
    data['formula'] = 'If file-only audit passes: (raw task checks passed + human rating / 5) / 8 * 100. Otherwise: 0.'
    data['scope'] = 'Eight equally weighted graders: seven binary checks and one recorded human rating normalized by dividing by five. File-only violations zero the entire attempt. Three attempts per model; one human reviewer. Descriptive means, not a definitive ranking. Cohorts were generated on different dates; model aliases do not guarantee an immutable backend. Component scores and rating identity/revisions are preserved.'
    return data


def plot(data, output, *, subtitle="Three repeats · medium reasoning · eight-minute budget"):
    os.environ.setdefault('XDG_CACHE_HOME', str(ROOT / '.cache'))
    os.environ.setdefault('MPLCONFIGDIR', str(ROOT / '.cache/matplotlib'))
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 12,
                         'svg.fonttype': 'path', 'axes.titleweight': 'bold'})
    fig, ax = plt.subplots(figsize=(12, 7.2))
    fig.patch.set_facecolor('#ffffff')
    fig.subplots_adjust(left=.20, right=.79, bottom=.14, top=.76)
    ax.set_facecolor('#ffffff')
    names = {'gpt-6.2-astra': 'GPT-6.2 Astra', 'gpt-6.1-sol': 'GPT-6.1 Sol', 'gpt-6-astra': 'GPT-6 Astra',
             'gpt-5.6-sol': 'GPT-5.6 Sol', 'gpt-5.5': 'GPT-5.5', 'gpt-5.4': 'GPT-5.4'}
    models = sorted(data['models'], key=lambda m: m['combined_mean'], reverse=True)
    for i, model in enumerate(models):
        mean = model['combined_mean']
        ax.barh(i, mean, height=.62, color='#169c99', zorder=3)
        label = f'{mean:.1f}'.rstrip('0').rstrip('.') + '%'
        if mean < 8:
            ax.text(mean+1.5, i, label, va='center', color='#20383a', fontsize=13)
        else:
            ax.text(mean-1.5 if mean >= 18 else mean/2, i, label,
                    ha='right' if mean >= 18 else 'center', va='center',
                    color='white', fontsize=13)
        lo, hi = min(model['combined_scores']), max(model['combined_scores'])
        ax.text(1.075, i, f'{lo:.1f}–{hi:.1f}%', transform=ax.get_yaxis_transform(),
                va='center', color='#65716e', fontsize=11)
    ax.text(1.075, 1.055, 'Observed range', transform=ax.transAxes, fontsize=10, color='#65716e')
    ax.set_xticks(range(0, 101, 20), [f'{v}%' for v in range(0, 101, 20)])
    ax.set_xlim(0, 100); ax.set_ylim(len(models)-.45, -.65)
    ax.set_yticks(range(len(models)), [names.get(m['model'], m['model']) for m in models])
    ax.set_xlabel('Mean overall score', labelpad=14)
    ax.grid(axis='x', color='#e5e8e8', linewidth=.8); ax.set_axisbelow(True)
    for spine in ax.spines.values(): spine.set_visible(False)
    ax.tick_params(axis='both', length=0, pad=10, colors='#26363b')
    fig.text(.065, .925, 'Ornithopter eval', fontsize=27, weight='bold', color='#20383a')
    fig.text(.065, .855, subtitle, fontsize=12, color='#65716e')
    fig.savefig(output / 'results.png', dpi=200, facecolor=fig.get_facecolor())
    fig.savefig(output / 'results.svg', facecolor=fig.get_facecolor())
    svg = output / 'results.svg'
    svg.write_text('\n'.join(line.rstrip() for line in svg.read_text().splitlines())+'\n')
    plt.close(fig)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--comparison', type=Path, default=ROOT/'runs/source-first-v7-20261116-variance-two/variance-summary.json')
    parser.add_argument('--output', type=Path, default=ROOT/'reports/variance-20261116')
    parser.add_argument('--snapshot', type=Path, help='Replot an exported results.json without the local rating ledgers')
    args = parser.parse_args()
    data = json.loads(args.snapshot.read_text()) if args.snapshot else collect(args.comparison.resolve())
    data = combine(data)
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output/'results.json').write_text(json.dumps(data, indent=2)+'\n')
    with (args.output/'results.csv').open('w', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=list(data['rows'][0]), lineterminator='\n')
        writer.writeheader(); writer.writerows(data['rows'])
    plot(data, args.output)
    print(json.dumps(data['models'], indent=2))


if __name__ == '__main__':
    main()
