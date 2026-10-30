# Mechanical v4: shared-world candidate

This is the revised task, fixed environment and proposed grader boundary for
review. It is self-contained in this repository. Only the terrain formula,
palette, simple tree construction and runway concept were adapted from the
owner's original simulator; PROVENANCE.json records the source file hashes.
Three.js and its MIT license are vendored with the scaffold.

The scene contains one 64×64 terrain grid (8,192 triangles), 48 instanced trees
and two landing strips. It has no other aircraft, vehicles, water features or
animated scenery. Shadow maps and post-processing are off, pixel ratio is capped
at 1.25 and rendering is capped at 60 Hz. Paused scenes render only on interaction.
Aircraft complexity and browser/GPU performance still affect total load; the
scene does not claim zero cost or a hardware-independent frame rate.

## Preview the proposed world and integration

```sh
python3 -m ornithopter_eval prepare-world runs/mechanical-v4-review --reference
python3 -m ornithopter_eval serve-world runs/mechanical-v4-review --port 8766
```

Open http://127.0.0.1:8766/. The preview uses a newly handwritten mechanical
aircraft and pedagogical flight implementation, explicitly marked as a withheld
fixture. It is not a frontier-model result and not copied from the old aircraft.
Start with motor power, then use the arrow keys. The World camera shows the
whole small landscape. The airfield buttons reset to either strip.

## Inspect the empty model packet

```sh
python3 -m ornithopter_eval prepare-world runs/mechanical-v4-empty
python3 -m ornithopter_eval serve-world runs/mechanical-v4-empty --port 8767
```

This packet has the same world/UI but aircraft and physics stubs. Only three
files are writable through CandidateFilePolicy; shared files are hashed. It has
no working aircraft or solved dynamics. No original-project files are needed
at preparation or runtime, and no package installation or asset downloads occur.

Read TASK.md, AIRCRAFT_API.md, SOURCE_AUDIT.md, engineering.json and GRADERS.md
before freezing the next calibration. The model packet omits the reviewer audit
and withheld fixture. It includes only the two selected original photographs.

Run `python3 -m ornithopter_eval validate-world` to check standalone loading,
the small scene footprint, real wheel clearance, on-demand paused rendering,
takeoff and landing on both strips, with screenshots. This is a regression of
the supplied world and handwritten fixture, not model grading or image judging.

This candidate cannot be submitted to the existing run/compare commands. Those
commands still implement the archived v3 task. V4 harness/grader integration and
model trials follow review of this new task and environment; no v4 model scores
or completed image-judge calibration are claimed here.
