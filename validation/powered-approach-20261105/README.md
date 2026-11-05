# Already-powered Approach

The owner requested that Approach start with the wings already flapping and
useful motor power, after the earlier stopped-wing glide restart failed. This
is an interactive initial-condition change, not a model rerun or grade revision.

Approach starts paused, 450 m before the runway and 100 m above local gear
contact, with forward speed 16 m/s, pitch 0.1 rad, wing angular speed 6 rad/s,
low-speed timing bias and 90% throttle. It is not in glide mode. Initial
translation and mechanism kinetic energy belong to this preset's initial
state; no free engine work or successful restart is claimed. Reset still
starts on the runway with zero throttle and stationary wings.

`browser-review.json` observes the actual host preset in both saved v7 models,
at both airfields, at default 90% throttle and after selecting 100%. Each
scenario runs 60 simulated seconds through the production physics with neutral
pilot input, recording state every second. All eight scenarios remain flying,
with positive clearance, rotating wings, fuel consumption and no browser errors.
The default-throttle screenshots show initial and final views.

| Model | Airfield | Throttle | Minimum sampled clearance | Clearance after 60 s |
|---|---|---:|---:|---:|
| GPT-5.6 Sol | Valley | 90% | 100.66 m | 130.25 m |
| GPT-5.6 Sol | Valley | 100% | 100.76 m | 147.47 m |
| GPT-5.6 Sol | Meadow | 90% | 76.98 m | 112.99 m |
| GPT-5.6 Sol | Meadow | 100% | 81.67 m | 130.21 m |
| GPT-6.1 Sol | Valley | 90% | 100.67 m | 130.25 m |
| GPT-6.1 Sol | Valley | 100% | 100.76 m | 147.45 m |
| GPT-6.1 Sol | Meadow | 90% | 77.01 m | 112.99 m |
| GPT-6.1 Sol | Meadow | 100% | 81.70 m | 130.19 m |

Minimum clearance is sampled once per second; flight status is checked at every
saved sample. This observation covers straight, neutral-input flight for one
minute, not arbitrary control inputs, takeoff or glide-to-powered recovery.

Archived submissions, scores, captures, transcripts and ZIP bytes are unchanged
(`archive-integrity.json`). Current v6/v7 playback gets a labelled host-preset
overlay; `?original=1` retains the recorded preset. The independent glide
physics/check remains unpowered. The earlier failed restart observations remain
in `../earlier-approach-20261105/` without being relabelled as successes.
