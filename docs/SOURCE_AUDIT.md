# Source audit · 29 October 2026

The 15 original archive photographs were checked against the archive's SHA-256
inventory. Original authorship/title provenance is described by the family archive
as *Bird flight as a guide to ornithopter design*, © 2007 Stanley J. O. Tinn.
Individual reproduced plates retain their original attribution; ownership or
reproduction rights are not newly asserted by this repository.

Selection used the existing per-photo readings and arithmetic review in the local
archive. Photos 02, 03, 04 and 14 were also directly visually inspected during this
work. The other entries below rely on those existing archive readings; this is
not a fresh expert authentication of every photograph or every handwritten mark.

| Photo | v1 decision | Reason |
|---|---|---|
| 01 | Exclude | Shadows, cropped margin and uncertain pencil dimensions. |
| 02 | Include scoped fields | Clear outline, rounded dimensions, area and aspect-ratio relationship. Exclude erroneous wing length, unavailable comparison and crossed-out area revision. |
| 03 | Exclude | Clear but belongs to the different Standard Model Swan parameter set; BE50 data absent. |
| 04 | Exclude | Different nominal swan; speed-unit and component-weight discrepancies. Avoid mixing parameter sets. |
| 05 | Exclude | Reproduced wake figure; no needed quantitative requirement. |
| 06 | Exclude | Background species comparison, not a task-specific geometry specification. |
| 07 | Exclude | Ambiguous normalization/legend, revisions and uncertain settings prevent exact force targets. |
| 08 | Exclude | Multi-axis curved-plate polar with unclear read-offs; not BE50. |
| 09 | Context only | Purpose and provenance; unnecessary for the bounded numeric task. |
| 10 | Exclude | Qualitative wake argument, insufficient quantitative implementation constraints. |
| 11 | Exclude | Heavily revised trajectory argument and missing footnote; avoid rewarding a prescribed decorative sine path. |
| 12 | Exclude | Useful elastic/two-panel discussion, but no spring/inertia/kinematics specification. |
| 13 | Exclude | Goshawk section/camber examples, not the selected swan. |
| 14 | Include qualitative fields | Readable conventional tail/fin/rudder and arm/hand wing discussion. Exclude exact stroke axes, stiffness and speculative vortex landing. |
| 15 | Exclude | Missing algorithm appendix; ambiguous efficiency and handwritten power expression. |

The curated object is a **coherent subset of fields**, not a claim that every
visible statement on selected pages is consistent. Known excluded fields remain
unaltered and explicitly excluded in the model-visible source guide. No answer
transcription or existing simulator is supplied to the evaluated model.

This v1 deliberately covers a swan-scale reference, not the previous human-pilot
simulators. Mass, engine power, polar, stroke animation, ground contact and
control response are new, explicitly published benchmark assumptions. Their
purpose is a testable software task; they do not establish that a real mechanism
could produce the assumed forces or fly.

`task/source-manifest.json` inventories all originals and selects only two to copy
into task inputs. `python3 -m ornithopter_eval verify-sources` verifies those two
unchanged repository copies. The full archive and earlier implementation remain
outside this repository's model-visible packet.
