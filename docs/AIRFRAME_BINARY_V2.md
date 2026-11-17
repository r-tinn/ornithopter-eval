# airframe-binary-v2

Use `configs/source-first-airframe-v2.json` for new cohorts. The score is out of
ten: seven existing flight/wheel checks and three deterministic airframe checks
(pilot clearance, wing-drive linkage, wingtip motion). A failed file-only audit
still zeros the attempt. There are no human or LLM judges.

This is a scoring subset of [airframe-binary-v1](AIRFRAME_BINARY_V1.md): rear-truss
geometry is no longer required or scored. The underlying browser kernel and
calibrated predicates are unchanged; raw inspections may still include historic
truss diagnostics. The author reference passes all ten retained checks. The v1
config, /11 results and calibration evidence remain available.

The wing-drive predicate recognizes two moving slender members whose endpoints
stay within 120 mm throughout 24 sampled phases. It does not generalize to all
drive mechanisms. On saved GPT-6.2 Astra run 2 it misses the connecting rod
rendered inside an InstancedMesh: the detector reads the base mesh without the
per-instance transforms. Run 3 uses a grooved face cam and rocker follower;
the predicate does not track cam-surface/follower contact. These are limitations
of the grading predicate, not evidence that those designs have no drive.
