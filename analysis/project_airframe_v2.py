"""Project saved v1 results onto the ten retained binary checks without regrading."""
import argparse
import html
import json
from pathlib import Path

from ornithopter_eval.airframe import scored_checks


def project(source, output):
    source, output = source.resolve(), output.resolve()
    data = json.loads((source/'results.json').read_text())
    if data['rubric'] != 'airframe-binary-v1' or output.parent != source.parent:
        raise ValueError('Use a v1 comparison and a fresh sibling output directory')
    data['rubric'] = 'airframe-binary-v2'
    data['source'] = '../'+source.name+'/results.json'
    expected = scored_checks(data['rubric'])
    ids = ['pilot_clearance', 'wing_drive_linkage', 'wingtip_motion_continuity']
    rows = []
    for row in data['rows']:
        row['checks'] = checks = {k:v for k,v in row['checks'].items() if k in expected}
        if set(checks) != expected or any(type(v) is not bool for v in checks.values()):
            raise ValueError('Missing binary evidence')
        row['total'] = 10
        row['points'] = row['base_checks'] + sum(checks.values()) if row['file_only_valid'] else 0
        row['report'] = '../'+source.name+'/'+row['report']
        cells = [html.escape(row['trial_id']), str(row['base_checks']),
                 *('Pass' if checks[i] else 'Fail' for i in ids),
                 str(row['points'])+'/10'+(' (invalid)' if not row['file_only_valid'] else ''),
                 f'<a href="{html.escape(row["simulator"],quote=True)}">Fly</a> · '
                 f'<a href="{html.escape(row["report"].replace("report.json","report.html"),quote=True)}">Original evidence</a>']
        rows.append('<tr>'+''.join(f'<td>{cell}</td>' for cell in cells)+'</tr>')
    output.mkdir()
    (output/'results.json').write_text(json.dumps(data,indent=2)+'\n')
    (output/'index.html').write_text(
        '<!doctype html><meta charset="utf-8"><title>Airframe review v2</title>'
        '<style>body{font:16px system-ui;margin:40px auto;max-width:1200px;padding:0 20px}'
        'td,th{padding:10px;text-align:left;border-bottom:1px solid #ddd}</style>'
        '<h1>Deterministic airframe review · /10</h1>'
        '<p>Retrospective comparison. Rear truss removed from scoring. All retained '
        'verdicts and the file-only gate are unchanged. Evidence links open the original /11 inspections.</p>'
        '<table><tr><th>Trial</th><th>Original /7</th><th>Pilot clearance</th><th>Wing drive</th>'
        '<th>Tip motion</th><th>Total /10</th><th>Inspect</th></tr>'
        +''.join(rows)+'</table><p><a href="results.json">Results JSON</a></p>')


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('source',type=Path)
    p.add_argument('output',type=Path)
    args = p.parse_args()
    project(args.source,args.output)
