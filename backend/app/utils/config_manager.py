import os
import json
from datetime import date

# 配置文件路径
CONFIG_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "system_config.json")
ENV_FILE = os.path.join(os.path.dirname(CONFIG_FILE), ".env")

def get_system_settings() -> dict:
    """获取系统设置"""
    config = {}
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                config = json.load(f)
        except Exception as e:
            print(f"读取配置文件失败: {e}")
    return config

def get_fence_setting(key: str, default=None):
    """获取围栏相关设置"""
    settings = get_system_settings()
    return settings.get(key, default)

def _coerce_int(value, default: int, min_value: int | None = None, max_value: int | None = None) -> int:
    try:
        result = int(float(value))
    except (TypeError, ValueError):
        result = default
    if min_value is not None:
        result = max(min_value, result)
    if max_value is not None:
        result = min(max_value, result)
    return result

def _coerce_float(value, default: float, min_value: float | None = None, max_value: float | None = None) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError):
        result = default
    if min_value is not None:
        result = max(min_value, result)
    if max_value is not None:
        result = min(max_value, result)
    return result

def _coerce_bool(value, default: bool = False) -> bool:
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    if value is None:
        return default
    return bool(value)

def get_env_setting(key: str, default: str = "") -> str:
    value = os.getenv(key)
    if value is not None:
        return value
    if not os.path.exists(ENV_FILE):
        return default
    try:
        with open(ENV_FILE, 'r', encoding='utf-8') as f:
            for line in f:
                raw_line = line.strip()
                if not raw_line or raw_line.startswith("#") or "=" not in raw_line:
                    continue
                env_key, env_value = raw_line.split("=", 1)
                if env_key.strip() == key:
                    return env_value.strip().strip('"').strip("'")
    except Exception:
        return default
    return default

def get_fence_detection_interval() -> int:
    """获取围栏检测间隔（秒），默认3秒"""
    return _coerce_int(get_fence_setting('fenceDetectionInterval', 3), 3, min_value=1)

def get_fence_grace_period() -> int:
    """获取越界判定延迟（秒），默认0秒"""
    return _coerce_int(get_fence_setting('fenceGracePeriod', 0), 0, min_value=0)

def get_fence_alarm_silence_minutes() -> int:
    """获取告警静默时间（分钟），默认1分钟"""
    return _coerce_int(get_fence_setting('fenceAlarmSilenceMinutes', 1), 1, min_value=0)

def get_fence_default_radius() -> float:
    """Get default circular fence radius in meters."""
    return _coerce_float(get_fence_setting('fenceDefaultRadius', 50), 50, min_value=1)

def get_fence_retention_days() -> int:
    """Get default fence validity/retention days."""
    return _coerce_int(get_fence_setting('fenceRetentionDays', 365), 365, min_value=1)

def get_track_simplify_precision() -> float:
    """Get trajectory simplify precision in meters."""
    return _coerce_float(get_fence_setting('trackSimplifyPrecision', 2), 2, min_value=0)

def get_track_record_interval() -> int:
    """Get trajectory record interval in seconds."""
    return _coerce_int(get_fence_setting('trackRecordInterval', 5), 5, min_value=0)

def get_stationary_reminder_enabled() -> bool:
    """Return whether stationary reminders are enabled."""
    return _coerce_bool(get_fence_setting('stationaryReminderEnabled', False), False)

def get_stationary_reminder_minutes() -> int:
    """Get stationary reminder threshold in minutes."""
    return _coerce_int(get_fence_setting('stationaryReminderMinutes', 30), 30, min_value=1)

def get_alarm_auto_resolve_enabled() -> bool:
    """Return whether pending alarms should be auto-resolved."""
    return _coerce_bool(get_fence_setting('alarmAutoResolve', False), False)

def get_alarm_retention_days() -> int:
    """Get alarm record retention days."""
    return _coerce_int(get_fence_setting('alarmRetentionDays', 30), 30, min_value=1)

