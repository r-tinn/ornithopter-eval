# airframe-binary-v5

Ten deterministic binary checks. The seven flight/wheel checks, wingtip
motion, and file-only gate stay unchanged. Rear structure is unscored.
To use only the new graders, keep `--config configs/source-first-airframe-v4.json`
and add `--grading-revision airframe-binary-v5`. The v4 generation packet remains
unchanged. The v5 prompt configuration is retained for provenance of the
cancelled prompt-change run, not the default.

## Pilot clearance

The body-penetration check, including v4's shallow foot allowance, remains.
Additionally, the uppermost 15 cm of the visible pilot mesh must have a
sampled gap of at least 20 cm to the rendered wings and moving hardware.
The browser samples 48 phases each at both timing settings. Hardware is
screened by motion at three tracked vertices (>25 mm from phase zero).
The gap is a sampled head-vertex-to-triangle distance, with instance
transforms and nearest points saved. It is not continuous collision
detection, a full anatomical model, or an airworthiness requirement.
20 cm is an illustrative benchmark allowance intended to leave room
around a head-sized envelope.

## Connected wing drive

A crank path must show a grounded pivot (within 10 mm of its starting point),
an approximately rigid crank arm (length variation ≤8 mm), a moving pin
matched to the same rod endpoint (within 45 mm at every sampled phase), and
the other endpoint following the same wing material location (within
100 mm throughout). The probe also tracks instanced rods.

A cam path must keep the same moving follower endpoint within 60 mm of the
moving cam surface through all sampled phases. The other endpoint must
either follow a wing material point or form a grounded rocker near the
hinge whose angular excursion follows that wing (within 0.15 rad).
The test samples 24 phases. A rod with a fixed base beside a separately
spinning pulley is insufficient. These are geometric checks on rendered
motion; they do not establish transmitted torque or certify the mechanism.
Some valid alternative mechanisms are outside the current check's scope.

See `analysis/calibrate_airframe_v5.py` for author positives, a borderline
clearance case, a near-head case, a disconnected rod, and a frozen drive.
Earlier scores and revisions are preserved. Regrading old submissions is
retrospective; they did not receive these requirements.
