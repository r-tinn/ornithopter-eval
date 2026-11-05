# Second-runway relocation

Author-fixture scenery checks only; these are not model results.

The v7 Meadow strip moved from (780, 285) to (950, 1280), beyond the southern
ridge. Its centre is 1,798 m from Valley and 65.1 m above the world datum. The
runway dimensions, terrain mesh, tree count and aircraft/task physics are unchanged.

`overview/` is the final review: world and Meadow chase screenshots,
`world-review.json`, and the seven-check author-reference report in `positive/`.
The overview uses a wider camera, longer fog distance and a 20 m near plane to
avoid depth flicker on distant runway surfaces. Other views retain their camera
and fog settings.

The geometry review sampled both runway rectangles and their contact surfaces,
compared the Valley neighbourhood against the previous committed world, and
checked the ridge between the airfields. Differences below 1e-12 m are floating
point rounding. Browser review found no page errors; counts remain 8,192 terrain
triangles, 48 trees and two strips.

The root screenshots and `final/` retain intermediate camera reviews. The initial
geometry assertion required bitwise equality and rejected a 7e-15 m rounding
difference; `initial-review.log` preserves that failure. No model trials were
involved in these reviews. The existing nine targeted grader mutants remain in
`../source-first-v7/`; no grader changed for this scenery update.
