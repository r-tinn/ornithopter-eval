# Run it yourself

Use Python 3.10+, Node.js 24 and pnpm 11.19.0. From the repo root:

```sh
pnpm install --frozen-lockfile
export PLAYWRIGHT_BROWSERS_PATH="$PWD/.cache/browsers"
pnpm exec playwright install chromium
```

On Linux, use `pnpm exec playwright install --with-deps chromium` if system
dependencies are missing. Grading uses a loopback server and sandboxed Chromium.

## Fly the originals — no API key

```sh
python3 -m analysis.restore_model_progress runs/published
python3 -m ornithopter_eval serve-artifacts runs/published --port 8765
```

Open [the local workbench](http://127.0.0.1:8765/), pick a run, then select
**Fly simulator**. The published bundle restores each aircraft byte for byte
from the shared world and the four editable files. It includes verdicts and
hashes, not raw model transcripts. The saved file-only audit verdict is kept.

## Rerun all ten checks — no API key

```sh
python3 -m ornithopter_eval regrade-experiment runs/published \
  --output runs/published-regrade --grading-revision airframe-binary-v7
```

Open the regrade using the same `serve-artifacts` command with the new directory.
Results and captures are written locally. A failed file-only audit scores zero.
There are no human or LLM judges. See the [rubric](AIRFRAME_BINARY_V7.md) and
[calibration](../validation/airframe-binary-v7.json). The plotted scores are
retrospective: the saved attempts informed the grader revisions.

To redraw the chart, install `requirements-plots.txt` in a virtual environment
and run `python3 -m analysis.plot_model_progress`.

## Generate new aircraft — uses your API credits

Set your own `OPENAI_API_KEY` locally. If using `.env`, keep it Git-ignored
with permissions `0600`. The command below starts 18 attempts. Trim the
model list or lower the repeat count if you only want a smoke test.

```sh
python3 -m ornithopter_eval compare \
  --models gpt-5.4 gpt-5.5 gpt-5.6-sol gpt-6-astra gpt-6.1-sol gpt-6.2-astra \
  --repeats 3 \
  --config configs/source-first-airframe-v4.json \
  --grading-revision airframe-binary-v7 --sequential --stop-on-error \
  --output runs/my-comparison
```

The config keeps the existing prompt, medium reasoning and 480-second deadline.
The grading flag selects the ten checks separately. The command saves submissions,
rollouts, diagnostics and grader evidence. Model access and aliases can change. Fresh attempts can score differently. Run the offline regression suite with `pnpm test`.
