# airframe-binary-v3

The score stays out of ten. Only the wing-drive check changes from
[airframe-binary-v2](AIRFRAME_BINARY_V2.md). No rear-truss point, no human or
LLM judge. A failed file-only audit still zeros the attempt.

The updated check keeps the original moving-member test and adds two ways to pass:

- **Instanced linkage:** compose each instance matrix with the mesh world matrix.
  Track the resulting slender members over 24 phases and check for a fixed
  endpoint pairing within 120 mm throughout the cycle. Both members must move
  more than 25 mm and collectively reach from below the root toward the wing.
- **Cam and follower:** look at the triangles of a moving cam-like mesh in
  aircraft coordinates. A moving follower must reach towards the wing and
  keep its drive-side endpoint within 60 mm of the cam surface at every sampled
  phase. This is a proximity allowance for the rendered joint, not proof of
  physical contact, power transmission, or valid dynamics.

Neither path uses mesh names or model names. Both reject the independent
frozen and disconnected geometry controls in `tests/wing-drive.test.mjs`.
The browser also accepts the existing author reference and rejects the
frozen-drive author mutant. The prior rubric and reports remain available.
The three saved GPT-6.2 Astra reruns are retrospective regression cases;
they informed this change and are not held-out validation.
