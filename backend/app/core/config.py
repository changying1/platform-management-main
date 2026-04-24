import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    SMS_ENABLED = os.getenv("SMS_ENABLED", "false").lower() == "true"
    SMS_API_URL = os.getenv("SMS_API_URL", "https://dysmsapi.aliyuncs.com")
    SMS_API_KEY = os.getenv("SMS_API_KEY", "")
    SMS_API_SECRET = os.getenv("SMS_API_SECRET", "")
    SMS_SIGN = os.getenv("SMS_SIGN", "【安全管理系统】")
    SMS_TEMPLATE_ID = os.getenv("SMS_TEMPLATE_ID", "")
    
    CALL_ENABLED = os.getenv("CALL_ENABLED", "false").lower() == "true"
    CALL_API_URL = os.getenv("CALL_API_URL", "https://dyvmsapi.aliyuncs.com")
    CALL_API_KEY = os.getenv("CALL_API_KEY", "")
    CALL_API_SECRET = os.getenv("CALL_API_SECRET", "")
    CALL_TTS_CODE = os.getenv("CALL_TTS_CODE", "")

settings = Settings()
