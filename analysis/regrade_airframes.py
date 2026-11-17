"""Retrospective supplemental geometry comparison. No generation or API calls."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import html
import json
from pathlib import Path
from ornithopter_eval.airframe import inspect,require_calibration,scored_checks
from ornithopter_eval.experiment import automated_result
from ornithopter_eval.grading import grade_submission
from ornithopter_eval.runner import ROOT,digest,write_json


def evidence_page(directory, report):
    checks=''.join('<tr><td>'+html.escape(c['id'])+'</td><td>'+('Pass' if c['pass'] else 'Fail')+'</td></tr>' for c in report['checks'])
    figures=''.join('<figure><figcaption>'+html.escape(name)+'</figcaption><img src="'+html.escape(name,quote=True)+'"></figure>' for names in report['evidence'].values() for name in names)
    (directory/'report.html').write_text('<!doctype html><meta charset="utf-8"><title>Deterministic mesh evidence</title><style>body{font:16px system-ui;max-width:1400px;margin:32px auto;padding:16px}td{padding:12px}img{max-width:100%}figure{margin:32px 0}</style><p><a href="#all-ten">All ten verdicts</a> · <a href="report.json">Raw measurements and 3D collision witnesses</a></p><h1>Deterministic mesh evidence</h1><p>Phase-labelled rendered views are for inspection; no visual/LLM judge scored these images.</p><table>'+checks+'</table>'+figures)


def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',type=Path,required=True);p.add_argument('--node',required=True);p.add_argument('--revision',choices=('airframe-binary-v1','airframe-binary-v3','airframe-binary-v4','airframe-binary-v5','airframe-binary-v6','airframe-binary-v7'),default='airframe-binary-v1');p.add_argument('--model');p.add_argument('--rerun-all',action='store_true',help='Rerun all ten local checks, including the seven base graders');p.add_argument('--jobs',type=int,default=1);args=p.parse_args();out=args.output.resolve()
 if out.exists():raise ValueError('Fresh output required')
 require_calibration(args.revision);total=7+len(scored_checks(args.revision));out.mkdir(parents=True)
 cohorts=[('experiments/source-first-v7-20261105-bank-v2-regrade',8776),('runs/source-first-v7-20261116-variance-two',8777),('runs/source-first-v7-20261117-gpt62-astra-3x',8778)]
 jobs=[]
 for directory,port in cohorts:
  root=ROOT/directory;exp=json.loads((root/'experiment.json').read_text())
  for t in exp['trials']:
   if not args.model or t['model']==args.model:jobs.append((directory,port,t))

 def grade(job):
   directory,port,t=job
   root=ROOT/directory
   sub=root/'trials'/t['id']/'submission';m=json.loads((sub.parent/'manifest.json').read_text())
   actual={str(p.relative_to(sub)):digest(p) for p in sorted(sub.rglob('*')) if p.is_file()}
   if actual!=m['submission_sha256']:raise ValueError('Immutable submission mismatch: '+str(sub))
   target=out/(root.name+'--'+t['id'])
   full_path=None
   if args.rerun_all:
    full_path=target/'grade/report.json'
    full=grade_submission(sub,full_path.parent,node=args.node,task_version=m['task_version'],grading_revision=args.revision)
    automated=automated_result(full)
    if not automated or automated['total']!=total:raise ValueError('Grading incomplete: '+str(full_path))
    base=sum(g['passed'] for key,g in automated['groups'].items() if key!='airframe')
    target=full_path.parent/'airframe'
    r=json.loads((target/'report.json').read_text())
   else:
    r=inspect(sub,target,args.node,revision=args.revision)
    base=t['automated']['passed']
   if r['status']!='completed':raise ValueError('Inspection error: '+str(target))
   evidence_page(target,r)
   checks={c['id']:c['pass'] for c in r['checks']}
   valid=(t.get('rollout_review') or {}).get('pass')
   if type(valid) is not bool:raise ValueError('File-only validity unavailable')
   row={'model':t['model'],'trial_id':t['id'],'cohort':directory,'base_checks':base,'checks':checks,'file_only_valid':valid,'points':base+sum(checks.values()) if valid else 0,'total':total,'submission_sha256':actual,'report':str((target/'report.json').relative_to(out)),'simulator':f"http://127.0.0.1:{port}/trials/{t['id']}/submission/index.html"}
   if full_path:row['full_report']=str(full_path.relative_to(out))
   return row

 rows=[]
 with ThreadPoolExecutor(max_workers=args.jobs) as pool:
  for row in pool.map(grade,jobs):
   rows.append(row);write_json(out/'results.json',{'rubric':args.revision,'base_rerun':args.rerun_all,'kind':'exploratory retrospective comparison; criteria selected after seeing submissions','rows':rows})
   print(json.dumps({k:row[k] for k in ('model','trial_id','checks','points')}),flush=True)
 labels={'pilot_clearance':'Pilot clearance','wing_drive_linkage':'Wing drive','wingtip_motion_continuity':'Tip motion','rear_truss_structure':'Rear truss'}
 ids=[key for key in labels if key in scored_checks(args.revision)]
 headings=['Model / repeat','Flight and wheel /7',*(labels[key] for key in ids),f'Total /{total}','Inspect']
 body=f'<h1>Deterministic airframe review · {args.revision}</h1><p>Retrospective scoring of saved aircraft. Original grades are preserved. No human or LLM judge. A failed file-only audit zeros the /{total} score.</p><table><tr>'+''.join('<th>'+h+'</th>' for h in headings)+'</tr>'
 for row in rows:
  body+='<tr><td>'+html.escape(row['trial_id'])+'</td><td>'+str(row['base_checks'])+'</td>'+''.join('<td>'+('Pass' if row['checks'][i] else 'Fail')+'</td>' for i in ids)+'<td>'+str(row['points'])+f'/{total}'+(' (invalid)' if not row['file_only_valid'] else '')+'</td><td><a href="'+row['simulator']+'">Fly</a> · <a href="'+row['report'].replace('report.json','report.html')+'">Geometry evidence</a></td></tr>'
 body+='</table><p><a href="results.json">Results and submission identity</a></p>'
 (out/'index.html').write_text('<!doctype html><meta charset="utf-8"><title>Deterministic airframe review</title><style>body{font:16px system-ui;max-width:1400px;margin:40px auto;padding:20px;background:#f7f8f7;color:#20383a}table{border-collapse:collapse;width:100%;background:white}td,th{text-align:left;padding:12px;border-bottom:1px solid #ddd}a{color:#176c70}p{line-height:1.6}</style>'+body)


if __name__=='__main__':main()
