import os
from langchain_core.runnables import RunnablePassthrough, RunnableParallel
from langchain_ollama import OllamaLLM
from langchain_community.vectorstores import Chroma
from langchain_core.output_parsers import StrOutputParser
from langchain_ollama import OllamaEmbeddings
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage, AIMessage
import requests


def check_ollama_connection(base_url="http://localhost:11434"):
    try:
        response = requests.get(f"{base_url}/api/tags", timeout=5)
        return response.status_code == 200
    except:
        return False


def get_available_models(base_url="http://localhost:11434"):
    try:
        response = requests.get(f"{base_url}/api/tags", timeout=5)
        if response.status_code == 200:
            data = response.json()
            return [model["name"] for model in data.get("models", [])]
        return []
    except:
        return []


def LLM_chain(chat_history, persist_directory, RAG=True):
    ollama_url = "http://localhost:11434"
    
    if not check_ollama_connection(ollama_url):
        raise Exception(f"""
❌ Ollama 服务未连接！

🔧 解决方法:
1️⃣ 打开新 CMD 运行: ollama serve
   或者: 双击桌面 Ollama 图标

2️⃣ 检查可用模型: ollama list

3️⃣ 如果没有模型，拉取一个:
   ollama pull qwen:7b
   ollama pull deepseek-r1:7b
        """)
    
    available_models = get_available_models(ollama_url)
    
    selected_model = None
    priority_models = [
        "DeepSeek-R1-Distill-Qwen-7B-F16:latest",
        "deepseek-r1:7b",
        "qwen:7b",
        "llama2:7b",
    ]
    
    for model in priority_models:
        if model in available_models:
            selected_model = model
            break
    
    if not selected_model and available_models:
        selected_model = available_models[0]
    
    if not selected_model:
        raise Exception(f"""
❌ Ollama 中没有可用模型！

当前已安装模型: {available_models}

🔧 请先拉取一个模型:
   ollama pull qwen:7b
        """)

    if RAG and persist_directory and os.path.exists(persist_directory):
        try:
            vector_store = Chroma(
                persist_directory=persist_directory,
                embedding_function=OllamaEmbeddings(
                    base_url=ollama_url,
                    model="bge-large:latest" if "bge-large:latest" in available_models else "qwen:7b"
                ),
            )
            retriever = vector_store.as_retriever(
                search_type="mmr",
                search_kwargs={
                    "k": 3,
                    "fetch_k": 10,
                },
            )
        except Exception as e:
            retriever = RunnablePassthrough()
    else:
        retriever = RunnablePassthrough()

    llmmodel = OllamaLLM(
        base_url=ollama_url,
        model=selected_model,
        temperature=0.7,
        num_ctx=4096,
    )

    prompt = ChatPromptTemplate.from_messages([
        ("system", """你是一个专业的工程项目智能助手。
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
