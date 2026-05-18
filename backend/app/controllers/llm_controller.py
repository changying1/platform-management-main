import os
import shutil
from datetime import datetime
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel, Field
from typing import List, Optional
from app.services.llm_service import (
    check_ollama_connection,
    get_available_models,
    create_llm_chain,
    select_best_model
)

BASE_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "LargeLanguageModel")
DOCUMENTS_DIR = os.path.join(BASE_DIR, "Documents")
VECTOR_DB_DIR = os.path.join(BASE_DIR, "vector_db")

os.makedirs(DOCUMENTS_DIR, exist_ok=True)
os.makedirs(VECTOR_DB_DIR, exist_ok=True)

router = APIRouter(prefix="/api/ai", tags=["AI Chat"])


class ChatTurn(BaseModel):
    user: str
    assistant: Optional[str] = None


class ChatHistory(BaseModel):
    prompt: str
    history: List[ChatTurn] = Field(default_factory=list)
    system_context: Optional[dict] = None


class KBConfig(BaseModel):
    kb_name: str = "default"
    enable_rag: bool = False


class ChatRequest(BaseModel):
    chat_data: ChatHistory
    kb_config: KBConfig


@router.get("/health")
def health_check():
    import requests
    try:
        test_response = requests.get("http://localhost:11434/api/tags", timeout=5)
        test_ok = test_response.status_code == 200
        test_models = test_response.json().get("models", []) if test_ok else []
    except Exception as e:
        test_ok = False
        test_models = []
        print(f"Direct test failed: {e}")
    
    ollama_ok = check_ollama_connection()
    models = get_available_models() if ollama_ok else []
    selected_model = select_best_model()
    
    print(f"DEBUG - Direct test: {test_ok}, LLM check: {ollama_ok}")
    
    return {
        "status": "ok",
        "service": "LLM Chat Service (Integrated)",
        "ollama": {
            "connected": ollama_ok,
            "models": models,
            "selected_model": selected_model,
        },
        "direct_test": {
            "connected": test_ok,
            "models_count": len(test_models)
        },
        "backend": "running",
        "message": "✅ AI 助手服务已集成到主后端，无需单独启动!"
    }


@router.post("/chat")
def chat_handler(request: ChatRequest):
    if not check_ollama_connection():
        return {
            "status": "warning",
            "response": """🤖 Ollama 服务未启动！请按以下步骤操作：

1️⃣ 打开新的命令行窗口，执行：
   ollama serve

2️⃣ 保持这个窗口打开，不要关！

3️⃣ 如果没有模型，先拉取一个：
   ollama pull qwen:7b

💡 提示：这是大模型引擎，不是后端代码问题！""",
            "history": request.chat_data.history
        }

    if not select_best_model():
        return {
            "status": "warning",
            "response": """📦 Ollama 中没有可用模型！

请执行：
   ollama pull qwen:7b

然后再重试聊天！""",
            "history": request.chat_data.history
        }

    try:
        history_dicts = [
            {"user": turn.user, "assistant": turn.assistant}
            for turn in request.chat_data.history
        ]

        system_context = request.chat_data.system_context
        chain = create_llm_chain(
            history_dicts,
            kb_name=request.kb_config.kb_name,
            enable_rag=request.kb_config.enable_rag,
            system_context=system_context
        )

        response = chain(request.chat_data.prompt)

        return {
            "status": "success",
            "response": response,
            "history": request.chat_data.history
        }
    except Exception as e:
        return {
            "status": "error",
            "response": f"""❌ 大模型调用出错：{str(e)}

💡 请检查：
1. ollama serve 是否在运行
2. 执行 ollama list 确认有模型
3. 模型文件是否完整""",
            "history": request.chat_data.history
        }


@router.post("/clear_history")
def clear_history():
    return {"status": "success", "message": "对话历史已清空"}


@router.get("/models")
def list_models():
    return {
        "available": get_available_models(),
        "selected": select_best_model(),
        "ollama_connected": check_ollama_connection()
    }


@router.post("/kb/upload")
async def upload_document(file: UploadFile = File(...)):
    """上传文档到知识库"""
    allowed_extensions = {'.pdf', '.txt', '.docx', '.md'}
    file_ext = os.path.splitext(file.filename)[1].lower()
    
    if file_ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail=f"不支持的文件格式，仅支持: {allowed_extensions}")
    
    file_path = os.path.join(DOCUMENTS_DIR, file.filename)
    
    if os.path.exists(file_path):
        raise HTTPException(status_code=400, detail="文件已存在")
    
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        file_size = os.path.getsize(file_path)
        return {
            "status": "success",
            "message": f"文件「{file.filename}」上传成功",
            "filename": file.filename,
            "size": file_size,
            "upload_time": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"上传失败: {str(e)}")


@router.get("/kb/documents")
async def get_documents():
    """获取知识库文档列表"""
    documents = []
    
    if os.path.exists(DOCUMENTS_DIR):
        for filename in os.listdir(DOCUMENTS_DIR):
            file_path = os.path.join(DOCUMENTS_DIR, filename)
            if os.path.isfile(file_path):
                stat = os.stat(file_path)
                documents.append({
                    "name": filename,
                    "size": stat.st_size,
                    "size_mb": round(stat.st_size / (1024 * 1024), 2),
                    "upload_time": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d")
                })
    
    return {
        "status": "success",
        "documents": documents,
        "total": len(documents),
        "total_size_mb": round(sum(d["size_mb"] for d in documents), 2)
    }


@router.delete("/kb/documents/{filename}")
async def delete_document(filename: str):
    """删除知识库文档"""
    file_path = os.path.join(DOCUMENTS_DIR, filename)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="文件不存在")
    
    try:
        os.remove(file_path)
        return {
            "status": "success",
            "message": f"文件「{filename}」已删除"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除失败: {str(e)}")


@router.get("/kb/list")
async def list_knowledge_bases():
    """获取所有知识库列表"""
    kb_list = ["default"]
    
    if os.path.exists(VECTOR_DB_DIR):
        for name in os.listdir(VECTOR_DB_DIR):
            kb_path = os.path.join(VECTOR_DB_DIR, name)
            if os.path.isdir(kb_path) and name != "default":
                kb_list.append(name)
    
    return {
        "status": "success",
        "knowledge_bases": kb_list,
        "total": len(kb_list)
    }


@router.post("/kb/create")
async def create_knowledge_base(kb_name: str):
    """创建新知识库"""
    if not kb_name or not kb_name.strip():
        raise HTTPException(status_code=400, detail="知识库名称不能为空")
    
    kb_name = kb_name.strip()
    kb_path = os.path.join(VECTOR_DB_DIR, kb_name)
    
    if os.path.exists(kb_path):
        raise HTTPException(status_code=400, detail=f"知识库「{kb_name}」已存在")
    
    try:
        os.makedirs(kb_path, exist_ok=True)
        return {
            "status": "success",
            "message": f"知识库「{kb_name}」创建成功",
            "kb_name": kb_name,
            "path": kb_path
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"创建失败: {str(e)}")


@router.delete("/kb/{kb_name}")
async def delete_knowledge_base(kb_name: str):
    """删除知识库"""
    if kb_name == "default":
        raise HTTPException(status_code=400, detail="默认知识库不能删除")
    
    kb_path = os.path.join(VECTOR_DB_DIR, kb_name)
    
    if not os.path.exists(kb_path):
        raise HTTPException(status_code=404, detail="知识库不存在")
    
    try:
        shutil.rmtree(kb_path)
        return {
            "status": "success",
            "message": f"知识库「{kb_name}」已删除"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除失败: {str(e)}")
