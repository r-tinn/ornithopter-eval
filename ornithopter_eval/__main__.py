import argparse
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

from .api import APIError, get_api_key
from .checks import TASK_VERSION
from .grading import grade_submission
from .experiment import export_experiment, run_experiment, serve_artifacts
from .review import apply_review, audit_consistency, judge
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
                "ground_clip":("physics.mjs", "s.position[1] = 0.2;", "// Ground clamp deliberately removed."),
                "wrong_wingbeat":("physics.mjs", "4*Math.PI*dt", "2*Math.PI*dt"),
                "unpowered_flapping":("physics.mjs", "controls.throttle>0 ? 4*Math.PI*dt : 0", "4*Math.PI*dt"),
                "zero_drag":("physics.mjs", "const drag = q * parameters.wing_area_m2 *", "const drag = 0 * parameters.wing_area_m2 *"),
                "static_wings":("app.mjs", "const inner=controls.throttle>0?0.45*Math.sin(state.phase):0;", "const inner=0;"),
                "missing_fin":("app.mjs", "shape([[-0.48,0,0],[-0.7,0.3,0],[-0.7,0,0]],'#b0c6bb','#6e8f81');", "// Fin deliberately removed."),
                "lengthwise_wings":("app.mjs", "return [x,inboard*Math.sin(inner)+outboard*Math.sin(inner+outer),side*(root+inboard*Math.cos(inner)+outboard*Math.cos(inner+outer))];", "return [side*(root+inboard*Math.cos(inner)+outboard*Math.cos(inner+outer)),inboard*Math.sin(inner)+outboard*Math.sin(inner+outer),x];"),
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
            if name == "static_wings":
                target.write_text(target.read_text().replace("const outer=controls.throttle>0?0.35*Math.sin(state.phase-0.7):0;", "const outer=0;"))
        report = grade_submission(submission,root / name / "grade",node=node)
        reports[name] = summarize(report)
        print(name+": "+json.dumps(reports[name]),flush=True)
    targets = {"wrong_units":("source","span_m"), "free_thrust":("physics","power_controls_thrust"),
               "linear_lift":("physics","lift_scales_with_speed_squared"),
               "ignored_wind":("physics","matching_wind_removes_lift"),
               "broken_step":("interaction","power_moves_forward"),
               "broken_pause":("interaction","pause_freezes_state")}
    targets.update({"ground_clip":("physics","ground_nonpenetration"),
                    "wrong_wingbeat":("physics","powered_wingbeat_frequency"),
                    "unpowered_flapping":("physics","unpowered_wingbeat_stops"),
                    "zero_drag":("physics","steady_glide_ratio")})
    success = (all(reports["reference"]["dimensions"].get(k,{}).get("passed") is True
                   for k in ("source","physics","interaction")) and
               all(check in reports[name]["dimensions"].get(group,{}).get("failed",[])
                   for name,(group,check) in targets.items()) and
               "power_moves_forward" in reports["free_thrust"]["dimensions"].get("interaction",{}).get("failed",[]) and
               all(reports[name]["dimensions"].get(group,{}).get("passed") is True
                   for name in ("static_wings","missing_fin","lengthwise_wings")
                   for group in ("source","physics","interaction")) and
               all(len(reports["empty_starter"]["dimensions"].get(k,{}).get("failed",[]))==n
                   for k,n in (("source",7),("physics",7),("interaction",6))) and
               all(r["status"]=="awaiting_review" for r in reports.values()))
    result = {"task_version":TASK_VERSION,"offline_validation_passed":success,
              "live_api_tested":False,"multimodal_judge_tested_live":False,
              "note":"Calibration detects these selected defects; it is not independent scientific validation.",
              "visual_mutants_awaiting_review":{"static_wings":"visible_flapping", "missing_fin":"fin_present", "lengthwise_wings":"wings_transverse"},
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
    p = commands.add_parser("audit-reviews");p.add_argument("reviews",nargs="+")
    p = commands.add_parser("compare");p.add_argument("--models",nargs=2,required=True);p.add_argument("--repeats",type=int,default=3);p.add_argument("--output",required=True);p.add_argument("--config",default=str(ROOT / "configs/frontier-calibration.json"));p.add_argument("--node",default="node")
    p = commands.add_parser("export");p.add_argument("source");p.add_argument("destination")
    p = commands.add_parser("serve-artifacts");p.add_argument("directory");p.add_argument("--port",type=int,default=8765)
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
        elif args.command == "audit-reviews":
            result = audit_consistency([(path,json.loads(Path(path).read_text())) for path in args.reviews])
            print(json.dumps(result,indent=2))
            return 0 if result["consistent"] else 1
        elif args.command == "compare":
            result = run_experiment(args.output,args.models,args.repeats,args.config,node=args.node)
            print(json.dumps({"status":result["status"],"models":result["models"]},indent=2))
            return 0 if result["status"]=="completed" else 1
        elif args.command == "export":
            print(export_experiment(args.source,args.destination))
        elif args.command == "serve-artifacts":
            serve_artifacts(args.directory,args.port)
        else:
            print(json.dumps(verify_sources(),indent=2))
    except (APIError,ValueError,OSError,KeyError,TypeError) as exc:
        print(str(exc),file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
