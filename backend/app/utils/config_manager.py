import os
import json

# 配置文件路径
CONFIG_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "system_config.json")

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

def get_fence_detection_interval() -> int:
    """获取围栏检测间隔（秒），默认3秒"""
    return int(get_fence_setting('fenceDetectionInterval', 3))

def get_fence_grace_period() -> int:
    """获取越界判定延迟（秒），默认0秒"""
    return int(get_fence_setting('fenceGracePeriod', 0))

def get_fence_alarm_silence_minutes() -> int:
    """获取告警静默时间（分钟），默认1分钟"""
    return int(get_fence_setting('fenceAlarmSilenceMinutes', 1))
