"""Reproduce the source audit's hashes/arithmetic, not a physics/fidelity grader."""
import argparse
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AUDIT = ROOT / 'audits/source-compatibility-20261104'


def audit():
    manifest = json.loads((ROOT / 'task/source-manifest.json').read_text())
    inventory = json.loads((AUDIT / 'inventory.json').read_text())
    expected = {row['file']: row for row in manifest['archive_files']}
    recorded = {row['file']: row for row in inventory['sources']}
    if len(recorded) != 15 or len(inventory['sources']) != 15 or set(recorded) != set(expected):
        raise ValueError('The audit must retain exactly the fifteen inventoried originals')
    for name, row in expected.items():
        data = (AUDIT / 'sources' / name).read_bytes()
        if (len(data) != row['bytes'] or hashlib.sha256(data).hexdigest() != row['sha256']
                or recorded[name]['sha256'] != row['sha256']):
            raise ValueError('Source hash mismatch: ' + name)

    e = json.loads((ROOT / 'candidate/mechanical-v5/engineering.json').read_text())
    # Explicit reviewer readings of photo 02's rounded column, not an OCR result.
    case = {'span_ft': 7.4, 'wrist_span_ft': 3.7, 'area_ft2': 6.61,
            'printed_AR': 8.29, 'rounded_inner_chord_in': 12}
    ar = case['span_ft']**2 / case['area_ft2']
    wrist_fraction = case['wrist_span_ft'] / case['span_ft']
    area = e['span_m']**2 / ar
    half = e['span_m'] / 2
    inner = half * wrist_fraction - e['wing']['hinge_offset_m']
    outer = half * (1 - wrist_fraction)
    chord = area / (2 * (inner + outer * (1 + e['wing']['taper_ratio']) / 2))
    scaled_chord = e['span_m'] * (case['rounded_inner_chord_in'] / 12) / case['span_ft']
    dry = sum(row['kg'] for row in e['mass_budget'])
    fuel = e['fuel']['initial_litres'] * e['fuel']['density_kg_litre']
    w = e['wing']
    inputs = ['task/source-manifest.json', 'candidate/mechanical-v5/TASK.md',
              'candidate/mechanical-v5/SOURCE_GUIDE.md',
              'candidate/mechanical-v5/engineering.json',
              'candidate/mechanical-v5/scaffold/environment/mechanism.mjs',
              'fixtures/mechanical-v5/kinematics.mjs',
              'fixtures/mechanical-v5/physics.mjs', 'candidate/mechanical-v5/GRADERS.md',
              'audits/source-compatibility-20261104/inventory.json']
    return {
        'kind': 'Source compatibility audit: reproducible arithmetic and byte integrity only',
        'source_fidelity_passed': False,
        'reason': 'Material source principles are omitted/replaced in v5; see REPORT.md.',
        'full_aircraft_feasibility_established': False,
        'original_hashes_verified': len(expected),
        'selected_v5_photos': manifest['selected_ids'],
        'reviewer_transcription': case,
        'derived': {
            'aspect_ratio': ar,
            'printed_AR_relative_difference': abs(case['printed_AR'] / ar - 1),
            'wrist_fraction': wrist_fraction,
            'span_m': e['span_m'], 'effective_wing_area_m2': area,
            'dry_mass_sum_kg': dry, 'fuel_mass_kg': fuel,
            'wet_mass_kg': dry + fuel, 'wing_loading_kg_m2': (dry + fuel) / area,
            'current_linear_taper_root_chord_m': chord,
            'source_rounded_chord_scaled_to_current_span_m': scaled_chord,
            'current_chord_excess_fraction': chord / scaled_chord - 1,
            'current_inner_stroke_bounds_deg': [math.degrees(w['dihedral_rad'] - w['inner_amplitude_rad']),
                                                 math.degrees(w['dihedral_rad'] + w['inner_amplitude_rad'])],
            'current_outer_relative_stroke_amplitude_deg': math.degrees(w['outer_amplitude_rad']),
            'ideal_frequency_ratio_for_20_percent_stiffness_increase': math.sqrt(1.2),
            'ideal_stiffness_ratio_for_10_percent_frequency_increase': 1.1**2,
        },
        'limitations': [
            'Arithmetic does not establish a faithful mechanism or feasible piloted aircraft.',
            'Source passages were visually interpreted by the assistant, not verified by this script.',
            'Chord comparison is explanatory, not a new hidden grading target.',
            'The source describes biological observations, revisions and incomplete proposals; not every visible number is a final requirement.',
        ],
        'input_sha256': {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in inputs},
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    output = Path(args.output)
    if output.exists():
        raise SystemExit('Use a fresh output path to preserve earlier evidence')
    result = audit()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2, allow_nan=False) + '\n')
    print(json.dumps({key: result[key] for key in ('source_fidelity_passed', 'original_hashes_verified', 'derived')}, indent=2))
