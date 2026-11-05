# Capture studio verification

This is a local recording/presentation feature, not new model calibration.
All aircraft implementations, source packets, raw reports and archived scores
stay as recorded. The new viewer adds a camera sweep and local media export.

The final clips and test evidence are in `library-final/`. Open its `index.html`
to preview or download two illustrative MP4 films. Each records the unchanged
saved v7 model from powered Approach after 30 seconds of actual simulated
flight. The camera follows the same interpolated pose as the displayed craft.
It does not feed anything back into the physics.

`tests/capture-studio.smoke.mjs` runs a real-clock recording in each saved model,
decodes the resulting video, checks 1920 × 1080 resolution and roughly eight
seconds of media, and compares two decoded frames for motion and nonblank
scene content. It also downloads 1080p PNGs, verifies that Capture current view
preserves state/camera, exercises 12-second selection plus an early manual stop,
and checks narrow-window layout/aspect. Both final scenarios pass with no
browser page errors. `library-final/review.json` includes media and timing details.

The root `review.json` preserves the initial failed test. Both videos decoded
and contained motion, but the test required over 6.5 simulated seconds during
eight wall-clock seconds; the second model missed that timing assertion under
shared CPU load. That assertion was not a guarantee the recorder could make.
The final test checks actual simulation advancement and decoded motion, and
records wall/simulation durations separately instead of claiming real-time
performance. The earlier verified observations advanced 7.92 s (6.1) and7.17 s (5.6) of flight
for approximately eight-second videos. The 30 fps setting is a target, not
independent evidence of presented-frame rate or model performance. The original
failed report and its clips remain beside this file.

The capture controller uses browser canvas capture and MediaRecorder, preferring
MP4 with WebM fallback. There are no recording dependencies or external uploads. The local viewer persists clips and PNGs in the Git-ignored `captures/<cohort>/` directory, separate from immutable trial files. Saved clips remains available after reloading. Export
resolution is independent of the window size. Resources/timers are stopped on
completion, early stop, exit or hiding the tab; object URLs are retired when
replaced or the page unloads. Real-time recording targets 30 render/capture
frames per second while keeping the existing physics time step.

The retrospective v7 host replacement is guarded by hashes of the unchanged
shared environment, with every override recorded in `viewer-camera.json` and
human-rating provenance. Older v6 hosts do not receive this capture overlay.
An original-playback option remains available. The independent grader server's
media restrictions are unchanged; the human artifact viewer permits local/blob
video previews. No external media source is allowed.

Validation: 96 Python tests, 16 JavaScript tests, both decoded 1080p MP4 exports,
PNG downloads, early stop and mobile layout. A further manual test in the actual
in-app browser produced an MP4 and displayed its looping preview/save link.

The first local-library smoke run is preserved in `library-verified/`. Its early-stop assertion read the previous preview before the replacement video loaded; the test now waits for a new media URL and decoded frame. The final library run verifies persistence and downloads for both models. A manual in-app recording also saved to the local library. An attempted automation of its download was interrupted after hanging; no native-browser download success is claimed.
