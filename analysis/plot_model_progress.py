"""Redraw the public model-generation chart from the saved scorecard."""
import json
import os
from pathlib import Path
from statistics import mean

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / 'reports/model-progress'
MODELS = {
    'gpt-5.4': 'GPT-5.4',
    'gpt-5.5': 'GPT-5.5',
    'gpt-5.6-sol': 'GPT-5.6 Sol',
    'gpt-6-astra': 'GPT-6 Astra',
    'gpt-6.1-sol': 'GPT-6.1 Sol',
    'gpt-6.2-astra': 'GPT-6.2 Astra',
}


def main():
    os.environ.setdefault('MPLCONFIGDIR', str(ROOT / '.cache/matplotlib'))
    os.environ.setdefault('XDG_CACHE_HOME', str(ROOT / '.cache'))
    os.environ.setdefault('SOURCE_DATE_EPOCH', '1794873600')
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    data = json.loads((REPORT / 'results.json').read_text())
    scores = {name: [] for name in MODELS}
    for run in data['runs']:
        points = sum(run['all_checks'].values()) if run['file_only_valid'] else 0
        if len(run['all_checks']) != 10 or run['total'] != 10 or points != run['points']:
            raise ValueError('Expected the complete ten-check score for each run')
        scores[run['model']].append(points)
    if any(len(runs) != 3 for runs in scores.values()):
        raise ValueError('Expected three saved runs per model')

    plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 11})
    fig, ax = plt.subplots(figsize=(10, 4.5), facecolor='#ffffff')
    fig.subplots_adjust(left=.08, right=.97, bottom=.17, top=.73)
    positions = range(len(MODELS))
    means = [mean(runs) for runs in scores.values()]
    ax.bar(positions, means, width=.55, color=['#216c69']*5+['#178d84'], zorder=3)
    for i, score in enumerate(means):
        ax.text(i, score+.21, f'{score:.2f}'.rstrip('0').rstrip('.'),
                ha='center', va='bottom', weight='bold', color='#20383a', fontsize=13)
    ax.set_xticks(list(positions), MODELS.values())
    ax.set_yticks([0,2,4,6,8,10])
    ax.set_ylim(0,10.8)
    ax.grid(axis='y', color='#dee7e5', linewidth=.8)
    ax.tick_params(length=0,pad=8,colors='#344d4b')
    for spine in ax.spines.values():
        spine.set_visible(False)
    fig.text(.08,.90,'Ornithopter eval',fontsize=24,weight='bold',color='#20383a')
    fig.text(.08,.82,'Mean score out of 10 · three saved runs per model',color='#526965')
    fig.text(.08,.046,'Model generation →',color='#526965',fontsize=10)
    fig.savefig(REPORT / 'progress.png', dpi=180)
    plt.close(fig)


if __name__ == '__main__':
    main()
