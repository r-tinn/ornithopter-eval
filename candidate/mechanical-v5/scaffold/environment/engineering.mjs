// Supplied immutable assumptions; mirrored from inputs/engineering.json.
export const E={
  "status": "reference-informed educational model; hypothetical aircraft, not flight-validated",
  "span_m": 14,
  "body_length_m": 6,
  "pilot_height_m": 1.65,
  "pilot_mass_kg": 55,
  "mass_budget": [
    {
      "id": "pilot",
      "kg": 55,
      "basis": "Benchmark light adult, includes clothing and helmet"
    },
    {
      "id": "wings",
      "kg": 50,
      "basis": "Estimated primary structure, ribs and covering"
    },
    {
      "id": "fuselage",
      "kg": 28,
      "basis": "Estimated frame, fairing and tail boom"
    },
    {
      "id": "tail",
      "kg": 8,
      "basis": "Estimated tail surfaces"
    },
    {
      "id": "landing_gear",
      "kg": 12,
      "basis": "Estimated wheels, struts and brakes"
    },
    {
      "id": "engine",
      "kg": 16.9,
      "basis": "Moster185 EFI published engine package; exclusions separately allocated"
    },
    {
      "id": "transmission",
      "kg": 18,
      "basis": "Estimated additional wing reduction, linkage and flywheel"
    },
    {
      "id": "installation",
      "kg": 10,
      "basis": "Estimated mounts, cooling fan, exhaust support and electrical installation"
    },
    {
      "id": "cockpit_controls",
      "kg": 8,
      "basis": "Estimated seat, restraints, instruments and controls"
    },
    {
      "id": "tank",
      "kg": 4,
      "basis": "Estimated tank, lines and fittings, excluding fuel"
    },
    {
      "id": "contingency",
      "kg": 15,
      "basis": "Explicit allowance; not a structural proof"
    }
  ],
  "dry_mass_including_pilot_kg": 224.9,
  "fuel": {
    "initial_litres": 5,
    "density_kg_litre": 0.72,
    "initial_kg": 3.6,
    "lower_heating_value_J_kg": 43200000,
    "bsfc_kg_kWh": 0.55,
    "idle_kg_s": 5e-05,
    "planning_reserve_fraction": 0.1
  },
  "engine": {
    "reference": "Vittorazi Moster185 EFI",
    "published_peak_CV": 26,
    "published_peak_W": 19122.9675,
    "continuous_shaft_limit_W": 16000,
    "transmission_efficiency": 0.85,
    "equivalent_drive_inertia_kg_m2": 120,
    "drive_friction_Nm_s": 12,
    "maximum_wingbeat_hz": 1.2,
    "governor_gain_W_per_rad_s": 20000
  },
  "wing": {
    "root_height_m": 0.8,
    "hinge_offset_m": 0.25,
    "taper_ratio": 0.35,
    "inner_amplitude_rad": 0.22,
    "outer_amplitude_rad": 0.26,
    "outer_phase_lag_rad": 0.25,
    "dihedral_rad": 0.08,
    "incidence_rad": 0.06,
    "inner_twist_amplitude_rad": 0.13,
    "outer_twist_amplitude_rad": 0.3,
    "strips_per_panel": 4,
    "parked_phase_rad": 1.6957963267948966
  },
  "aero": {
    "section_lift_slope_per_rad": 6.283185307179586,
    "zero_lift_alpha_rad": -0.07,
    "roughness_multiplier": 1.5,
    "span_efficiency": 0.75,
    "stall_alpha_rad": 0.24,
    "post_stall_transition_rad": 0.52,
    "body_flat_plate_areas_m2": {
      "pilot_and_cockpit": 0.45,
      "fuselage_tail": 0.22,
      "gear": 0.12,
      "bracing_installation": 0.11
    },
    "section_profile_drag": [
      [
        0,
        0.0072
      ],
      [
        0.4,
        0.007
      ],
      [
        0.8,
        0.0073
      ],
      [
        1,
        0.0084
      ],
      [
        1.2,
        0.0132
      ],
      [
        1.4,
        0.0194
      ]
    ]
  },
  "rho_kg_m3": 1.225,
  "gravity_m_s2": 9.80665,
  "wheel_radius_m": 0.23,
  "gear_centres_m": [
    [
      2,
      -1.2,
      0
    ],
    [
      -0.45,
      -1.2,
      -1.2
    ],
    [
      -0.45,
      -1.2,
      1.2
    ]
  ],
  "controls": {
    "pitch_accel_rad_s2": 0.32,
    "pitch_damping_per_s": 1.2,
    "roll_accel_rad_s2": 0.55,
    "roll_damping_per_s": 1,
    "pitch_limits_rad": [
      -0.35,
      0.45
    ],
    "bank_limit_rad": 1.05,
    "rudder_coefficient": 0.12,
    "brake_force_N": 500,
    "rolling_friction_coefficient": 0.015,
    "safe_touchdown_sink_m_s": 2,
    "safe_touchdown_speed_m_s": 22,
    "safe_touchdown_bank_rad": 0.25
  },
  "source_derived": [
    "aspect_ratio",
    "wrist_span_fraction"
  ],
  "limitations": [
    "Component masses except engine and pilot are estimates with a 15 kg allowance.",
    "Engine continuous derating, BSFC, transmission losses and equivalent inertia are benchmark assumptions, not manufacturer ratings.",
    "Airfoil anchors do not establish full-aircraft drag or unsteady performance.",
    "A small strip model, not CFD, flexible-structure analysis or a human-flight engineering design."
  ]
};
