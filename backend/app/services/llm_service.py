import os
import requests

try:
    from langchain_core.runnables import RunnablePassthrough, RunnableParallel
    from langchain_ollama import OllamaLLM
    from langchain_community.vectorstores import Chroma
    from langchain_core.output_parsers import StrOutputParser
    from langchain_ollama import OllamaEmbeddings
    from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
    from langchain_core.messages import HumanMessage, AIMessage
    LLM_IMPORT_ERROR = None
except Exception as exc:
    RunnablePassthrough = RunnableParallel = OllamaLLM = Chroma = StrOutputParser = None
    OllamaEmbeddings = ChatPromptTemplate = MessagesPlaceholder = HumanMessage = AIMessage = None
    LLM_IMPORT_ERROR = exc

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


def create_llm_chain(chat_history=None, kb_name="default", enable_rag=False, system_context=None):
    chat_history = chat_history or []
    
    if not check_ollama_connection():
        raise Exception("Ollama 服务未启动，请先运行: ollama serve")
    
    selected_model = select_best_model()
    if not selected_model:
        raise Exception("Ollama 中没有可用模型，请先拉取: ollama pull qwen:7b")

    system_prompt = """你是一个专业的工地管理智能助手，熟悉公司的各项业务数据。
请直接、自然地回答用户的问题，就像与人对话一样。
回答要简洁明了，不需要说明数据来源或提及"根据数据"、"数据库"等字样。
如果数据不足无法回答，请礼貌地说明。
请用中文回答。"""

    if system_context and system_context.get('system_data'):
        system_data = system_context['system_data']
        data_timestamp = system_context.get('data_timestamp', '未知时间')

        violations = system_data.get('violations', {})
        violations_total = violations.get('total', 0)
        violations_today = violations.get('todayCount', 0)
        
        violations_details = ""
        if violations_today > 0:
            today_violations = violations.get('todayViolations', [])
            if today_violations:
                violations_details = "\n今日违规详情:\n"
                for v in today_violations[:5]:
                    violations_details += f"- {v.get('behavior', '未知')} | {v.get('person', '未知')} | {v.get('location', '未知')}\n"

        personnel = system_data.get('personnel', {})
        personnel_total = personnel.get('total', 0)
        managers = personnel.get('managers', [])
        
        managers_info = ""
        if managers:
            managers_info = "\n管理人员名单:\n"
            for m in managers[:10]:
                branch_name = m.get('branch', '总部')
                managers_info += f"- {m.get('name', '未知')} | {m.get('position', '未知')} | {branch_name}\n"

        branches_info = ""
        branches = system_data.get('branches', {})
        branch_list = branches.get('list', []) or branches.get('branches', [])
        if branch_list:
            branches_info = "\n分公司列表:\n"
            for b in branch_list[:10]:
                branches_info += f"- {b.get('name', '未知')} | 状态: {b.get('status', '未知')}\n"

        projects_info = ""
        projects = system_data.get('projects', {})
        project_list = projects.get('list', [])
        if project_list:
            projects_info = "\n项目列表:\n"
            for p in project_list[:10]:
                projects_info += f"- {p.get('name', '未知')} | 所属分公司ID: {p.get('branch_id', '未知')}\n"

        work_types_info = ""
        work_types = system_data.get('workTypes', {}) or system_data.get('work_types', {})
        work_type_list = work_types.get('list', [])
        if work_type_list:
            work_types_info = "\n工作类型:\n"
            for wt in work_type_list[:10]:
                work_types_info += f"- {wt.get('name', '未知')} | 代码: {wt.get('code', '未知')}\n"

        system_data_info = f"""

【系统实时数据】（更新时间: {data_timestamp}）

🏢 分公司统计:
- 总分公司数: {branches.get('total', 0)}
{branches_info}

📋 项目统计:
- 总项目数: {projects.get('total', 0)}
{projects_info}

👥 人员统计:
- 总人数: {personnel_total}
- 按身份级别分布: {personnel.get('byLevel', {})}
- 按分公司分布: {personnel.get('byBranch', {})}
{managers_info}

📊 设备统计:
- 总设备数: {system_data.get('devices', {}).get('total', 0)}
- 在线设备: {system_data.get('devices', {}).get('online', 0)}
- 离线设备: {system_data.get('devices', {}).get('offline', 0)}

📹 视频设备统计:
- 总视频设备数: {system_data.get('videoDevices', {}).get('total', 0) or system_data.get('videos', {}).get('total', 0)}
- 状态分布: {system_data.get('videoDevices', {}).get('byStatus', {})}

🚨 告警统计:
- 总告警数: {system_data.get('alarms', {}).get('total', 0)}
- 待处理: {system_data.get('alarms', {}).get('pending', 0)}
- 已解决: {system_data.get('alarms', {}).get('resolved', 0)}
- 按严重程度: {system_data.get('alarms', {}).get('bySeverity', {})}

📍 网格统计:
- 总网格数: {system_data.get('grids', {}).get('total', 0)}
- 正常状态: {system_data.get('grids', {}).get('normal', 0)}
- 预警状态: {system_data.get('grids', {}).get('warning', 0)}
- 报警状态: {system_data.get('grids', {}).get('alarm', 0)}

🔴 违规行为统计:
- 累计违规: {violations_total}
- 今日违规: {violations_today}
- 按严重程度: {violations.get('bySeverity', {})}
- 按行为类型: {violations.get('byBehavior', {})}
{violations_details}

🔧 工作类型:
{work_types_info}

以上是你需要了解的公司业务数据，请据此回答用户的问题。"""

        system_prompt += system_data_info

    def llm_chain(question):
        messages = []
        
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        
        for msg in chat_history:
            if isinstance(msg, dict):
                if msg.get('user'):
                    messages.append({"role": "user", "content": msg['user']})
                if msg.get('assistant'):
                    messages.append({"role": "assistant", "content": msg['assistant']})
        
        messages.append({"role": "user", "content": question})
        
        try:
            response = requests.post(
                f"{OLLAMA_URL}/api/chat",
                json={
                    "model": selected_model,
                    "messages": messages,
                    "stream": False,
                    "options": {
                        "temperature": 0.7,
                        "num_ctx": 4096,
                    }
                },
                timeout=60
            )
            
            if response.status_code == 200:
                return response.json().get('message', {}).get('content', '')
            else:
                raise Exception(f"Ollama API 错误: {response.status_code}")
        except Exception as e:
            raise Exception(f"调用 Ollama API 失败: {str(e)}")
    
    return llm_chain
