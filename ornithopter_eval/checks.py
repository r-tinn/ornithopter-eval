"""The complete v2 checklist. Every verdict is boolean; null means ungraded."""

TASK_VERSION = "swan-v2.0"
CHECKS = {
    "source": {
        "span_m": "Is the exported span the source value in metres?",
        "wing_area_m2": "Is the exported wing area the source value in square metres?",
        "wrist_span_m": "Is the exported wrist span the source value in metres?",
        "shoulder_span_m": "Is the exported shoulder span the source value in metres?",
        "body_width_m": "Is the exported body width the source value in metres?",
        "overall_length_m": "Is the exported overall length the source value in metres?",
        "aspect_ratio": "Is the exported aspect ratio b²/S from the selected source values?",
    },
    "physics": {
        "power_controls_thrust": "Does switching power off remove thrust?",
        "lift_scales_with_speed_squared": "Does doubling airspeed quadruple positive lift at fixed attitude?",
        "matching_wind_removes_lift": "Does wind matching aircraft velocity remove aerodynamic lift?",
    },
    "interaction": {
        "power_moves_forward": "Does full power move the aircraft forward compared with zero power?",
        "pitch_input_changes_pitch": "Does ArrowUp increase pitch compared with neutral input?",
        "pause_freezes_state": "Does Pause freeze the running simulation state?",
        "reset_restores_state": "Does Reset restore the specified initial state and zero throttle?",
        "takeoff": "Does the prescribed power and pitch sequence sustain flight above the runway?",
        "landing": "Does the prescribed approach sequence reach a safe touchdown?",
    },
    "visual": {
        "wings_on_both_sides": "Is there a wing attached to each lateral side of the body?",
        "tail_behind_wings": "Is the tail aft of the wing roots?",
    },
}

VISUAL_CHECKS = {
    "wings_on_both_sides": (
        "Compare the swan in source 02 with inspection-top.png (nose points UP). "
        "Pass only if a wing is visibly attached on the LEFT and on the RIGHT of the central body. "
        "Ignore colours, feather detail, proportions, labels and aesthetics."
    ),
    "tail_behind_wings": (
        "Compare the swan in source 02 with inspection-top.png (nose points UP). "
        "Pass only if a distinct tail surface is visibly attached to the body BELOW (aft of) "
        "the wing-root attachment region. Ignore colours, exact tail shape, fin orientation and aesthetics."
    ),
}


def normalize_checks(group, observed):
    by_id = {item["id"]: item for item in observed}
    return [{"id": name, "question": question,
             "pass": by_id.get(name, {}).get("pass") is True,
             "detail": by_id.get(name, {}).get("detail", "Check not reached; see diagnostics")}
            for name, question in CHECKS[group].items()]


def refresh_verdict(report):
    if set(report["dimensions"]) != set(CHECKS):
        raise ValueError("Report must contain the complete v2 checklist")
    for group, expected in CHECKS.items():
        items = report["dimensions"][group]["checks"]
        if (len(items) != len(expected) or {c["id"] for c in items} != set(expected) or
            any(type(c["pass"]) is not bool and not (group == "visual" and c["pass"] is None) for c in items)):
            raise ValueError("Missing, duplicate or invalid checks in " + group)
    for dimension in report["dimensions"].values():
        values = [item["pass"] for item in dimension["checks"]]
        dimension["passed"] = False if False in values else (None if None in values else True)
    values = [item["pass"] for dim in report["dimensions"].values() for item in dim["checks"]]
    report["passed"] = False if False in values else (None if None in values else True)
    report["status"] = "awaiting_review" if None in values else ("passed" if report["passed"] else "failed")
    return report
