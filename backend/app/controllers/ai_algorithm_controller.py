from fastapi import APIRouter

from app.services.ai_runtime.algorithm_catalog import list_algorithms


router = APIRouter(prefix="/api/ai", tags=["AI Algorithms"])


@router.get("/algorithms")
def get_ai_algorithms():
    return {
        "code": 0,
        "data": list_algorithms(),
    }
