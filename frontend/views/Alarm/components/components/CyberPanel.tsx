import React from "react";

// ------------------------------------------------------------------
// CyberPanel — 深蓝玻璃面板，带呼吸角标 + 发光标题
// (从 Dashboard.tsx 复制，供 Alarm 模块独立使用)
// ------------------------------------------------------------------

const STYLE_ID = "alarm-cyber-keyframes";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
    const styleEl = document.createElement("style");
    styleEl.id = STYLE_ID;
    styleEl.textContent = `
    @keyframes corner-pulse-alarm {
      0%, 100% { opacity: 0.5; }
      50%      { opacity: 1; }
    }
    @keyframes title-bar-glow-alarm {
      0%, 100% { opacity: 0.7; }
      50%      { opacity: 1; box-shadow: 0 0 12px #60a5fa; }
    }
    @keyframes cyber-scan-alarm {
      0%   { transform: translateY(-100%); }
      100% { transform: translateY(200vh); }
    }
    @keyframes fadeInUp-alarm {
      0%   { opacity: 0; transform: translateY(12px); }
      100% { opacity: 1; transform: translateY(0); }
    }
    .cyber-panel-content::-webkit-scrollbar {
      width: 5px;
    }
    .cyber-panel-content::-webkit-scrollbar-track {
      background: rgba(59,130,246,0.06);
      border-radius: 4px;
    }
    .cyber-panel-content::-webkit-scrollbar-thumb {
      background: rgba(96,165,250,0.3);
      border-radius: 4px;
    }
    .cyber-panel-content::-webkit-scrollbar-thumb:hover {
      background: rgba(96,165,250,0.5);
    }
  `;
    document.head.appendChild(styleEl);
}

export function CyberPanel({
    title,
    children,
    style,
    extra,
}: {
    title: string;
    children: React.ReactNode;
    style?: React.CSSProperties;
    extra?: React.ReactNode;
}) {
    const cornerStyle = (
        pos: Record<string, number>
    ): React.CSSProperties => ({
        position: "absolute",
        width: 14,
        height: 14,
        pointerEvents: "none",
        animation: "corner-pulse-alarm 3s ease-in-out infinite",
        ...pos,
    });

    return (
        <div
            style={{
                position: "relative",
                background:
                    "linear-gradient(135deg, rgba(16, 42, 94, 0.72) 0%, rgba(8, 28, 66, 0.6) 100%)",
                border: "1px solid rgba(59, 130, 246, 0.25)",
                boxShadow:
                    "inset 0 0 30px rgba(59, 130, 246, 0.08), 0 4px 24px rgba(0,0,0,0.3)",
                backdropFilter: "blur(12px)",
                borderRadius: 4,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                ...style,
            }}
        >
            {/* 呼吸角标 */}
            <div
                style={{
                    ...cornerStyle({ top: -1, left: -1 }),
                    borderTop: "2px solid #60a5fa",
                    borderLeft: "2px solid #60a5fa",
                }}
            />
            <div
                style={{
                    ...cornerStyle({ top: -1, right: -1 }),
                    borderTop: "2px solid #60a5fa",
                    borderRight: "2px solid #60a5fa",
                    animationDelay: "0.5s",
                }}
            />
            <div
                style={{
                    ...cornerStyle({ bottom: -1, left: -1 }),
                    borderBottom: "2px solid #60a5fa",
                    borderLeft: "2px solid #60a5fa",
                    animationDelay: "1s",
                }}
            />
            <div
                style={{
                    ...cornerStyle({ bottom: -1, right: -1 }),
                    borderBottom: "2px solid #60a5fa",
                    borderRight: "2px solid #60a5fa",
                    animationDelay: "1.5s",
                }}
            />

            {/* 标题栏 */}
            <div
                style={{
                    background:
                        "linear-gradient(90deg, rgba(59,130,246,0.25) 0%, rgba(59,130,246,0.05) 60%, transparent 100%)",
                    padding: "8px 16px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    borderBottom: "1px solid rgba(59,130,246,0.15)",
                }}
            >
                <div style={{ display: "flex", alignItems: "center" }}>
                    <div
                        style={{
                            width: 3,
                            height: 16,
                            background: "linear-gradient(180deg, #60a5fa, #3b82f6)",
                            marginRight: 10,
                            borderRadius: 2,
                            animation: "title-bar-glow-alarm 3s ease-in-out infinite",
                        }}
                    />
                    <span
                        style={{
                            color: "#e0f2fe",
                            fontSize: 14,
                            fontWeight: 600,
                            letterSpacing: 1.5,
                            textShadow: "0 0 8px rgba(96,165,250,0.6)",
                        }}
                    >
                        {title}
                    </span>
                </div>
                {extra}
            </div>

            {/* 内容 */}
            <div
                className="cyber-panel-content"
                style={{
                    flex: 1,
                    position: "relative",
                    padding: 14,
                    overflow: "auto",
                }}
            >
                {children}
            </div>
        </div>
    );
}

// ------------------------------------------------------------------
// GlowNumber — 发光数字
// ------------------------------------------------------------------
export function GlowNumber({
    value,
    color = "#60a5fa",
    size = 28,
    style,
}: {
    value: string | number;
    color?: string;
    size?: number;
    style?: React.CSSProperties;
}) {
    return (
        <span
            style={{
                fontSize: size,
                fontWeight: 800,
                color,
                textShadow: `0 0 8px ${color}, 0 0 20px ${color}40, 0 0 40px ${color}20`,
                fontFamily: "'Orbitron', 'Consolas', monospace",
                letterSpacing: 2,
                ...style,
            }}
        >
            {value}
        </span>
    );
}
