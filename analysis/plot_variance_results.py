"""Plot recorded task scores and identity-checked human ratings; never writes reviews."""
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


def plot(data, output):
    os.environ.setdefault('XDG_CACHE_HOME', str(ROOT / '.cache'))
    os.environ.setdefault('MPLCONFIGDIR', str(ROOT / '.cache/matplotlib'))
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.lines import Line2D
    plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 12,
                         'svg.fonttype': 'path', 'axes.titleweight': 'bold'})
    fig, axes = plt.subplots(1, 2, figsize=(13.6, 7.0), sharey=True)
    fig.patch.set_facecolor('#faf9f5')
    fig.subplots_adjust(left=.17, right=.92, bottom=.28, top=.75, wspace=.34)
    names = {'gpt-6.1-sol': 'GPT-6.1 Sol', 'gpt-6-astra': 'GPT-6 Astra',
             'gpt-5.6-sol': 'GPT-5.6 Sol', 'gpt-5.5': 'GPT-5.5', 'gpt-5.4': 'GPT-5.4'}
    for ax, scores, mean, color, title, ticks, limits in [
        (axes[0], 'task_scores', 'task_mean', '#216b68', 'Automated task score / 7', range(8), (-.25, 7.3)),
        (axes[1], 'human_scores', 'human_mean', '#ac5d32', 'Human aesthetic realism / 5', range(1, 6), (.75, 5.3))]:
        ax.set_facecolor('#faf9f5')
        for i, model in enumerate(data['models']):
            values = model[scores]
            ax.vlines(model[mean], i-.30, i+.30, color='#26363b', linewidth=2, zorder=2)
            ax.scatter(values, [i+offset for offset in (-.17, 0, .17)], s=75,
                       color=color, edgecolors='#faf9f5', linewidths=.8, zorder=3)
            ax.text(1.03, i, f'{model[mean]:.2f}', transform=ax.get_yaxis_transform(),
                    va='center', color='#26363b', fontsize=12)
        ax.set_title(title, loc='left', pad=27, fontsize=15, color='#26363b')
        ax.text(1.03, 1.035, 'Mean', transform=ax.transAxes, fontsize=10, color='#65716e')
        ax.set_xticks(list(ticks)); ax.set_xlim(limits); ax.set_ylim(4.6, -.6)
        ax.set_yticks(range(5), [names[m['model']] for m in data['models']])
        ax.grid(axis='x', color='#e0e3df', linewidth=.8)
        ax.set_axisbelow(True)
        for spine in ax.spines.values(): spine.set_visible(False)
        ax.tick_params(axis='both', length=0, pad=10, colors='#26363b')
    axes[0].set_xlabel('File-only policy failures score zero', labelpad=15, fontsize=11)
    axes[1].set_xlabel('1 = rough and unconvincing; 5 = exceptional', labelpad=15, fontsize=11)
    fig.text(.06, .93, 'Ornithopter eval: automated checks and human judgment',
             fontsize=22, weight='bold', color='#20383a')
    fig.text(.06, .87, 'Five models · three attempts each · all 15 human ratings recorded',
             fontsize=13, color='#65716e')
    fig.legend(handles=[Line2D([], [], marker='o', linestyle='None', color='#65716e', markersize=7, label='One attempt'),
                        Line2D([], [], marker='|', linestyle='None', color='#26363b', markersize=17, markeredgewidth=2, label='Mean of three attempts')],
               loc='lower center', bbox_to_anchor=(.52,.115), ncol=2, frameon=False, fontsize=11)
    fig.text(.06, .075, 'Human ratings: one reviewer (R-Tinn), ordinal 1–5 scale. No combined score; means are descriptive.', fontsize=10, color='#65716e')
    fig.text(.06, .035, 'Original cohort: 5 Nov 2026 · two additional attempts: 16 Nov 2026 · scoring: file-only-zero-v1', fontsize=10, color='#65716e')
    fig.savefig(output / 'results.png', dpi=200, facecolor=fig.get_facecolor())
    fig.savefig(output / 'results.svg', facecolor=fig.get_facecolor())
    plt.close(fig)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--comparison', type=Path, default=ROOT/'runs/source-first-v7-20261116-variance-two/variance-summary.json')
    parser.add_argument('--output', type=Path, default=ROOT/'reports/variance-20261116')
    parser.add_argument('--snapshot', type=Path, help='Replot an exported results.json without the local rating ledgers')
    args = parser.parse_args()
    data = json.loads(args.snapshot.read_text()) if args.snapshot else collect(args.comparison.resolve())
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output/'results.json').write_text(json.dumps(data, indent=2)+'\n')
    with (args.output/'results.csv').open('w', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=list(data['rows'][0]))
        writer.writeheader(); writer.writerows(data['rows'])
    plot(data, args.output)
    print(json.dumps(data['models'], indent=2))


if __name__ == '__main__':
    main()
