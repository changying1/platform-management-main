import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send, X, Trash2, Loader2, Settings, MessageSquare, AlertCircle } from 'lucide-react';
import { getAuthHeaders } from '../src/api/config';
import { alarmApi, AlarmResponse, LogResponse } from '../src/api/alarmApi';

interface Message {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface AISettings {
  serviceUrl: string;
  kbName: string;
  enableRAG: boolean;
}

const isLatestLogQuestion = (text: string) => {
  const question = String(text || '');
  const hasLog = /日志|系统日志|操作记录|操作日志|log/i.test(question);
  const asksLatest = /最近|最新|最后|上一条|刚刚|最近更新|最近汇总|汇总|一条|最近记录/.test(question);
  return hasLog && asksLatest;
};

const formatLatestLogAnswer = (log: LogResponse) => {
  const parts = [
    '最近一条系统日志',
    `操作行为：${log.action || '未知操作'}`,
    `操作对象：${log.target_name || '未知对象'}`,
    `类型：${log.target_type || '未知类型'}`,
    `操作人：${log.operator || '未知操作人'}`,
    `时间：${log.time || '未知时间'}`,
  ];
  const scope = [log.company, log.project, log.grid, log.team].filter(Boolean).join(' / ');
  if (scope) parts.push(`所属单位：${scope}`);
  if (log.details) parts.push(`详情：${log.details}`);
  return parts.join('\n');
};

const isViolationCountQuestion = (text: string) => {
  const question = String(text || '');
  const hasViolation = /违规|违章|告警|报警|预警|隐患|风险/.test(question);
  const asksCount = /多少|几个|数量|总数|共有|几起|几条/.test(question);
  return hasViolation && asksCount;
};

const isViolationPeopleQuestion = (text: string) => {
  const question = String(text || '');
  const hasViolation = /违规|违章|告警|报警|预警|隐患|风险/.test(question);
  const asksPeople = /谁|人员|违规人|责任人|负责人|名单|哪些人/.test(question);
  return hasViolation && asksPeople;
};

const parseQuestionDays = (text: string) => {
  const question = String(text || '');
  if (/近七日|近7日|近七天|近7天|最近七日|最近7天|最近一周|本周/.test(question)) return 7;
  if (/今日|今天|当天/.test(question)) return 1;
  const match = question.match(/近\s*(\d+)\s*[日天]/);
  return match ? Math.max(1, Number(match[1])) : undefined;
};

const getAlarmTime = (alarm: AlarmResponse) => {
  const value = alarm.timestamp || alarm.handled_at || '';
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
};

const alarmStatusText: Record<string, string> = {
  pending: '待处理',
  unresolved: '待处理',
  open: '待处理',
  active: '待处理',
  resolved: '已处理',
  handled: '已处理',
  closed: '已处理',
  ignored: '已忽略',
};

const alarmTypeText: Record<string, string> = {
  fence_intrusion: '电子围栏闯入',
  fence_exit: '电子围栏离开',
  no_helmet: '未戴安全帽',
  smoking: '吸烟',
  fire: '火情',
  fall: '跌倒',
  danger_zone: '进入危险区域',
};

const toChineseAlarmText = (value?: string) => {
  const text = String(value || '').trim();
  if (!text) return '未知';
  return alarmStatusText[text] || alarmTypeText[text] || text
    .replace(/pending/gi, '待处理')
    .replace(/resolved/gi, '已处理')
    .replace(/_/g, ' ');
};

const formatViolationCountAnswer = (alarms: AlarmResponse[], question: string) => {
  const days = parseQuestionDays(question);
  let scoped = alarms;
  let label = '当前权限范围内';

  if (days) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));
    const startTime = start.getTime();
    scoped = alarms.filter(alarm => getAlarmTime(alarm) >= startTime);
    label = `近${days}日`;
  }

  const countBy = (items: AlarmResponse[], getter: (alarm: AlarmResponse) => string | undefined) => {
    const result = new Map<string, number>();
    items.forEach(item => {
      const key = toChineseAlarmText(getter(item));
      result.set(key, (result.get(key) || 0) + 1);
    });
    return Array.from(result.entries()).map(([key, count]) => `- ${key}：${count} 起`);
  };

  const lines = [
    `${label}违规/告警统计`,
    `总数：${scoped.length} 起`,
  ];
  const byStatus = countBy(scoped, alarm => alarm.status);
  const byType = countBy(scoped, alarm => alarm.alarm_type || alarm.description);
  if (byStatus.length) {
    lines.push('按状态：');
    lines.push(...byStatus);
  }
  if (byType.length) {
    lines.push('按类型：');
    lines.push(...byType);
  }
  return lines.join('\n');
};

