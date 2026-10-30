"""The complete checklist. Every verdict is boolean; null means ungraded."""

TASK_VERSION = "swan-v3.1"
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
        "ground_nonpenetration": "Does a descending aircraft stay above the ground-contact plane?",
        "powered_wingbeat_frequency": "Does powered wingbeat phase follow the specified 2 Hz cycle?",
        "unpowered_wingbeat_stops": "Does wingbeat phase stop when power is removed?",
        "steady_glide_ratio": "Does steady unpowered flight lose the height predicted by the specified lift/drag ratio?",
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
        "wings_transverse": "Do the wings extend across the body rather than along its nose-to-tail axis?",
        "fin_present": "Is a distinct tail fin visible?",
        "visible_flapping": "Do both rendered wingtips move vertically relative to their roots during a wingbeat?",
    },
}

VISUAL_CHECKS = {
    "wings_on_both_sides": {
        "instruction":"Compare the swan in source 02 with inspection-top.png (nose points UP). "
            "Pass only if a wing is visibly attached on the LEFT and on the RIGHT of the central body. "
            "Ignore colours, feather detail, proportions, labels and aesthetics.",
        "images":["Unknown-2.jpg","inspection-top.png"],
    },
    "tail_behind_wings": {
        "instruction":"Compare the swan in source 02 with inspection-top.png (nose points UP). "
            "Pass only if a distinct tail surface is visibly attached to the body BELOW (aft of) "
            "the wing-root attachment region. Ignore colours, exact tail shape, fin orientation and aesthetics.",
        "images":["Unknown-2.jpg","inspection-top.png"],
    },
    "wings_transverse": {
        "instruction":"Compare source 02 with inspection-top.png (nose points UP). "
            "Pass only if the principal root-to-tip direction of each wing is lateral: "
            "its left/right displacement is greater than its fore/aft displacement from the root. "
            "This checks transverse wing placement only, not leading-edge details or exact sweep angles.",
        "images":["Unknown-2.jpg","inspection-top.png"],
    },
    "fin_present": {
        "instruction":"In inspection-side.png the nose points RIGHT. Pass only if a distinct fin surface "
            "is visible projecting above the aft body, behind the wing-root region. "
            "This is the task's conventional tail-fin requirement, not an exact orientation recovered from a photograph. "
            "Do not require a separately hinged rudder, a specific angle, shape, colour or label.",
        "images":["inspection-side.png"],
    },
    "visible_flapping": {
        "instruction":"The four front-view frames show a running powered aircraft over one 2 Hz wingbeat, "
            "sampled approximately 0.125 s apart. Compare each wingtip's vertical position RELATIVE TO ITS OWN ROOT. "
            "Pass only if BOTH tips visibly change relative height across the frames. "
            "Whole-aircraft/camera translation, changing labels, shadows or backgrounds do not count. "
            "Ignore exact stroke amplitude, phase offset and colours. Cite at least two different frame filenames.",
        "images":["flap-0.png","flap-1.png","flap-2.png","flap-3.png"],
    },
}


MECHANICAL_VERSION = "mechanical-v4-draft"
MECHANICAL_CHECKS = {
    "source": {
        "aspect_ratio_from_study": "Does aspect ratio preserve 7.4²/6.61 within 0.5%?",
        "wrist_fraction_from_study": "Does wrist fraction preserve 3.7/7.4 within 0.5%?",
        "mechanical_area_consistent": "Does the 3 m aircraft preserve the source-derived area ratio?",
    },
    "physics": {
        "power_controls_thrust": "Is scalar thrust zero with power off and positive with power on?",
        "lift_scales_with_speed_squared": "Does doubling airspeed quadruple positive scalar lift?",
        "matching_wind_removes_lift": "Does wind matching velocity remove aerodynamic lift?",
        "powered_phase_frequency": "Does powered phase follow the specified 2 Hz cycle?",
        "unpowered_phase_stops": "Does phase stop with power off?",
        "steady_glide_ratio": "Does the 2 s steady glide preserve the specified lift/drag ratio?",
    },
    "interaction": {
        "pitch_input_changes_pitch": "Does ArrowUp increase pitch by more than 0.1 rad versus neutral?",
        "rudder_changes_heading": "Does D change heading toward +z by more than 0.02 rad versus neutral?",
        "takeoff_from_strip": "Does the prescribed sequence sustain flight above both strips?",
        "landing_on_strip": "Does the prescribed approach land safely on both strips?",
        "wheels_above_surface": "Do actual wheel meshes avoid ground penetration during both approaches?",
        "aircraft_geometry_bounded": "Is the actual aircraft nonempty and at most 12,000 triangles?",
    },
    "visual": {
        "wings_lateral": "Is a wing attached on each lateral side, extending across the frame?",
        "tail_aft": "Is the tail fin above the aft frame and behind the wing roots?",
        "landing_gear_visible": "Are at least two wheels visibly attached below the frame by gear?",
        "outer_panels_articulate": "Does each outer panel visibly change angle relative to its inner panel?",
    },
}


def checklist(version):
    return MECHANICAL_CHECKS if version == MECHANICAL_VERSION else CHECKS


def normalize_checks(group, observed, checks=CHECKS):
    by_id = {item["id"]: item for item in observed}
    return [{"id": name, "question": question,
             "pass": by_id.get(name, {}).get("pass") is True,
             "detail": by_id.get(name, {}).get("detail", "Check not reached; see diagnostics")}
            for name, question in checks[group].items()]


def refresh_verdict(report):
    checks = checklist(report.get("task_version"))
    if set(report["dimensions"]) != set(checks):
        raise ValueError("Report must contain the complete checklist")
    for group, expected in checks.items():
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
