import os
from pathlib import Path
from langchain_community.vectorstores import Chroma
from langchain.text_splitter import CharacterTextSplitter
from langchain_ollama import OllamaEmbeddings
from typing import List
from langchain_community.document_loaders import (
    DirectoryLoader,
    PyPDFLoader,
)
from langchain.schema import Document

def load_Documents(Load_directory: str) -> List[Document]:
    """从目录加载所有 PDF 文档"""
    docs = []
    # 检查路径是文件还是目录
    if os.path.isfile(Load_directory):
        # 如果是文件,直接加载
        loader = PyPDFLoader(Load_directory)
        docs.extend(loader.load())
    elif os.path.isdir(Load_directory):
        # 如果是目录,遍历加载所有 PDF 文件
        loader = DirectoryLoader(
            path=Load_directory,
            glob="**/*.pdf",
            show_progress=True,
            use_multithreading=True,
            silent_errors=True,
            loader_cls=PyPDFLoader,
        )
        docs.extend(loader.load())
    else:
        raise ValueError(f"路径不存在: {Load_directory}")
    print(f"成功加载 {len(docs)} 份文档")
    return docs

def load_doc_splitter(Load_directory: str, chunk_size=1000, chunk_overlap=200) -> List[Document]:
    """
    分块文档
    - chunk_size:每个文本块的最大字符数,推荐 500-1000
    - chunk_overlap:相邻块之间的重叠字符数(保持上下文连贯),推荐 100-200
    """
    docs = load_Documents(Load_directory)
    text_splitter = CharacterTextSplitter(chunk_size=chunk_size, chunk_overlap=chunk_overlap)
    split_docs = text_splitter.split_documents(docs)
    # 默认展示分割后第一段内容
    print('split_docs[0]: ', split_docs[0].page_content[:100])
    return split_docs

def KB_create(Load_directory,Persist_directory):
    """
    创建持久化向量数据库
    """
    for doc in os.listdir(Load_directory):
        doc_path = f'{Load_directory}/{doc}'
        if doc_path.endswith('.pdf'):
            texts=load_doc_splitter(doc_path)

    embeddings = OllamaEmbeddings(
        base_url="http://localhost:11434",  # 固定端口
        model="smartcreation/bge-large-zh-v1.5"
    )

    db = Chroma.from_documents(
        documents=texts,
        embedding=embeddings,
        persist_directory=Persist_directory,  # 持久化存储路径
    )

    return db

def list_knowledge_bases(base_dir: str = "./vector_db") -> List[str]:
    """列出所有知识库"""
    kb_dir = Path(base_dir)
    if not kb_dir.exists():
        print(f"知识库目录 {base_dir} 不存在")
        return []
    kbs = [d.name for d in kb_dir.iterdir() if d.is_dir()]
    print(f"当前知识库列表: {kbs}")
    return kbs

if __name__ == "__main__":
    # 测试配置
    TEST_PDF_PATH = "./Documents"  # 替换为实际 PDF 文件路径
    KB_NAME = "test_kb"
    PERSIST_DIR = f"./vector_db/{KB_NAME}"

    # 1. 创建知识库
    KB_create(Load_directory=TEST_PDF_PATH, Persist_directory=PERSIST_DIR)

    # 2. 列出知识库
    list_knowledge_bases()