const getAlarmPersonName = (alarm: AlarmResponse) => (
  alarm.trigger_person_name ||
  alarm.person_name ||
  alarm.person_label ||
  alarm.personnel_id ||
  alarm.trigger_person_id ||
  '未知'
);

const getAlarmOwnerName = (alarm: AlarmResponse) => {
  const raw = alarm as any;
  return raw.responsible_person_name || raw.owner_name || raw.handler || raw.manager_name || raw.responsible_person || '未记录';
};

const formatViolationPeopleAnswer = (alarms: AlarmResponse[], question: string) => {
  const days = parseQuestionDays(question);
  let scoped = alarms;
  let label = '当前权限范围内';

  if (days) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));
    const startTime = start.getTime();
    scoped = alarms.filter(alarm => getAlarmTime(alarm) >= startTime);
    label = `近${days}日`;
  }

  if (!scoped.length) {
    return `${label}未查询到违规/告警记录。`;
  }

  const lines = [
    `${label}违规/告警人员明细`,
    `总数：${scoped.length} 起`,
  ];

  scoped
    .sort((a, b) => getAlarmTime(b) - getAlarmTime(a))
    .slice(0, 10)
    .forEach((alarm, index) => {
      const scope = [alarm.project || alarm.project_name, alarm.grid || alarm.grid_name, alarm.team || alarm.team_name].filter(Boolean).join(' / ') || '未记录';
      lines.push(
        `${index + 1}. 违规人员：${getAlarmPersonName(alarm)}`,
        `   告警类型：${toChineseAlarmText(alarm.alarm_type || alarm.description)}`,
        `   所属位置：${scope}`,
        `   责任人：${getAlarmOwnerName(alarm)}`
      );
    });

  if (scoped.length > 10) {
    lines.push(`仅显示最近 10 起，其余 ${scoped.length - 10} 起可在告警列表查看。`);
  }

  return lines.join('\n');
};

