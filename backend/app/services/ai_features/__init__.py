from .registry import ai_rule, get_algo_handlers, list_rules

try:
    from .helmet import analyze as analyze_helmet
    from .helmet import detect as detect_helmet_frame
    from .helmet import detect_safety_helmet
    from .phone import detect_phone
    from .phone import detect_phone_alarm
    from .fire import detect_fire_alarm
    from .smoking import detect_smoking
    from .smoking import detect_smoking_alarm
    from .vest import detect_vest_alarm
except Exception:
    pass

__all__ = [
    "ai_rule",
    "get_algo_handlers",
    "list_rules",
]
