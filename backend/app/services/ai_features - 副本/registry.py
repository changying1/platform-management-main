# backend/app/services/ai_features/registry.py

from __future__ import annotations
from dataclasses import dataclass
from typing import Callable, Dict, Optional, Tuple, Any

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
    """
    AI规则注册装饰器
    """

    def decorator(fn: DetectFn) -> DetectFn:

        if key in _RULES:
            print(f"⚠️ AI规则重复注册: {key},将被覆盖")

        _RULES[key] = RuleSpec(
            key=key,
            fn=fn,
            desc=desc,
        )

        print(f"🧠 注册AI规则: {key}")

        return fn

    return decorator


def ensure_loaded():
    """
    自动扫描 ai_features 目录
    """

    global _LOADED
    if _LOADED:
        return

    pkg_dir = os.path.dirname(__file__)
    pkg_name = __package__

    for mod in pkgutil.iter_modules([pkg_dir]):

        name = mod.name

        if name.startswith("_"):
            continue

        if name in ("registry", "__init__"):
            continue

        importlib.import_module(f"{pkg_name}.{name}")

    _LOADED = True


def list_rules() -> Dict[str, RuleSpec]:

    ensure_loaded()

    return dict(_RULES)


def get_algo_handlers(service):

    ensure_loaded()

    handlers = {}

    for key, spec in _RULES.items():

        handlers[key] = lambda frame, _fn=spec.fn: _fn(service, frame)

    return handlers