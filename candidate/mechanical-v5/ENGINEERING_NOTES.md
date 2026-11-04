# Engineering basis and limits — v5 draft

This is a hypothetical one-seat aircraft and a reproducible reduced simulation.
It is not a demonstrated reconstruction, structural design or flight-validated
performance model. The supplied component values are a frozen benchmark scenario;
the generator does not need to invent a different engine or pilot mass.

## Mass and scale

| Component | kg | Basis |
|---|---:|---|
| Adult pilot, clothing and helmet | 55 | Explicit light-adult scenario |
| Wings | 50 | Structural/covering allowance, estimated |
| Fuselage and boom | 28 | Estimated |
| Tail surfaces | 8 | Estimated |
| Landing gear and brakes | 12 | Estimated |
| Engine package | 16.9 | Manufacturer figure; exclusions below |
| Additional wing transmission/linkage/flywheel | 18 | Estimated, additional to engine's reduction |
| Mounts, cooling and electrical installation | 10 | Estimated, includes manufacturer exclusions |
| Seat, restraints, controls and instruments | 8 | Estimated |
| Tank and lines | 4 | Estimated, excludes fuel |
| Contingency | 15 | Explicit allowance |
| **Dry, including pilot** | **224.9** | Sum |
| Fuel, 5 L at assumed 0.72 kg/L | 3.6 | Scenario |
| **Initial all-up mass** | **228.5** | Sum |

The 14 m span replaces the old 3 m craft. Notebook AR gives about 23.66 m² wing
area and 9.66 kg/m² initial wing loading. These calculations do not determine
spar strength, fatigue life or a certified load factor. The 15 kg contingency
cannot substitute for such calculations.

For scale, DeLaurier's full-scale project reported a 12.56 m span, approximately
322 kg maximum gross mass and a 24 hp engine. Its estimated cruise condition in
the 1999 paper must not be mistaken for measured sustained flight. Its measured
static thrust near 1.1 Hz was about 133 N. That is a same-class magnitude check,
not a measured thrust target for our different wing geometry.
[DeLaurier 1999, pp. 73, 76–78](http://ornithopter.net/Publications/TheDevelopmentandTestingofaFull-ScalePilotedOrnithopter.pdf).

## Engine, fuel and loss boundaries

Vittorazi lists the Moster185 EFI package at 16.9 kg and 26 CV peak at 8600 rpm
(about 19.12 kW). Its 2.5 L/h consumption is at a specified propeller operating
point. It is **not** full-power fuel consumption, nor ornithopter thrust data.
We do not copy its propeller thrust into the simulation.
[Manufacturer specifications](https://vittorazi.com/en/motori/moster-185-efi/).

Our 16 kW continuous shaft limit is a benchmark derating, not a manufacturer
continuous rating. Transmission efficiency 0.85, BSFC 0.55 kg/kWh, idle fuel
0.18 kg/h, equivalent drive inertia 120 kg·m² and friction 12 N·m·s are explicit
unmeasured installation assumptions. The 0.85 factor is a lumped installed
shaft-to-drive allowance, including remaining reduction and auxiliary mechanical
loads; it is not a measured gearbox efficiency map. The existing propeller reduction does not
replace the additional wing-frequency reduction/linkage. An installed cooling
fan is needed because this task has no propeller slipstream.

Fuel chemical energy is separate from shaft work. At the assumed gasoline lower
heating value of 43.2 MJ/kg, the chosen BSFC implies about 15.2% shaft conversion
before idle losses. Full 16 kW output would burn about 8.98 kg/h including idle:
roughly 24 minutes for the full tank, or 21.6 minutes allowing a 10% planning
reserve. Actual simulated consumption follows delivered shaft work. Reserve is
a planning allowance; the simulation's engine stops at zero fuel.
[DOE gasoline energy basis, footnote 57](https://www.hydrogen.energy.gov/docs/hydrogenprogramlibraries/pdfs/hydrogen-program-plan-2024.pdf#page=31).

The energy ledger is shaft work = aerodynamic drive work + transmission/friction/
lock heat + change in equivalent drive energy. Negative aerodynamic work can
return to the mechanical buffer. The model is not a detailed flexible-wing
inertial or torsional solver. The ideal brake/lock preserves the reached wing angles and dissipates remaining
buffer energy on shutdown; it does not keep a powered force alive after fuel exhaustion.

## Aerodynamic anchors

The sectional profile-drag table is an approximate visual extraction of the
NACA 4412 reference curve in figures 17–18, printed p. 26 / PDF p. 43 of Steen's
NASA-hosted thesis, at Re≈3 million. CD readings have roughly ±0.001 uncertainty;
they are not precise raw wind-tunnel samples. The attached slope and zero-lift
angle are similarly low-order approximations. The 14 m aircraft's characteristic
Reynolds number is of the same order at cruise, but this does not validate a
flapping-wing transfer of steady section data.
[Airfoil comparison](https://ntrs.nasa.gov/api/citations/19950022917/downloads/19950022917.pdf#page=43).

Finite-span slope and induced drag are applied separately with e=0.75. The 1.5
profile-drag roughness allowance and 0.9 m² total equivalent body drag area are
scenario estimates. Body drag is itemised as pilot/cockpit, fuselage/tail, gear
and bracing/installation. No empirical whole-aircraft fit is claimed. The stall
transition to a flat-plate envelope is an imposed approximation, not extracted
post-stall NACA data.
[Finite-wing drag equation](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/induced-drag-coefficient/).

Snowbird's developers measured more glide drag than predicted and adjusted their
analysis; this illustrates why section data alone cannot validate the whole
aircraft. Their documented twisting/wing-motion coupling informs our choice of
a strip model, not a transfer of their human-powered performance.
[Aerovelo technical account](https://www.aerovelo.com/snowbird-technical-info).

We use 16 strips total, not CFD. Local wing velocity changes the relative flow;
section lift is perpendicular to that flow and can have a forward component.
The aerodynamic work is computed from force and wing velocity. There is no
constant propulsion efficiency or extra thrust supplied from throttle alone.
This leaves unsteady wake, added-mass, dynamic-stall and structural coupling
outside the model. Twist pitching moments are omitted; all losses are therefore
still provisional even though the represented drive-work ledger balances.
The thin rendered panels stand in for the specified section; this is not an
airfoil-pressure solution computed from triangle geometry.

## Controls and validation boundaries

Pitch and roll have damped rate dynamics. Neutral bank does not auto-level and
bank does not automatically increase lift. This remains a reduced attitude
model, not full six-degree-of-freedom torque/stability analysis.

The v5 runways are 650×28 m and 550×26 m to accommodate the larger aircraft.
Terrain tessellation, hills and 48 instanced trees remain lightweight; there are
no other aircraft, trains, lakes, animals, animated scenery or external assets.

The handwritten reference and deliberately broken variants calibrate software
checks only. Sensitivity runs vary non-pilot mass, body drag and transmission efficiency to
expose remaining uncertainty. No new paid model trials are implied. V4 model
submissions, raw responses, screenshots and scores remain unchanged.