def get_safety_production_days() -> int:
    """Return manually configured safety production days plus elapsed calendar days."""
    settings = get_system_settings()
    base_days = _coerce_int(settings.get("safetyProductionDays", 0), 0, min_value=0)
    updated_date = str(settings.get("safetyProductionUpdatedDate") or "").strip()[:10]
    if not updated_date:
        return base_days
    try:
        elapsed_days = (date.today() - date.fromisoformat(updated_date)).days
    except ValueError:
        return base_days
    return max(0, base_days + max(0, elapsed_days))

def get_log_retention_days() -> int:
    """Get system log retention days."""
    return _coerce_int(get_fence_setting('logRetentionDays', 90), 90, min_value=1)

def get_log_auto_clean_enabled() -> bool:
    """Return whether old system logs should be cleaned automatically."""
    return _coerce_bool(get_fence_setting('logAutoClean', True), True)

def get_log_level_filter() -> str:
    """Get configured system log level filter."""
    value = str(get_fence_setting('logLevel', 'all') or 'all').lower()
    return value if value in {'all', 'warning', 'error'} else 'all'

def get_log_category_enabled(target_type: str) -> bool:
    """Return whether a log target type should be recorded."""
    key_map = {
        'alarm': 'logAlarm',
        'login': 'logLogin',
        'system': 'logConfig',
        'permission': 'logOperation',
        'fence': 'logOperation',
        'project': 'logOperation',
        'device': 'logOperation',
        'person': 'logOperation',
    }
    key = key_map.get(str(target_type or '').lower(), 'logOperation')
    return _coerce_bool(get_fence_setting(key, True), True)

def get_log_export_encoding() -> str:
    """Get CSV export encoding."""
    value = str(get_fence_setting('logExportEncoding', 'utf8') or 'utf8').lower()
    return 'gb2312' if value in {'gb2312', 'gbk'} else 'utf-8-sig'

def get_login_failed_alert_threshold() -> int:
    """Get login failed alert threshold."""
    return _coerce_int(get_fence_setting('logLoginFailedAlert', 5), 5, min_value=1)

def get_password_min_length() -> int:
    """Get minimum password length."""
    return _coerce_int(get_fence_setting('passwordMinLength', 8), 8, min_value=6)

def get_password_require_complexity() -> bool:
    """Return whether passwords require mixed character classes."""
    return _coerce_bool(get_fence_setting('passwordRequireComplexity', True), True)

def get_force_initial_password_change() -> bool:
    """Return whether newly created accounts must change password on first login."""
    return _coerce_bool(get_fence_setting('forceInitialPasswordChange', True), True)

def get_password_expire_days() -> int:
    """Return password expiration days."""
    return _coerce_int(get_fence_setting('passwordExpireDays', 90), 90, min_value=1)

def get_login_attempts_limit() -> int:
    """Return allowed consecutive failed login attempts."""
    return _coerce_int(get_fence_setting('loginAttempts', 5), 5, min_value=1)

def get_lockout_duration_minutes() -> int:
    """Return lockout duration in minutes."""
    return _coerce_int(get_fence_setting('lockoutDuration', 30), 30, min_value=1)

def get_max_concurrent_sessions() -> int:
    """Return maximum simultaneous sessions per user."""
    return _coerce_int(get_fence_setting('maxConcurrentSessions', 3), 3, min_value=1)

def get_fence_alarms_disabled() -> bool:
    """Return True when fence alarm creation should be temporarily suppressed."""
    env_value = get_env_setting("FENCE_ALARMS_DISABLED", "")
    if env_value:
        return env_value.strip().lower() in {"1", "true", "yes", "on"}
    setting_value = get_fence_setting('fenceAlarmsDisabled', False)
    if isinstance(setting_value, str):
        return setting_value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(setting_value)

def get_face_recognition_enabled() -> bool:
    """Return whether video face recognition is enabled in system settings."""
    env_value = get_env_setting("FACE_RECOGNITION_ENABLED", "")
    if env_value:
        return env_value.strip().lower() in {"1", "true", "yes", "on"}

    settings = get_system_settings()
    setting_value = settings.get("faceRecognitionEnabled", True)
    if isinstance(setting_value, str):
        return setting_value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(setting_value)
