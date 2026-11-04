"""Explicit generation-budget overlays; never reinterpret an archived configuration."""
import hashlib
import json
from pathlib import Path


def load_config(path, generation_profile=None):
    config = json.loads(Path(path).read_text())
    if generation_profile is None:
        return config
    raw = Path(generation_profile).read_bytes()
    profile = json.loads(raw)
    fields = ('max_output_tokens_total', 'max_output_tokens_per_response', 'max_requests',
              'max_wall_seconds', 'max_submission_bytes')
    if set(profile) != {*fields, 'profile_id', 'reasoning_effort', 'output_token_notice_percentages'}:
        raise ValueError('Generation profile may override only the declared budget fields')
    if not isinstance(profile['profile_id'], str) or not profile['profile_id'].strip():
        raise ValueError('Generation profile requires a nonempty profile_id')
    for name in fields:
        if type(profile[name]) is not int or profile[name] <= 0:
            raise ValueError('Invalid generation-profile budget: ' + name)
    if profile['reasoning_effort'] != 'medium' or profile['output_token_notice_percentages'] != [50, 75]:
        raise ValueError('Generation profiles require medium reasoning and 50%/75% notices')
    if profile['max_output_tokens_per_response'] > profile['max_output_tokens_total']:
        raise ValueError('Per-response allowance exceeds the total output allowance')
    config.update({name: value for name, value in profile.items() if name != 'profile_id'})
    config['generation_profile'] = {'id': profile['profile_id'], 'sha256': hashlib.sha256(raw).hexdigest()}
    return config
