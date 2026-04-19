import sys
from loguru import logger
import os

# Create logs directory if it doesn't exist
BASE_DIR = os.path.dirname(__file__)
LOG_DIR = os.path.normpath(os.path.join(BASE_DIR, "..", "..", "logs"))
os.makedirs(LOG_DIR, exist_ok=True)

# 移除默认配置并重新定义
logger.remove()

# 1. 输出到控制台 (带颜色)
logger.add(sys.stdout, 
           format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>",
           level="INFO")

# 2. 输出到文件
LOG_PATH = os.path.join(LOG_DIR, "smart_helmet.log")
logger.add(LOG_PATH, rotation="500 MB", retention="10 days", level="INFO", encoding="utf-8")

def get_logger(module_name: str):
    """
    Returns a logger instance bound to a specific module name.
    """
    return logger.bind(module=module_name)
