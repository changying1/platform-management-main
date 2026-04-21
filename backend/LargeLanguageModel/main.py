import os
import shutil
from datetime import datetime
from chat import LLM_chain, check_ollama_connection, get_available_models
from pydantic import BaseModel, Field
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional

app = FastAPI(
    title="智能对话助手系统",
    version="1.0",
    description="支持多知识库的智能问答系统"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)


class ChatTurn(BaseModel):
    user: str
    assistant: Optional[str] = None


class ChatHistory(BaseModel):
    prompt: str
    history: List[ChatTurn] = Field(default_factory=list)


class KBConfig(BaseModel):
    kb_name: str
    enable_rag: bool = True


class ChatRequest(BaseModel):
    chat_data: ChatHistory
    kb_config: KBConfig


@app.post("/chat")
async def chat_handler(request: ChatRequest):
    try:
        persist_directory = os.path.join(
            "./vector_db",
            request.kb_config.kb_name
        )

        history_dicts = [{"user": turn.user, "assistant": turn.assistant} for turn in request.chat_data.history]

        chain = LLM_chain(
            history_dicts,
            persist_directory,
            RAG=request.kb_config.enable_rag
        )

        response = chain.invoke(request.chat_data.prompt)

        return {
            "status": "success",
            "response": response,
            "history": request.chat_data.history
        }
    except Exception as e:
        import traceback
        return {
            "status": "error",
            "message": str(e),
            "traceback": traceback.format_exc()
        }


@app.post("/clear_history")
async def clear_history():
    return {"status": "success", "message": "对话历史已清空"}


@app.get("/health")
async def health_check():
    ollama_ok = check_ollama_connection()
    models = get_available_models() if ollama_ok else []
    
    return {
        "status": "ok",
        "service": "LLM Chat Service",
        "ollama": {
            "connected": ollama_ok,
            "models": models,
        },
        "backend": "running",
    }


DOCUMENTS_DIR = "./Documents"
VECTOR_DB_DIR = "./vector_db"

os.makedirs(DOCUMENTS_DIR, exist_ok=True)
os.makedirs(VECTOR_DB_DIR, exist_ok=True)


@app.post("/kb/upload")
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


@app.get("/kb/documents")
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


@app.delete("/kb/documents/{filename}")
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


@app.get("/kb/list")
async def list_knowledge_bases():
    """获取所有知识库列表"""
    kb_list = []
    
    if os.path.exists(VECTOR_DB_DIR):
        for kb_name in os.listdir(VECTOR_DB_DIR):
            kb_path = os.path.join(VECTOR_DB_DIR, kb_name)
            if os.path.isdir(kb_path):
                kb_list.append(kb_name)
    
    return {
        "status": "success",
        "knowledge_bases": kb_list
    }


@app.post("/kb/create")
async def create_knowledge_base(kb_name: str):
    """创建新知识库"""
    from knowledge_base import KB_create
    
    kb_path = os.path.join(VECTOR_DB_DIR, kb_name)
    
    if os.path.exists(kb_path):
        raise HTTPException(status_code=400, detail="知识库已存在")
    
    try:
        KB_create(DOCUMENTS_DIR, kb_path)
        return {
            "status": "success",
            "message": f"知识库「{kb_name}」创建成功"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"创建失败: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8888)
