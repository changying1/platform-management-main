import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send, X, Trash2, Loader2, Settings, MessageSquare, AlertCircle } from 'lucide-react';

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

const AIChatAssistant: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      role: 'assistant',
      content: '您好！我是智能助手，请问有什么可以帮助您的？\n\n💡 提示：请确保后端服务已启动：\ncd backend/LargeLanguageModel\npython main.py',
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
      console.log('正在连接到:', settings.serviceUrl);
      
      const response = await fetch(`${settings.serviceUrl}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        mode: 'cors',
        body: JSON.stringify({
          chat_data: {
            prompt: userMessage.content,
            history: [],
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

      if (data.status === 'success') {
        const assistantMessage: Message = {
          id: Date.now() + 1,
          role: 'assistant',
          content: data.response,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
        setConnectionStatus('connected');
      } else {
        throw new Error(data.message || '服务返回错误');
      }
    } catch (error: any) {
      console.error('连接错误:', error);
      setConnectionStatus('disconnected');
      
      const errorDetails = error.message || String(error);
      const errorMessage: Message = {
        id: Date.now() + 1,
        role: 'assistant',
        content: `❌ 连接失败\n\n错误原因: ${errorDetails}\n\n🔧 排查步骤:\n1️⃣ 确认已启动服务: python main.py\n2️⃣ 服务地址: ${settings.serviceUrl}\n3️⃣ 检查端口 8888 是否被占用\n4️⃣ 按 F12 打开控制台查看详细错误`,
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
