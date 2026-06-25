from fastapi import APIRouter

from app.services.ai_runtime.algorithm_catalog import list_algorithms


router = APIRouter(prefix="/api/ai", tags=["AI Algorithms"])


@router.get("/algorithms")
def get_ai_algorithms():
    # 预加载人脸识别底库，以便前端在拉取可用算法列表（进页面）时，控制台能立刻输出人员登记照读取日志
    try:
        from app.services.ai_runtime.face_library_manager import face_library_manager
        face_library_manager.ensure_loaded()
    except Exception as exc:
        import logging
        logging.getLogger("AIAlgorithms").warning("自动加载人脸识别底库失败: %s", exc)

    return {
        "code": 0,
        "data": list_algorithms(),
    }
