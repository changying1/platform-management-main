import os
from pydantic import BaseModel
from fastapi import FastAPI, HTTPException
from langchain_community.document_loaders import UnstructuredPDFLoader
from langchain.text_splitter import CharacterTextSplitter,MarkdownTextSplitter
from langchain_ollama import OllamaEmbeddings
from langchain_community.vectorstores import Chroma
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境应指定具体域名
    allow_credentials=True,
    allow_methods=["*"],  # 关键!允许所有HTTP方法
    allow_headers=["*"],   # 允许所有请求头
)


# 定义请求体模型
class CreateKBRequest(BaseModel):
    kb_name: str  # 知识库名称

def load_Documents(Load_directory):
    loader = UnstructuredPDFLoader(Load_directory)
    docs = loader.load()
    print(docs[0].page_content[:100])
    return docs


def load_doc_splitter(Load_directory, chunk_size=1000, chunk_overlap=200):
    """
    - chunk_size:每个文本块的最大字符数,推荐 500-1000
    - chunk_overlap:相邻块之间的重叠字符数(保持上下文连贯),推荐 100-200
    """

    docs = load_Documents(Load_directory)
    text_splitter = CharacterTextSplitter(chunk_size=chunk_size, chunk_overlap=chunk_overlap)
    split_docs = text_splitter.split_documents(docs)
    # 默认展示分割后第一段内容
    print('split_docs[0]: ', split_docs[0])
    return split_docs

def KB_create(Load_directory,Persist_directory):
    """
    创建持久化向量数据库
    """
    for doc in os.listdir(Load_directory):
        doc_path = f'{Load_directory}/{doc}'
        if doc_path.endswith('.pdf'):
            texts=load_doc_splitter(doc_path)

    embed_model = OllamaEmbeddings(base_url="http://localhost:11434", model="smartcreation/bge-large-zh-v1.5")

    db = Chroma.from_documents(
        documents=texts,
        embedding=embed_model,
        persist_directory=Persist_directory,  # 持久化存储路径
    )

    return db


@app.post("/create_kb")
async def create_kb(request: CreateKBRequest):
    """
    根据传入的知识库名称创建知识库
    """
    kb_name = request.kb_name
    Persist_directory = os.path.join("./vector_db", kb_name)
    Load_directory = "./Documents"  # 假设所有 PDF 文档都存储在 ./Documents 目录下

    # 检查文档目录是否存在
    if not os.path.exists(Load_directory):
        raise HTTPException(status_code=404, detail=f"Document directory '{Load_directory}' not found.")

    try:
        # 创建知识库
        db = KB_create(Load_directory,Persist_directory)
        return {"message": f"Knowledge base '{kb_name}' created successfully!",
                "persist_directory": os.path.join("./vector_db", kb_name)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create knowledge base: {str(e)}")
