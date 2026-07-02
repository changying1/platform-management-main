from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Dict, Optional, Tuple

import importlib
import os
import pkgutil

DetectFn = Callable[[Any, Any], Tuple[bool, Optional[dict]]]


@dataclass(frozen=True)
class RuleSpec:
    key: str
    fn: DetectFn
    desc: str = ""


_RULES: Dict[str, RuleSpec] = {}
_LOADED = False


def ai_rule(key: str, desc: str = ""):
    def decorator(fn: DetectFn) -> DetectFn:
        _RULES[key] = RuleSpec(key=key, fn=fn, desc=desc)
        return fn

    return decorator


def ensure_loaded():
    global _LOADED
    if _LOADED:
        return

    pkg_dir = os.path.dirname(__file__)
    pkg_name = __package__

    for mod in pkgutil.iter_modules([pkg_dir]):
        if mod.name.startswith("_") or mod.name in {"registry", "__init__"}:
            continue
        importlib.import_module(f"{pkg_name}.{mod.name}")

    _LOADED = True


def list_rules() -> Dict[str, RuleSpec]:
    ensure_loaded()
    return dict(_RULES)


def get_algo_handlers(service):
    ensure_loaded()
    return {key: (lambda frame, device_id=None, _fn=spec.fn: _fn(service, frame, device_id=device_id)) for key, spec in _RULES.items()}
