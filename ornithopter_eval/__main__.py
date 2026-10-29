import argparse
import json
import os
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

from .api import APIError
from .grading import grade_submission
from .review import apply_review, judge
from .runner import ROOT, DEFAULT_CONFIG, prepare, run_model, verify_sources, write_json


def summarize(report):
    return {"status":report["status"],"overall_score":report.get("overall_score"),
            "dimensions":{k:v.get("score") for k,v in report.get("dimensions",{}).items()},
            **({"error":report["error"]} if "error" in report else {})}


def validate(node):
    verify_sources()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    root = ROOT / "runs" / ("validation-"+stamp)
    root.mkdir(parents=True)
    # Calibrate against known-good and deliberately incorrect submissions.
    fixtures = {"reference":None,
                "wrong_units":("span_m: 7.4 * 0.3048", "span_m: 7.4"),
                "free_thrust":("0.65*power / Math.max(airspeed,5)", "52"),
                "broken_step":("s.velocity = state.velocity.map((v,i) => v + f[i]/mass*dt);", "s.velocity = [0,0,0];"),
                "empty_starter":None}
    reports = {}
    for name, mutation in fixtures.items():
        submission = root / name / "submission"
        if name == "reference":
            # Exercise preparation, native tool application and submission freezing
            # with an explicitly injected fixture transport. This is not an API run.
            run = prepare(root / name)
            operations = []
            for index, path in enumerate(sorted((ROOT / "reference").iterdir())):
                target = submission / path.name
                content = path.read_text()
                if target.exists():
                    diff = "@@\n" + "\n".join("-"+line for line in target.read_text().splitlines()) + "\n" + "\n".join("+"+line for line in content.splitlines())
                    kind = "update_file"
                else:
                    diff = "\n".join("+"+line for line in content.splitlines())
                    kind = "create_file"
                operations.append({"type":"apply_patch_call","call_id":f"fixture-{index}",
                                   "operation":{"type":kind,"path":"submission/"+path.name,"diff":diff}})
            fixture_responses = iter([
                {"status":"completed","output":operations,"usage":{"input_tokens":0,"output_tokens":0}},
                {"status":"completed","output":[],"usage":{"input_tokens":0,"output_tokens":0}}])
            result = run_model(run,"offline-calibration-fixture",lambda *a,**kw:next(fixture_responses))
            if result["status"] != "submitted":
                raise ValueError("Offline fixture could not submit through the harness")
            for path in (ROOT / "reference").iterdir():
                if path.read_bytes() != (submission / path.name).read_bytes():
                    raise ValueError("Native patch transport changed calibration fixture")
        elif name == "empty_starter":
            shutil.copytree(ROOT / "task/starter",submission)
        else:
            shutil.copytree(ROOT / "reference",submission)
        if mutation:
            physics = submission / "physics.mjs"
            source = physics.read_text()
            if source.count(mutation[0]) != 1:
                raise ValueError(f"Mutation anchor changed: {name}")
            physics.write_text(source.replace(*mutation))
        report = grade_submission(submission,root / name / "grade",node=node)
        reports[name] = summarize(report)
        print(name+": "+json.dumps(reports[name]),flush=True)
    success = (all(reports["reference"]["dimensions"].get(k)==100 for k in ("source","physics","interaction")) and
               reports["wrong_units"]["dimensions"].get("source",100)<100 and
               reports["free_thrust"]["dimensions"].get("physics",100)<100 and
               reports["broken_step"]["dimensions"].get("physics",100)<100 and
               reports["empty_starter"]["dimensions"].get("source",100)==0 and
               reports["empty_starter"]["dimensions"].get("physics",100)<20 and
               reports["empty_starter"]["dimensions"].get("interaction",100)<20 and
               all(r["status"]=="awaiting_review" for r in reports.values()))
    result = {"task_version":"swan-v1.0","offline_validation_passed":success,
              "live_api_tested":False,"multimodal_judge_tested_live":False,
              "note":"Calibration detects these selected defects; it is not independent scientific validation.",
              "reports":reports}
    write_json(root / "summary.json",result)
    (ROOT / "validation").mkdir(exist_ok=True)
    write_json(ROOT / "validation/latest.json",result)
    image = root / "reference/grade/inspection.png"
    if image.exists():
        shutil.copyfile(image,ROOT / "validation/reference-inspection.png")
    print("Evidence: "+str(root))
    return 0 if success else 1


def main(argv=None):
    parser = argparse.ArgumentParser(description="Swan Flight Lab evaluation")
    commands = parser.add_subparsers(dest="command",required=True)
    p = commands.add_parser("prepare");p.add_argument("output");p.add_argument("--config",default=str(DEFAULT_CONFIG))
    p = commands.add_parser("run");p.add_argument("--model",required=True);p.add_argument("--output",required=True);p.add_argument("--config",default=str(DEFAULT_CONFIG))
    p = commands.add_parser("grade");p.add_argument("submission");p.add_argument("--output",required=True);p.add_argument("--node",default="node")
    p = commands.add_parser("judge");p.add_argument("submission");p.add_argument("grade_dir");p.add_argument("--model",required=True)
    p = commands.add_parser("review");p.add_argument("grade_dir");p.add_argument("review_json");p.add_argument("--reviewer",required=True)
    p = commands.add_parser("validate");p.add_argument("--node",default="node")
    commands.add_parser("verify-sources")
    args = parser.parse_args(argv)
    try:
        if args.command == "prepare":
            print(prepare(args.output,args.config))
        elif args.command == "run":
            if not os.environ.get("OPENAI_API_KEY"):
                raise APIError("Set OPENAI_API_KEY locally; no run or API call was created")
            run = prepare(args.output,args.config)
            result = run_model(run,args.model)
            print(json.dumps(result,indent=2))
            return 0 if result["status"]=="submitted" else 1
        elif args.command == "grade":
            report = grade_submission(args.submission,args.output,node=args.node)
            print(json.dumps(summarize(report),indent=2))
            return 1 if report["status"] in ("infrastructure_error","submission_timeout") else 0
        elif args.command == "judge":
            print(json.dumps(summarize(judge(args.submission,args.grade_dir,args.model)),indent=2))
        elif args.command == "review":
            folder = Path(args.grade_dir)
            if (folder / "review.json").exists():
                raise ValueError("Review already exists")
            review = json.loads(Path(args.review_json).read_text())
            report = apply_review(json.loads((folder / "report.json").read_text()),review)
            report["reviewer"]={"type":"human","name":args.reviewer,"rubric":"swan-v1.0"}
            write_json(folder / "review.json",review)
            write_json(folder / "report.json",report)
            print(json.dumps(summarize(report),indent=2))
        elif args.command == "validate":
            return validate(args.node)
        else:
            print(json.dumps(verify_sources(),indent=2))
    except (APIError,ValueError,OSError,KeyError,TypeError) as exc:
        print(str(exc),file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
