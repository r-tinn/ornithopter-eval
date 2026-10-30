import argparse
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

from .api import APIError, get_api_key
from .checks import TASK_VERSION
from .grading import grade_submission
from .review import apply_review, judge
from .runner import ROOT, DEFAULT_CONFIG, prepare, run_model, verify_sources, write_json


def summarize(report):
    return {"status":report["status"],"passed":report.get("passed"),
            "dimensions":{k:{"passed":v.get("passed"),
                "failed":[c["id"] for c in v["checks"] if c["pass"] is False],
                "ungraded":[c["id"] for c in v["checks"] if c["pass"] is None]}
                for k,v in report.get("dimensions",{}).items()},
            **({"error":report["error"]} if "error" in report else {})}


def validate(node):
    verify_sources()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    root = ROOT / "runs" / ("validation-"+stamp)
    root.mkdir(parents=True)
    # Calibrate against known-good and deliberately incorrect submissions.
    fixtures = {"reference":None,
                "wrong_units":("physics.mjs", "span_m: 7.4 * 0.3048", "span_m: 7.4"),
                "free_thrust":("physics.mjs", "0.65*power / Math.max(airspeed,5)", "52"),
                "linear_lift":("physics.mjs", "0.5 * environment.rho * airspeed ** 2", "0.5 * environment.rho * airspeed"),
                "ignored_wind":("physics.mjs", "v - environment.wind[i]", "v"),
                "broken_step":("physics.mjs", "s.velocity = state.velocity.map((v,i) => v + f[i]/mass*dt);", "s.velocity = [0,0,0];"),
                "broken_pause":("app.mjs", "$('pause').onclick=()=>{paused=true;accumulator=0;draw();};", "$('pause').onclick=()=>{};"),
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
            target = submission / mutation[0]
            source = target.read_text()
            if source.count(mutation[1]) != 1:
                raise ValueError(f"Mutation anchor changed: {name}")
            target.write_text(source.replace(mutation[1],mutation[2]))
        report = grade_submission(submission,root / name / "grade",node=node)
        reports[name] = summarize(report)
        print(name+": "+json.dumps(reports[name]),flush=True)
    targets = {"wrong_units":("source","span_m"), "free_thrust":("physics","power_controls_thrust"),
               "linear_lift":("physics","lift_scales_with_speed_squared"),
               "ignored_wind":("physics","matching_wind_removes_lift"),
               "broken_step":("interaction","power_moves_forward"),
               "broken_pause":("interaction","pause_freezes_state")}
    success = (all(reports["reference"]["dimensions"].get(k,{}).get("passed") is True
                   for k in ("source","physics","interaction")) and
               all(check in reports[name]["dimensions"].get(group,{}).get("failed",[])
                   for name,(group,check) in targets.items()) and
               "power_moves_forward" in reports["free_thrust"]["dimensions"].get("interaction",{}).get("failed",[]) and
               all(len(reports["empty_starter"]["dimensions"].get(k,{}).get("failed",[]))==n
                   for k,n in (("source",7),("physics",3),("interaction",6))) and
               all(r["status"]=="awaiting_review" for r in reports.values()))
    result = {"task_version":TASK_VERSION,"offline_validation_passed":success,
              "live_api_tested":False,"multimodal_judge_tested_live":False,
              "note":"Calibration detects these selected defects; it is not independent scientific validation.",
              "reports":reports}
    write_json(root / "summary.json",result)
    (ROOT / "validation").mkdir(exist_ok=True)
    write_json(ROOT / "validation/latest.json",result)
    image = root / "reference/grade/inspection-top.png"
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
            if not get_api_key():
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
            if not (folder / "inspection-top.png").is_file():
                raise ValueError("Missing inspection evidence; visual checks remain ungraded")
            review = json.loads(Path(args.review_json).read_text())
            report = apply_review(json.loads((folder / "report.json").read_text()),review)
            report["reviewer"]={"type":"human","name":args.reviewer,"rubric":TASK_VERSION}
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
