"""Independent author positives and targeted mutants. Zero model/API calls."""
import argparse
import json
from pathlib import Path
import shutil
from ornithopter_eval.runner import ROOT,write_json
from ornithopter_eval.world_candidate import prepare_world
from ornithopter_eval.airframe import inspect


def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('output',type=Path);p.add_argument('--node',required=True);args=p.parse_args();args.output=args.output.resolve()
 if args.output.exists():raise ValueError('Fresh calibration directory required')
 results=[]
 cases={'positive':None,'short_crank_positive':None,'pilot_bar':'pilot_clearance','static_drive':'wing_drive_linkage','unbraced_tail':'rear_truss_structure','whipping_tip':'wingtip_motion_continuity'}
 for name,target in cases.items():
  packet=prepare_world(args.output/name,reference=True,task_version='mechanical-v7-source-first');sub=packet/'submission'
  shutil.copyfile(sub/'aircraft.mjs',sub/'author-base.mjs')
  shutil.copyfile(ROOT/'fixtures/airframe-binary-v1/aircraft.mjs',sub/'aircraft.mjs')
  s=(sub/'aircraft.mjs').read_text()
  if name=='short_crank_positive':s=s.replace('[0,.2,0],.025','[0,.16,0],.04').replace('.2*Math.cos(phase)','.16*Math.cos(phase)').replace('.2*Math.sin(phase)','.16*Math.sin(phase)')
  if name=='pilot_bar':s=s.replace('a.T=T;return a;',"rod(a.root,[.7,.52,0],[1.5,.52,0],.035);a.T=T;return a;")
  if name=='static_drive':s=s.replace('a.T=T;return a;','a.freezeDrive=true;a.T=T;return a;')
  if name=='unbraced_tail':s=s.replace('a.T=T;return a;','for(const n of a.truss.children.slice())if(n.userData.calibrationDiagonal)a.truss.remove(n);a.T=T;return a;')
  if name=='whipping_tip':s=s.replace('updateBase(a,s,c);', 'updateBase(a,s,c);a.leftOuterSurface.rotation.x=.6*Math.sin(12*s.phase);')
  (sub/'aircraft.mjs').write_text(s)
  r=inspect(sub,packet/'grade-airframe',args.node)
  observed={c['id']:c['pass'] for c in r.get('checks',[])}
  success=all(observed.values()) and len(observed)==4 if target is None else observed.get(target) is False
  results.append({'variant':name,'target':target,'observed':observed,'calibrated':success,'report':str((packet/'grade-airframe/report.json').relative_to(args.output))})
  print(json.dumps(results[-1]),flush=True)
 write_json(args.output/'summary.json',{'kind':'independent author geometry calibration, not model performance','all_passed':all(r['calibrated'] for r in results),'model_calls':0,'results':results})
 return 0 if all(r['calibrated'] for r in results) else 1


if __name__=='__main__':raise SystemExit(main())
