"""Airframe scoring versions, separate from the model-facing prompt versions."""

AIRFRAME_REVISIONS = tuple(f'airframe-binary-v{i}' for i in range(1, 8))
AIRFRAME_GRADING_REVISION = AIRFRAME_REVISIONS[0]
AIRFRAME_BROWSER_REVISIONS = AIRFRAME_REVISIONS[2:]
LATEST_AIRFRAME_REVISION = AIRFRAME_REVISIONS[-1]
