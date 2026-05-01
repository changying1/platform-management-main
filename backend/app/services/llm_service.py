import os
from langchain_core.runnables import RunnablePassthrough, RunnableParallel
from langchain_ollama import OllamaLLM
from langchain_community.vectorstores import Chroma
from langchain_core.output_parsers import StrOutputParser
from langchain_ollama import OllamaEmbeddings
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage, AIMessage
import requests

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
VECTOR_DB_BASE = os.path.join(os.path.dirname(__file__), "..", "..", "LargeLanguageModel", "vector_db")


def check_ollama_connection(base_url=None):
    url = base_url or OLLAMA_URL
    try:
        response = requests.get(f"{url}/api/tags", timeout=5)
        return response.status_code == 200
    except:
        return False


def get_available_models(base_url=None):
    url = base_url or OLLAMA_URL
    try:
        response = requests.get(f"{url}/api/tags", timeout=5)
        if response.status_code == 200:
            data = response.json()
            return [model["name"] for model in data.get("models", [])]
        return []
    except:
        return []


def select_best_model():
    if not check_ollama_connection():
        return None
    
    available_models = get_available_models()
    priority_models = [
        "qwen:7b",
        "DeepSeek-R1-Distill-Qwen-7B-F16:latest",
        "deepseek-r1:7b",
        "llama2:7b",
    ]
    
    for model in priority_models:
        if model in available_models:
            return model
    
    if available_models:
        return available_models[0]
    return None


def create_llm_chain(chat_history=None, kb_name="default", enable_rag=False):
    chat_history = chat_history or []
    
    if not check_ollama_connection():
        raise Exception("Ollama 服务未启动，请先运行: ollama serve")
    
    selected_model = select_best_model()
    if not selected_model:
        raise Exception("Ollama 中没有可用模型，请先拉取: ollama pull qwen:7b")
    
    available_models = get_available_models()
    persist_directory = os.path.join(VECTOR_DB_BASE, kb_name)
    
    if enable_rag and os.path.exists(persist_directory):
        try:
            embedding_models = ["nomic-embed-text:latest", "bge-large:latest", "mxbai-embed-large:latest"]
            embedding_model = None
            for m in embedding_models:
                if m in available_models:
                    embedding_model = m
                    break
            
            if not embedding_model:
                embedding_model = "nomic-embed-text:latest"
                raise Exception(f"请先安装 Embedding 模型: ollama pull nomic-embed-text")
            
            vector_store = Chroma(
                persist_directory=persist_directory,
                embedding_function=OllamaEmbeddings(
                    base_url=OLLAMA_URL,
                    model=embedding_model
                ),
            )
            retriever = vector_store.as_retriever(
                search_type="mmr",
                search_kwargs={"k": 3, "fetch_k": 10},
            )
        except Exception:
            retriever = RunnablePassthrough()
    else:
        retriever = RunnablePassthrough()

    llmmodel = OllamaLLM(
        base_url=OLLAMA_URL,
        model=selected_model,
        temperature=0.7,
        num_ctx=4096,
    )

    prompt = ChatPromptTemplate.from_messages([
        ("system", """你是一个专业的智能助手。
请根据用户问题提供专业、准确、有帮助的回答。
请用中文回答用户问题。
背景知识参考: {context} """),
        MessagesPlaceholder(variable_name="chat_history"),
        ("user", "{question}"),
    ])

    history_messages = []
    for msg in chat_history:
        if isinstance(msg, dict):
            if msg.get('user'):
                history_messages.append(HumanMessage(msg['user']))
            if msg.get('assistant'):
                history_messages.append(AIMessage(msg['assistant']))

    chain = (RunnableParallel({
        "question": RunnablePassthrough(),
        "context": retriever,
        "chat_history": lambda x: history_messages,
    })
        | prompt
        | llmmodel
        | StrOutputParser())

    return chain
