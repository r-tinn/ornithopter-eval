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


MECHANICAL_LEGACY_VERSION = "mechanical-v4-draft"
MECHANICAL_VERSION = "mechanical-v4.1"
PILOTED_VERSION = "mechanical-v5-draft"
SOURCE_FIRST_VERSION = 'mechanical-v6-source-first'
LATEST_SOURCE_FIRST_VERSION = 'mechanical-v7-source-first'
SOURCE_FIRST_VERSIONS = (SOURCE_FIRST_VERSION,LATEST_SOURCE_FIRST_VERSION)
MECHANICAL_VERSIONS = (MECHANICAL_LEGACY_VERSION, MECHANICAL_VERSION, PILOTED_VERSION, *SOURCE_FIRST_VERSIONS)
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


MECHANICAL_LEGACY_CHECKS = {group:dict(items) for group,items in MECHANICAL_CHECKS.items()}
MECHANICAL_CHECKS['interaction']['wheel_rotation_axis'] = 'Do all three actual tyre axles stay aligned with the lateral airframe axis during straight rolling and flight?'

PILOTED_CHECKS = {
    'source':dict(MECHANICAL_CHECKS['source']),
    'physics':{
        'mass_budget_complete':'Are the pilot and every supplied component allocation included in the all-up mass?',
        'fuel_accounting':'Does measured fuel use match delivered shaft work and the stated idle consumption?',
        'empty_tank_stops_drive':'Does exhausting the tank stop shaft power and lock the wings?',
        'drive_lock_preserves_pose':'Does setting drive rate to zero preserve all wing angles at the same crank phase?',
        'fuel_mass_affects_weight':'Does adding one kilogram of fuel add exactly one kilogram to gravity and mass?',
        'locked_wings_no_propulsion':'With wing rates locked, is propulsive work zero despite open throttle?',
        'outer_motion_changes_propulsion':'Does locking only the outer hinge motion change cycle-mean propulsion?',
        'stroke_rate_changes_propulsion':'Does changing wing angular rate change cycle-mean propulsion?',
        'shaft_power_limited':'Does shaft power stay within the throttle-scaled 16 kW limit?',
        'drive_energy_balance':'Does shaft work equal drive-energy change plus aerodynamic work and recorded losses?',
        'bank_reduces_vertical_force':'At identical horizontal flow, does 60 degree bank halve the vertical wing force?',
        'banked_trim_loses_height':'From the same level-lift initial condition, does banking cause a larger height loss?',
        'neutral_bank_retains_bank':'Does neutral bank input retain an established bank rather than auto-levelling?',
        'post_stall_lift_reduces':'Does the supplied post-stall transition reduce lift and increase drag?',
        'glide_ratio_in_envelope':'Does an unpowered trimmed glide lose height within the specified 6–14 distance/height envelope?',
        'locked_wings_matching_wind':'With stationary wings, does matching wind remove aerodynamic force?',
    },
    'interaction':{
        'pilot_mesh_present':'Is visible pilot geometry mounted in the production aircraft at human scale?',
        'rendered_wings_match_physics':'Do actual wing-panel quarter-chord positions and velocities match the aerodynamic strip mechanism?',
        'wing_geometry_matches_area':'Do the actual four wing panels have the prescribed planform area and span?',
        'wheel_rotation_axis':MECHANICAL_CHECKS['interaction']['wheel_rotation_axis'],
        'wheels_above_surface':MECHANICAL_CHECKS['interaction']['wheels_above_surface'],
        'takeoff_from_strip':'Does the production aircraft lift off both supplied strips by 35 seconds?',
        'landing_on_strip':'Does the supplied unpowered approach land on both strips within 10 seconds?',
        'rudder_mesh_and_yaw':'Does rudder input move the actual rudder and turn the aircraft in the commanded direction?',
        'aircraft_geometry_bounded':MECHANICAL_CHECKS['interaction']['aircraft_geometry_bounded'],
    },
    'visual':{
        'recognisable_adult_pilot':'Is a seated adult human clearly visible, with head/face, torso, two arms and two legs?',
        'mechanical_airframe':'Is the production aircraft visibly an engineered airframe with a motor and wing-drive mechanism?',
        'wings_lateral':'Do the main wings extend to both lateral sides of the airframe?',
        'tail_aft':'Are the horizontal tail and upright fin/rudder aft of the main wings?',
        'landing_gear_visible':'Are three wheels and their supporting gear visibly present?',
    },
}
PILOTED_CHECKS['source']['mechanical_area_consistent']='Does the actual wing area preserve S=14²/AR for the 14 m aircraft?'


def checklist(version):
    if version in SOURCE_FIRST_VERSIONS:
        checks = {'source':{}, 'physics':{
            'wing_cycle_force_coupling':'Do the source-linked production surfaces and distinct section models produce the independently reconstructed forces?',
            'elastic_inertial_exchange':'Do the actual moving wing masses exchange spring/kinetic energy consistently, including known damping?',
            'wing_body_pitch_coupling':'Do coupled wing/body accelerations and a short neutral-input response match the independent mass-matrix model?',
            'power_limited_flight':'Does the aircraft complete the published takeoff/bank scenario using the finite engine and fuel allowance?',
            'unpowered_glide_balance':'Does the configured motor-off glide descend with force-derived aerodynamic energy loss?'},
            'interaction':{'wheel_rotation_axis':MECHANICAL_CHECKS['interaction']['wheel_rotation_axis']},'visual':{}}
        if version == LATEST_SOURCE_FIRST_VERSION:
            checks['physics']['powered_pitch_stability']='Does steady full-throttle neutral-input flight avoid repeated large slow pitch surges?'
        return checks
    if version == PILOTED_VERSION:
        return PILOTED_CHECKS
    if version == MECHANICAL_VERSION:
        return MECHANICAL_CHECKS
    if version == MECHANICAL_LEGACY_VERSION:
        return MECHANICAL_LEGACY_CHECKS
    return CHECKS


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
