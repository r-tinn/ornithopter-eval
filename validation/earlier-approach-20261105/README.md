# Earlier Approach start

Interactive host preset update, not a model rerun or new score. Approach moves
from mid-runway at 5 m above contact to 450 m before the runway at 100 m above
local gear contact. It remains paused, at the engineering glide speed/pitch,
with zero throttle and stationary wings. Reset/takeoff is unchanged.

The saved v7 pair is served through a labelled playback overlay. `?original=1`
retains the recorded 5 m preset. All archived submissions, scores, captures,
transcripts and ZIP bytes are unchanged; `archive-integrity.json` records their
hashes. Future v7 packets contain the new preset directly.

`complete-100m/browser-review.json` covers both models at both airfields. All
four start at the requested distance/clearance, zero-power glide still descends
without fuel use, and throttle releases the glide clutch. Browser errors are
empty, Reset still starts on the runway, and original playback still starts at
5 m. Screenshots show the initial state and the end of each powered observation.

The additional 20-second hands-off, full-throttle survival hypothesis **fails
for all four scenarios**. 5.6 touches down on Valley's approach terrain before
lifting briefly again; the other three scenarios crash. The initial review
stopped at the first failed case; the complete review retains all four. These
failures are model-flight observations, not a failure to apply the new preset.
More starting height does not repair the glide-to-powered transition: in the
saved 6.1 model, counterfactual 200 m/400 m starts still crash after about
20/36 seconds with neutral pilot input (`height-diagnostic.json`). The wings
do not establish sustained powered flapping during those descending cases.

The existing airborne stability grader starts with the mechanism already
rotating, so its pass does not establish successful engine/wing startup from
glide. No aircraft physics or grade was changed to conceal this distinction.
