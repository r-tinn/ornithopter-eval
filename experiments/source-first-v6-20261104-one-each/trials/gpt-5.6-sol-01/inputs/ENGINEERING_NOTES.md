# Frozen v6 engineering completion

Stanley's readable principles lead the task. Original photos02,08–15 are
attached. SOURCE_GUIDE.md maps their roles and uncertainties. The full-size
mechanical aircraft's numerical parameters are additions, not notebook values.

The original228.5kg budget and early phase/twist/engine-governor choices did not
give reliable takeoff in the coupled reference. Those author experiments are
retained in runs/source-v6-reference-development. No generator model results
were used to choose parameters. This revision uses a favourable composite/ideal
linkage mass estimate:173.9kg dry including55kg adult pilot, plus3.6kg petrol,
177.5kg initially. Wings30kg, fuselage20,tail5,gear8,engine16.9,transmission12,
installation8,cockpit6,tank3,contingency10. This is not a structural weight proof.
The engine and pilot assumptions still serve the source's human-carrying aim.

Retain16kW shaft maximum, finite fuel and85% transmission efficiency. The
300kgm² drive inertia is reflected to the slow wing crank, separate from the
moving-wing mass. For scale, an assumed.047kgm² input rotor reflected through an
80:1 reduction is301kgm²; this is an engineering hypothesis, not an engine
manufacturer measurement. Torque is capped at3200Nm before transmission.
The governor must actually reach the cap under load: an earlier low gain could
never request the full16kW across its speed range. No speed is prescribed.

The16.9kg engine-package anchor, fuel energy and earlier reference sources are
documented in ../mechanical-v5/ENGINEERING_NOTES.md. All runtime data are bundled
here; no code or assets depend on another checkout. CDA=.53m² is a favourable
partly faired cockpit/streamlined-structure estimate, broken down in JSON.
It replaces a conservative.9m² estimate; it is not a measured aircraft drag area.

Two half-length outer leaves slide and overlap on recovery. Visible shape,
exposure, camber and both leaves' mass use the same coordinates. Inner thickness
ratio.055 and thin curved outer material.008 are distinct from camber. The
two illustrative section tables cover a nominal full-scale regime around
Re5e5–3e6; their accuracy is unvalidated. Photo08's uncertain low-Re chart is
context, not a data table we claim to have recovered. Nominal extended AR and
span efficiency are used in the simple induced-drag term throughout the cycle.

The body/wing kinetic model follows standard Lagrange mass-matrix construction:
point positions relative to whole-system CG yield A,B,C and phase derivatives.
See [MIT multibody dynamics](https://underactuated.csail.mit.edu/multibody.html).
This supports the method, not these aircraft parameters. The longitudinal
reduction omits roll/yaw inertia coupling, local section pitching moments,
unsteady wakes, overlap flow and flexible structure. Forces act at declared
material points and account for their represented motion/work. Ground contact
uses a stated constrained reduction; it is not a landing-gear suspension model.

Twist feathers against stroke velocity; using displacement instead was an early
unfavourable motion choice. The timing-bias setting supplies different working/
recovery durations without prescribing phase speed. Spring, inertia, aerodynamic
load and motor torque determine phase acceleration. Changes of linkage setting
or glide configuration require a fresh initialisation, preventing a free
in-flight change in stored energy.

The deliberate glide initial condition solves zero pitch moment and weight/
drag balance of the frozen extended-wing model. Its predicted L/D≈7.29 is a
model consequence. Starting the new model at the older16m/s approach speed
caused a large transient, so it is not used as a steady-glide acceptance target.
Perturbed-speed tests retain honest dynamics and energy accounting. No altitude
or flight-path controller is part of free flight.