const AIChatAssistant: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      role: 'assistant',
      content: '您好！我是一名专业的工地管理智能助手，请问有什么可以帮助您的？',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isPulsing, setIsPulsing] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatWindowRef = useRef<HTMLDivElement>(null);
  
  const [iconPosition, setIconPosition] = useState({ x: 0, y: 0 });
  
  useEffect(() => {
    setIconPosition({ x: window.innerWidth - 120, y: window.innerHeight - 180 });
  }, []);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const iconRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        chatWindowRef.current &&
        !chatWindowRef.current.contains(event.target as Node) &&
        iconRef.current &&
        !iconRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - iconPosition.x,
      y: e.clientY - iconPosition.y,
    });
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      const newX = Math.max(20, Math.min(window.innerWidth - 100, e.clientX - dragOffset.x));
      const newY = Math.max(20, Math.min(window.innerHeight - 100, e.clientY - dragOffset.y));
      setIconPosition({ x: newX, y: newY });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const [settings, setSettings] = useState<AISettings>({
    serviceUrl: '/api/ai',
    kbName: 'default',
    enableRAG: false,
  });

  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    testConnection();
  }, [settings.serviceUrl]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const interval = setInterval(() => {
      setIsPulsing((prev) => !prev);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const testConnection = async () => {
    try {
      const response = await fetch(`${settings.serviceUrl}/health`, {
        method: 'GET',
        mode: 'cors',
        headers: getAuthHeaders(),
      });
      if (response.ok) {
        setConnectionStatus('connected');
      } else {
        setConnectionStatus('disconnected');
      }
    } catch (error) {
      setConnectionStatus('disconnected');
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      if (isLatestLogQuestion(userMessage.content)) {
        const logs = await alarmApi.getLogs(0, 100);
        const sortedLogs = [...logs].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
        const assistantMessage: Message = {
          id: Date.now() + 1,
          role: 'assistant',
          content: sortedLogs.length
            ? formatLatestLogAnswer(sortedLogs[0])
            : '当前权限范围内没有查询到系统日志记录。',
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
        setConnectionStatus('connected');
        return;
      }

      if (isViolationPeopleQuestion(userMessage.content)) {
        const alarms = await alarmApi.getAlarms(undefined, undefined, 5000);
        const assistantMessage: Message = {
          id: Date.now() + 1,
          role: 'assistant',
          content: formatViolationPeopleAnswer(alarms, userMessage.content),
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
        setConnectionStatus('connected');
        return;
      }

      if (isViolationCountQuestion(userMessage.content)) {
        const alarms = await alarmApi.getAlarms(undefined, undefined, 5000);
        const assistantMessage: Message = {
          id: Date.now() + 1,
          role: 'assistant',
          content: formatViolationCountAnswer(alarms, userMessage.content),
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
        setConnectionStatus('connected');
        return;
      }

      console.log('正在连接到:', settings.serviceUrl);
      
      const response = await fetch(`${settings.serviceUrl}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        mode: 'cors',
        body: JSON.stringify({
          chat_data: {
            prompt: userMessage.content,
            history: [],
            system_context: {
              request_timestamp: new Date().toISOString(),
            },
          },
          kb_config: {
            kb_name: settings.kbName,
            enable_rag: settings.enableRAG,
          },
        }),
      });

      console.log('响应状态:', response.status);

      if (!response.ok) {
        throw new Error(`HTTP 错误: ${response.status}`);
      }

      const data = await response.json();
      console.log('响应数据:', data);

      if (data.status === 'success' || data.status === 'warning') {
        const assistantMessage: Message = {
          id: Date.now() + 1,
          role: 'assistant',
          content: data.response,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
        setConnectionStatus('connected');
      } else {
        throw new Error(data.response || data.message || '服务返回错误');
      }
    } catch (error: any) {
      console.error('连接错误:', error);
      setConnectionStatus('disconnected');
      
      const errorDetails = error.message || String(error);
      const errorMessage: Message = {
        id: Date.now() + 1,
        role: 'assistant',
        content: `❌ 连接失败\n\n错误原因: ${errorDetails}\n\n🔧 排查步骤:\n1️⃣ 确认主后端已启动 (端口 9000)\n2️⃣ 服务已集成，无需单独启动 LLM 服务!\n3️⃣ 按 F12 打开控制台查看详细错误\n\n💡 AI 助手已集成到主后端!`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearHistory = () => {
    setMessages([
      {
        id: 1,
        role: 'assistant',
        content: '对话历史已清空，请问有什么可以帮助您的？',
        timestamp: new Date(),
      },
    ]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'bg-emerald-500';
      case 'disconnected': return 'bg-red-500';
      default: return 'bg-yellow-500';
    }
  };

  return (
    <>
      <button
        ref={iconRef}
        onMouseDown={handleMouseDown}
        onClick={(e) => !isDragging && setIsOpen(true)}
        style={{ left: iconPosition.x, top: iconPosition.y }}
        className={`fixed z-50 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/30 transition-all duration-300 hover:scale-110 hover:shadow-xl hover:shadow-cyan-500/40 cursor-grab active:cursor-grabbing ${
          isPulsing && !isDragging ? 'animate-pulse' : ''
        } ${isDragging ? 'scale-110 shadow-2xl shadow-cyan-500/60' : ''}`}
      >
        <Bot size={36} className={isPulsing && !isDragging ? 'animate-bounce' : ''} />
        <div className={`absolute right-2 top-2 h-4 w-4 rounded-full ${getStatusColor()} border-2 border-white`} />
      </button>

      {isOpen && (
        <div ref={chatWindowRef} className="fixed right-6 bottom-6 z-50 flex h-[650px] w-[450px] flex-col overflow-hidden rounded-2xl bg-slate-900 shadow-2xl shadow-cyan-500/20">
          <div className="flex items-center justify-between border-b border-slate-700/50 bg-gradient-to-r from-cyan-600 to-blue-600 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
                <Bot size={20} className="text-white" />
                <div className={`absolute right-0 bottom-0 h-3 w-3 rounded-full ${getStatusColor()} border-2 border-white`} />
              </div>
              <div>
                <h3 className="font-semibold text-white">智能助手</h3>
                <p className="text-xs text-white/70">
                  {connectionStatus === 'connected' ? '✓ 已连接' : connectionStatus === 'checking' ? '⟳ 连接中...' : '✕ 未连接'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={testConnection}
                className="rounded-lg p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                title="测试连接"
              >
                <AlertCircle size={18} />
              </button>
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="rounded-lg p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                <Settings size={18} />
              </button>
              <button
                onClick={clearHistory}
                className="rounded-lg p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                title="清空对话"
              >
                <Trash2 size={18} />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {showSettings && (
            <div className="border-b border-slate-700/50 bg-slate-800/50 p-4">
              <h4 className="mb-3 text-sm font-medium text-slate-200">AI 助手设置</h4>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs text-slate-400">服务地址</label>
                  <input
                    type="text"
                    value={settings.serviceUrl}
                    onChange={(e) =>
                      setSettings((prev) => ({ ...prev, serviceUrl: e.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-400/50"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400">知识库名称</label>
                  <input
                    type="text"
                    value={settings.kbName}
                    onChange={(e) =>
                      setSettings((prev) => ({ ...prev, kbName: e.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-400/50"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">启用知识库检索 (RAG)</span>
                  <button
                    onClick={() =>
                      setSettings((prev) => ({ ...prev, enableRAG: !prev.enableRAG }))
                    }
                    className={`h-5 w-9 rounded-full transition-colors ${
                      settings.enableRAG ? 'bg-cyan-500' : 'bg-slate-600'
                    }`}
                  >
                    <div
                      className={`h-4 w-4 rounded-full bg-white transition-transform ${
                        settings.enableRAG ? 'translate-x-4' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
                <button
                  onClick={testConnection}
                  className="w-full rounded-lg bg-cyan-500 py-2 text-sm font-medium text-white transition-colors hover:bg-cyan-600"
                >
                  测试连接
                </button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                      msg.role === 'user'
                        ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white'
                        : 'bg-slate-800 text-slate-200'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {msg.role === 'assistant' && (
                        <MessageSquare size={16} className="mt-0.5 flex-shrink-0 text-cyan-400" />
                      )}
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    </div>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="flex max-w-[85%] items-center gap-2 rounded-2xl bg-slate-800 px-4 py-3">
                    <Loader2 size={20} className="animate-spin text-cyan-400" />
                    <span className="text-sm text-slate-400">AI 思考中...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          <div className="border-t border-slate-700/50 bg-slate-800/30 p-4">
            <div className="relative">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="输入您的问题..."
                rows={2}
                className="w-full resize-none rounded-xl border border-slate-700 bg-slate-900/50 px-4 py-3 pr-12 text-sm text-slate-200 outline-none focus:border-cyan-400/50"
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || isLoading}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-cyan-500 p-2 text-white transition-all hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send size={18} />
              </button>
            </div>
            <p className="mt-2 text-center text-xs text-slate-500">
              按 Enter 发送，Shift + Enter 换行
            </p>
          </div>
        </div>
      )}
    </>
  );
};

export default AIChatAssistant;
