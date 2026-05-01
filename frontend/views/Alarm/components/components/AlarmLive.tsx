import React, { useEffect, useState } from "react";
import { AlertCircle, AlertTriangle, Info } from "lucide-react";

interface LiveAlarm {
    id: string;
    type: string;
    device: string;
    time: string;
    level: "high" | "medium" | "low";
    location: string;
}

const levelConfig = {
    high: {
        icon: AlertCircle,
        color: "#ef4444",
        bg: "rgba(239,68,68,0.12)",
        border: "rgba(248,113,113,0.35)",
        label: "高危",
    },
    medium: {
        icon: AlertTriangle,
        color: "#f59e0b",
        bg: "rgba(245,158,11,0.12)",
        border: "rgba(253,224,71,0.30)",
        label: "警告",
    },
    low: {
        icon: Info,
        color: "#3b82f6",
        bg: "rgba(59,130,246,0.12)",
        border: "rgba(147,197,253,0.30)",
        label: "提示",
    },
};

export function AlarmLive({ alarms }: { alarms: LiveAlarm[] }) {
    // 自动滚动：每 3 秒切换一批
    const [offset, setOffset] = useState(0);
    const displayCount = 4;

    useEffect(() => {
        if (alarms.length <= displayCount) return;
        const timer = setInterval(() => {
            setOffset((prev) => (prev + 1) % alarms.length);
        }, 3000);
        return () => clearInterval(timer);
    }, [alarms.length]);

    const visible = [];
    for (let i = 0; i < Math.min(displayCount, alarms.length); i++) {
        visible.push(alarms[(offset + i) % alarms.length]);
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, height: "100%" }}>
            {visible.map((alarm, idx) => {
                const cfg = levelConfig[alarm.level] || levelConfig.low;
                const Icon = cfg.icon;
                return (
                    <div
                        key={`${alarm.id}-${idx}`}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "10px 12px",
                            borderRadius: 6,
                            background: cfg.bg,
                            border: `1px solid ${cfg.border}`,
                            animation: "fadeInUp-alarm 0.4s ease-out",
                            cursor: "default",
                            transition: "transform 0.2s",
                        }}
                        onMouseEnter={(e) => {
                            (e.currentTarget as HTMLDivElement).style.transform = "translateX(4px)";
                        }}
                        onMouseLeave={(e) => {
                            (e.currentTarget as HTMLDivElement).style.transform = "translateX(0)";
                        }}
                    >
                        <div
                            style={{
                                width: 32,
                                height: 32,
                                borderRadius: 8,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                background: cfg.bg,
                                border: `1px solid ${cfg.border}`,
                                color: cfg.color,
                                flexShrink: 0,
                            }}
                        >
                            <Icon size={16} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                                style={{
                                    color: "#e0f2fe",
                                    fontSize: 12,
                                    fontWeight: 600,
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                }}
                            >
                                {alarm.type}
                            </div>
                            <div
                                style={{
                                    color: "#64748b",
                                    fontSize: 10,
                                    marginTop: 2,
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                }}
                            >
                                {alarm.device} · {alarm.location}
                            </div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                            <div
                                style={{
                                    fontSize: 10,
                                    color: cfg.color,
                                    fontWeight: 700,
                                }}
                            >
                                {cfg.label}
                            </div>
                            <div style={{ fontSize: 9, color: "#64748b", marginTop: 2 }}>
                                {alarm.time}
                            </div>
                        </div>
                    </div>
                );
            })}

            {alarms.length === 0 && (
                <div
                    style={{
                        flex: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#64748b",
                        fontSize: 12,
                    }}
                >
                    暂无最新报警
                </div>
            )}
        </div>
    );
}
