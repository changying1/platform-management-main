import React from "react";
import { 
  Circle, 
  Square, 
  PenTool, 
  Hexagon,
  X, 
  Check, 
  RotateCcw
} from "lucide-react";

type DrawTool = 'brush' | 'rectangle' | 'circle' | 'polygon';

interface FenceDrawToolProps {
  showToolbar: boolean;
  activeTool: DrawTool;
  onToolChange: (tool: DrawTool) => void;
  onComplete: () => void;
  onCancel: () => void;
  onClear: () => void;
  tempPoints?: [number, number][];
  tempShape?: any;
  isDragging?: boolean;
  hasStarted?: boolean;
}

export const FenceDrawTool: React.FC<FenceDrawToolProps> = ({
  showToolbar,
  activeTool,
  onToolChange,
  onComplete,
  onCancel,
  onClear,
  tempPoints = [],
  tempShape,
  isDragging,
  hasStarted = false,
}) => {
  if (!showToolbar) return null;

  const tools: { id: DrawTool; icon: React.ReactNode; label: string }[] = [
    { id: 'brush', icon: <PenTool size={20} />, label: '画笔' },
    { id: 'rectangle', icon: <Square size={20} />, label: '方框' },
    { id: 'circle', icon: <Circle size={20} />, label: '圆形' },
    { id: 'polygon', icon: <Hexagon size={20} />, label: '多边形' },
  ];

  const getDrawHint = () => {
    switch (activeTool) {
      case 'rectangle':
        if (!hasStarted) return '💡 第一步：在地图上点击选择矩形的起始点';
        return '📍 第二步：移动鼠标调整大小，点击完成矩形绘制';
      
      case 'circle':
        if (!hasStarted) return '💡 第一步：在地图上点击设置圆心位置';
        return '📍 第二步：移动鼠标调整半径，点击完成圆形绘制';
      
      case 'polygon':
        if (!hasStarted) return '💡 第一步：在地图上点击放置第一个顶点';
        if (tempPoints?.length === 1) return '📍 第二步：移动鼠标点击放置第二个顶点';
        if (tempPoints?.length >= 2) return `继续点击添加更多顶点 (已放置 ${tempPoints.length} 个) - 点击第一个顶点闭合`;
        return '';
      
      case 'brush':
        if (!isDragging) return '💡 按住鼠标左键，在地图上拖动指针自由绘制围栏边界';
        return '🖌️  绘制中... 松开鼠标自动闭合';
      
      default:
        return '👆 选择上方的绘图工具开始绘制围栏';
    }
  };

  const canComplete = () => {
    if (activeTool === 'circle') return Boolean(tempShape?.center);
    return tempPoints.length >= 3;
  };

  return (
    <div className="absolute top-20 left-1/2 -translate-x-1/2 z-40 flex flex-col gap-3 items-center">
      {/* 工具栏 */}
      <div className="bg-slate-900/95 backdrop-blur-lg border border-cyan-400/40 rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-2">
        <div className="text-sm text-cyan-400 font-medium pr-3 border-r border-cyan-400/30">
          绘图工具
        </div>
        
        {tools.map((tool) => (
          <button
            key={tool.id}
            onClick={() => onToolChange(tool.id)}
            title={tool.label}
            className={`px-4 py-2 rounded-xl transition-all flex items-center gap-2 ${
              activeTool === tool.id
                ? 'bg-cyan-500/30 text-cyan-300 shadow-lg shadow-cyan-500/20 scale-105 border-2 border-cyan-400/60'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            {tool.icon}
            <span className="text-sm font-medium">{tool.label}</span>
          </button>
        ))}

        <div className="w-px h-8 bg-cyan-400/30 mx-2" />

        <button
          onClick={onClear}
          title="清除绘制"
          className="p-2 rounded-xl text-amber-400 hover:bg-amber-500/20 transition-all"
        >
          <RotateCcw size={18} />
        </button>

        <button
          onClick={onComplete}
          disabled={!canComplete()}
          title="完成绘制"
          className={`px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
            canComplete()
              ? 'bg-green-500/30 text-green-400 hover:bg-green-500/50 border border-green-400/50'
              : 'text-slate-600 cursor-not-allowed'
          }`}
        >
          <Check size={18} />
          <span className="text-sm font-medium">完成</span>
        </button>

        <button
          onClick={onCancel}
          title="取消绘制"
          className="p-2 rounded-xl text-red-400 hover:bg-red-500/20 transition-all ml-1"
        >
          <X size={18} />
        </button>
      </div>

      {/* ✅ 操作指引提示条 - 工具栏正下方，绝对不会被挡住！ */}
      <div className="bg-gradient-to-r from-amber-500/35 to-orange-500/35 border-2 border-amber-400/70 rounded-xl px-6 py-3 shadow-2xl">
        <span className="text-amber-100 text-base font-bold">
          📌 {getDrawHint()}
        </span>
      </div>
    </div>
  );
};
