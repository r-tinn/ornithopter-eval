"""Add a mean-score chart and all ten raw verdicts to a saved ten-grader comparison."""
import argparse
from collections import defaultdict
import html
import json
from pathlib import Path
from statistics import mean

from analysis.plot_variance_results import plot
from ornithopter_eval.runner import ROOT, write_json


def summarize(out):
    data = json.loads((out/'results.json').read_text())
    if data['rubric'] not in ('airframe-binary-v4','airframe-binary-v5','airframe-binary-v6','airframe-binary-v7'):
        raise ValueError('Expected a supported ten-grader comparison')
    scores = defaultdict(list)
    for row in data['rows']:
        cohort = ROOT/row['cohort']
        exp = json.loads((cohort/'experiment.json').read_text())
        if exp['grading_revision'] != 'v7-launch-60-65-70-bank-v2':
            raise ValueError('Expected matching base flight graders')
        trial = next(t for t in exp['trials'] if t['id']==row['trial_id'])
        base_path = (out/row['full_report'] if 'full_report' in row else
                     cohort/'trials'/trial['id']/trial.get('grade_directory','grade')/'report.json')
        base = json.loads(base_path.read_text())
        if base['submission_sha256'] != row['submission_sha256']:
            raise ValueError('Base grade has a different submission identity')
        raw = {c['id']:c['pass'] for group in ('source','physics','interaction')
               for c in base['dimensions'][group]['checks']}
        if len(raw)!=7 or sum(raw.values())!=row['base_checks']:
            raise ValueError('Base verdicts do not match the saved score')
        verdicts = {**raw,**row['checks']}
        if len(verdicts)!=10 or any(type(v) is not bool for v in verdicts.values()):
            raise ValueError('Expected ten binary verdicts')
        expected = sum(verdicts.values()) if row['file_only_valid'] else 0
        if row['total']!=10 or row['points']!=expected:
            raise ValueError('Score does not match the file-only gate or the check outcomes')
        row['all_checks'] = verdicts
        scores[row['model']].append(expected)
        evidence = out/row['report'].replace('report.json','report.html')
        text = evidence.read_text().split('<section id="all-ten">',1)[0]
        table = ''.join(f'<tr><td>{html.escape(name.replace("_"," "))}</td>'
                        f'<td>{"Pass" if passed else "Fail"}</td></tr>'
                        for name,passed in verdicts.items())
        raw_link = '<p><a href="../report.json">Full grader report and flight evidence references</a></p>' if 'full_report' in row else ''
        evidence.write_text(text+f'<section id="all-ten"><h2>All ten checks</h2>'
                            f'<p>File-only audit: {"pass" if row["file_only_valid"] else "fail (score zeroed)"}. '
                            f'Scored result: {expected}/10.</p><table>{table}</table>{raw_link}</section>')
    if len(scores)!=6 or any(len(s)!=3 for s in scores.values()):
        raise ValueError('Expected six complete three-run cohorts by model')
    models = sorted(scores,key=lambda name:mean(scores[name]),reverse=True)
    summaries = [{'model':name,'scores':scores[name],'mean':mean(scores[name]),
                  'min':min(scores[name]),'max':max(scores[name])} for name in models]
    data['models'] = summaries
    write_json(out/'results.json',data)
    plot({'models':[{'model':m['model'],'combined_mean':m['mean']*10,
                    'combined_scores':[p*10 for p in m['scores']]} for m in summaries]},out,
         subtitle='Ten binary checks · three attempts per model')
    rows = ''.join(f'<tr><td>{html.escape(m["model"])}</td><td>{m["mean"]:.2f}/10</td>'
                   f'<td>{m["min"]}–{m["max"]}/10</td>'
                   f'<td>{", ".join(map(str,m["scores"]))}</td></tr>' for m in summaries)
    block = ('<!-- summary-start --><figure style="margin:0 0 24px"><img src="results.png" '
             'style="width:100%" alt="Mean score and observed range for six models"></figure>'
             '<h2>Model averages</h2><table><tr><th>Model</th><th>Mean</th>'
             f'<th>Observed range</th><th>Three scores (out of 10)</th></tr>{rows}</table>'
             '<h2>Individual runs</h2><p>Evidence shows the raw results for all ten graders.</p><!-- summary-end -->')
    index = out/'index.html'
    text = index.read_text()
    if '<!-- summary-start -->' in text:
        start, rem = text.split('<!-- summary-start -->',1)
        text = start+block+rem.split('<!-- summary-end -->',1)[1]
    else:
        text = text.replace('</p><table>', '</p>'+block+'<table>',1)
    index.write_text(text)


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('comparison',type=Path)
    summarize(p.parse_args().comparison)
