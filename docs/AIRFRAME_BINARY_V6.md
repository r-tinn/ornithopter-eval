# airframe-binary-v6

This is a grader-only change to
[airframe-binary-v5](AIRFRAME_BINARY_V5.md). The task prompt, source packet,
submissions, other eight checks and the file-only gate are unchanged.
There are ten binary points. No human or LLM judge is used.

- **Pilot clearance:** retain the 20 cm sampled head gap to swept wings and
  moving hardware. Test penetration deeper than 8 mm only between 15 and
  62 cm below the top of the seated pilot mesh. The band is an approximate
  torso and arms region; it excludes ordinary leg and foot geometry but
  can include raised knees or miss very low arms. It is not an anatomical
  classifier. Penetration outside the band does not itself lose the point.
- **Wing drive:** require an uninterrupted sampled crank/rod or cam/follower
  path to a moving wing. The same joint endpoints must remain connected.
  For cranks, allow 25 mm of pivot drift and arm length variation and up
  to 80 mm of pin-to-rod gap. At the wing end, allow the attachment to slide
  along the same inner wing, within 140 mm at each phase, rather than track
  one exact material point. Cam surface proximity and the rocker option
  are unchanged. A spinning wheel next to a detached rod still fails.
  This checks rendered motion, not transmitted forces.

The v6 author fixtures preserve a clean reference, accept lower-body-only
overlap, and reject torso and arm intrusions, a close head, a disconnected
rod and a frozen drive. Earlier grader revisions and reports are retained.

Offline reproduction (no API tokens):

```sh
PYTHONPATH=. python3 analysis/regrade_airframes.py --revision airframe-binary-v6 --rerun-all --output runs/fresh-local-regrade --node /path/to/node
PYTHONPATH=. .cache/plotting/bin/python analysis/summarize_airframe_comparison.py runs/fresh-local-regrade
```
