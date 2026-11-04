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
    timed = profile.get('budget_mode') == 'wall_time'
    expected = {*fields, 'profile_id', 'reasoning_effort', 'output_token_notice_percentages'}
    if timed:
        expected.update(('budget_mode', 'time_notice_percentages'))
    if set(profile) != expected:
        raise ValueError('Generation profile may override only the declared budget fields')
    if not isinstance(profile['profile_id'], str) or not profile['profile_id'].strip():
        raise ValueError('Generation profile requires a nonempty profile_id')
    for name in fields:
        if timed and name in ('max_output_tokens_total', 'max_output_tokens_per_response', 'max_requests'):
            if profile[name] is not None:
                raise ValueError('Time-only profile must not retain token or request-count caps')
        elif type(profile[name]) is not int or profile[name] <= 0:
            raise ValueError('Invalid generation-profile budget: ' + name)
    notices = [] if timed else [50, 75]
    if profile['reasoning_effort'] != 'medium' or profile['output_token_notice_percentages'] != notices:
        raise ValueError('Generation profiles require medium reasoning and 50%/75% notices')
    if timed and profile['time_notice_percentages'] != [50, 75]:
        raise ValueError('Time profile requires 50%/75% time notices')
    if not timed and profile['max_output_tokens_per_response'] > profile['max_output_tokens_total']:
        raise ValueError('Per-response allowance exceeds the total output allowance')
    if not timed:
        config.pop('budget_mode', None)
        config.pop('time_notice_percentages', None)
    config.update({name: value for name, value in profile.items() if name != 'profile_id'})
    config['generation_profile'] = {'id': profile['profile_id'], 'sha256': hashlib.sha256(raw).hexdigest()}
    return config


def validate_config(config):
    if config.get('budget_mode') not in (None, 'wall_time'):
        raise ValueError('Unsupported budget mode')
    timed = config.get('budget_mode') == 'wall_time'
    for name in ('max_output_tokens_total', 'max_output_tokens_per_response', 'max_requests',
                 'max_wall_seconds', 'max_submission_bytes'):
        if timed and name in ('max_output_tokens_total', 'max_output_tokens_per_response', 'max_requests'):
            if config.get(name) is not None:
                raise ValueError('Time-only config cannot set token or request-count caps')
        elif type(config.get(name)) is not int or config[name] <= 0:
            raise ValueError('Invalid budget: ' + name)
    config['reasoning_effort'] = config.get('reasoning_effort') or 'medium'
    for name, default in [('output_token_notice_percentages', [] if timed else [50, 75]),
                          ('time_notice_percentages', [50, 75] if timed else [])]:
        values = config.setdefault(name, default)
        if (not isinstance(values, list) or any(type(p) is not int or not 0 < p < 100 for p in values)
                or values != sorted(set(values))):
            raise ValueError('Invalid notice percentages: ' + name)
    if timed and config['output_token_notice_percentages']:
        raise ValueError('Time-only runs use time notices, not token notices')
    return config
