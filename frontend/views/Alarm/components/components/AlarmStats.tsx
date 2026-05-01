import React from "react";
import { AlertCircle, Clock, CheckCircle, AlertTriangle } from "lucide-react";
import { GlowNumber } from "./CyberPanel";

interface StatsProps {
  total: number;
  pending: number;
  resolved: number;
  high: number;
}

export const AlarmStats: React.FC<StatsProps> = ({
  total,
  pending,
  resolved,
  high,
}) => {
  const statCards = [
    { label: "今日报警", value: total, icon: AlertCircle, color: "#ef4444" },
    { label: "待处理", value: pending, icon: Clock, color: "#f59e0b" },
    { label: "已处置", value: resolved, icon: CheckCircle, color: "#10b981" },
    { label: "严重报警", value: high, icon: AlertTriangle, color: "#ef4444" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, height: "100%" }}>
      {statCards.map((card, i) => {
        const Icon = card.icon;
        return (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              borderRadius: 6,
              background: "rgba(59,130,246,0.06)",
              border: "1px solid rgba(59,130,246,0.15)",
              transition: "all 0.2s",
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: `${card.color}18`,
                border: `1px solid ${card.color}35`,
                color: card.color,
                flexShrink: 0,
              }}
            >
              <Icon size={18} />
            </div>
            <div>
              <div style={{ color: "#94a3b8", fontSize: 11, fontWeight: 500 }}>
                {card.label}
              </div>
              <GlowNumber value={card.value} color={card.color} size={24} />
            </div>
          </div>
        );
      })}
    </div>
  );
};
