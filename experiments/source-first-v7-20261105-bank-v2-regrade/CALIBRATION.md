# Height-gated banking regrade

Same five saved submissions. No model APIs or repaired aircraft. Previous full-throttle and launch-v1 results remain archived. Initial full-throttle reports are linked from this page.

| Model | Previous launch-v1 | Height-gated bank-v2 | Complete flight | File-only validity |
|---|---|---|---|---|
| gpt-6.1-sol | 6/7 | 7/7 | Pass | Pass |
| gpt-6-astra | 6/7 | 7/7 | Pass | Pass |
| gpt-5.6-sol | 6/7 | 6/7 | Pass | Pass |
| gpt-5.5 | 4/7 | 4/7 | Fail | Fail — excluded from means |
| gpt-5.4 | 0/7 | 0/7 | Fail | Pass |

## Why the bank controller changed

The old 60% profiles banked at 62 s with only about 4.5 m clearance and about 2 s since confirmed takeoff. They reached 19 degrees in 2 s, peaked at 12 degrees/s and stayed banked. Disabling bank on the same 65% launches let Sol and Astra fly to 120 s with about 62 m clearance; all pre-bank sampled states matched exactly. Loss of vertical lift is real physics. The low-altitude clock-based pilot was unsuitable.

The revised controller waits for 30 m tyre clearance for 3 s and at least 5 s since confirmed takeoff, then rolls into the original 0.45 rad target over 8 s, holds 6 s, rolls out over 8 s and observes 8 s recovery. Readiness has a 150 s deadline. Actual banking and airborne recovery remain required. No constant, engine, crash limit, force compensation or model code changed.

| Model | Launch profile | Bank begins | Starting clearance | Minimum bank/recovery clearance | Final recovery clearance | Full result |
|---|---|---|---|---|---|---|
| gpt-6.1-sol | 60% | 102.72 s | 32.86 m | 6.78 m | 20.57 m | Pass |
| gpt-6-astra | 60% | 102.67 s | 32.86 m | 6.82 m | 20.70 m | Pass |
| gpt-5.6-sol | 60% | 102.82 s | 32.84 m | 32.86 m | 52.39 m | Pass |
| gpt-5.5 | 60% | 103.53 s | 32.67 m | 32.68 m | 52.93 m | Fail: independent trajectory forces |
| gpt-5.5 | 65% | 94.56 s | 32.76 m | 32.78 m | 52.48 m | Fail: independent trajectory forces |
| gpt-5.5 | 70% | 87.93 s | 33.10 m | 33.12 m | 51.04 m | Fail: independent trajectory forces |
| gpt-5.4 | 60% | not reached | — | — | — | Fail: independent trajectory forces, energy derivatives, bank/recovery not completed, no sustained takeoff |
| gpt-5.4 | 65% | not reached | — | — | 0.00 m | Fail: independent trajectory forces, energy derivatives, bank/recovery not completed, no sustained takeoff, crashed |
| gpt-5.4 | 70% | not reached | — | — | 0.00 m | Fail: independent trajectory forces, energy derivatives, bank/recovery not completed, no sustained takeoff, crashed |

The corrected reference passes 7/7; eight contact/timestep variants pass. All nine original mutants and a roll-input-ignored mutant are rejected. Original/v1 power probe outputs match exactly. This is controller calibration, not real-aircraft flight validation. GPT-5.5 still fails independent forces and separate file-only validity. Human aesthetic ratings are not inferred.

See bank-evaluation.html for the readable comparison and per-attempt table, GRADING_REVISION.md for the complete protocol, and each revised report for controls, bank stages and trajectories. Generic production inspection screenshots are not a film of the scripted manoeuvre. Fly simulator opens the unchanged aircraft with the separately labelled host/preset overlay.
