import React from "react";
import { MapPin, CheckCircle, Trash2, AlertCircle } from "lucide-react";
import { AlarmRecord } from "../types";
import { API_BASE_URL } from "@/src/api/config";

interface TableProps {
  alarms: AlarmRecord[];
  onResolve: (id: number) => void;
  onDelete: (id: number) => void;
  onUpdateLevel: (id: number, level: string) => void;
}

export const AlarmTable: React.FC<TableProps> = ({
  alarms,
  onResolve,
  onDelete,
  onUpdateLevel,
}) => {
  const buildRecordingUrl = (recordingPath?: string) => {
    if (!recordingPath) return "";
    if (/^https?:\/\//i.test(recordingPath)) return recordingPath;
    return `${API_BASE_URL}${recordingPath.startsWith("/") ? recordingPath : `/${recordingPath}`}`;
  };

  const levelStyle = (level: string) => {
    switch (level) {
      case "high":
        return { bg: "rgba(239,68,68,0.14)", fg: "#fecaca", bd: "rgba(248,113,113,0.45)" };
      case "medium":
        return { bg: "rgba(245,158,11,0.14)", fg: "#fde68a", bd: "rgba(253,224,71,0.40)" };
      default:
        return { bg: "rgba(59,130,246,0.16)", fg: "#bfdbfe", bd: "rgba(147,197,253,0.45)" };
    }
  };

  const levelLabel = (level: string) => {
    switch (level) {
      case "high": return "高危";
      case "medium": return "警告";
      default: return "提示";
    }
  };

  return (
    <div
      style={{
        flex: 1,
        overflow: "auto",
        borderRadius: 4,
        border: "1px solid rgba(59,130,246,0.12)",
      }}
    >
      <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
        <thead
          style={{
            position: "sticky",
            top: 0,
            zIndex: 10,
            background: "rgba(15,78,190,0.45)",
            color: "rgba(219,234,254,0.86)",
            fontSize: 11,
            letterSpacing: 0.5,
          }}
        >
          <tr>
            {["报警类型", "设备", "时间", "位置", "录像", "级别", "状态", "操作"].map((h, idx) => (
              <th
                key={h}
                style={{
                  padding: "8px 10px",
                  fontWeight: 700,
                  borderBottom: "1px solid rgba(59,130,246,0.15)",
                  textAlign: idx === 7 ? "right" : "left",
                  whiteSpace: "nowrap",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>

        <tbody style={{ color: "rgba(232,241,255,0.92)" }}>
          {alarms.map((alarm) => {
            const lv = levelStyle(alarm.level);
            return (
              <tr
                key={alarm.id}
                style={{ borderBottom: "1px solid rgba(59,130,246,0.08)" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLTableRowElement).style.background =
                    "rgba(59,130,246,0.08)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLTableRowElement).style.background = "transparent";
                }}
              >
                <td style={{ padding: "7px 10px", fontSize: 12, fontWeight: 600 }}>
                  {alarm.type}
                </td>

                <td style={{ padding: "7px 10px", fontSize: 11, color: "#94a3b8" }}>
                  {alarm.device}
                </td>

                <td style={{ padding: "7px 10px", fontSize: 11, color: "#94a3b8", whiteSpace: "nowrap" }}>
                  {alarm.time}
                </td>

                <td style={{ padding: "7px 10px", fontSize: 11, color: "#94a3b8" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <MapPin size={10} color="#60a5fa" />
                    {alarm.location}
                  </span>
                </td>

                <td style={{ padding: "7px 10px", fontSize: 11 }}>
                  {alarm.recordingPath ? (
                    <a
                      href={buildRecordingUrl(alarm.recordingPath)}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "#38bdf8", textDecoration: "underline" }}
                    >
                      查看视频
                    </a>
                  ) : (
                    <span style={{ color: "#64748b" }}>
                      {alarm.recordingStatus === "failed"
                        ? `失败: ${alarm.recordingError || "生成失败"}`
                        : "生成中"}
                    </span>
                  )}
                </td>

                <td style={{ padding: "7px 10px" }}>
                  {alarm.status === "pending" ? (
                    <select
                      value={alarm.level}
                      onChange={(e) => onUpdateLevel(alarm.rawId, e.target.value)}
                      style={{
                        background: lv.bg,
                        color: lv.fg,
                        border: `1px solid ${lv.bd}`,
                        borderRadius: 4,
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "2px 6px",
                        outline: "none",
                        cursor: "pointer",
                      }}
                    >
                      <option value="high">高危</option>
                      <option value="medium">警告</option>
                      <option value="low">提示</option>
                    </select>
                  ) : (
                    <span
                      style={{
                        background: lv.bg,
                        color: lv.fg,
                        border: `1px solid ${lv.bd}`,
                        borderRadius: 4,
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "2px 8px",
                        display: "inline-block",
                      }}
                    >
                      {levelLabel(alarm.level)}
                    </span>
                  )}
                </td>

                <td style={{ padding: "7px 10px" }}>
                  {alarm.status === "pending" ? (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        background: "rgba(239,68,68,0.10)",
                        color: "#fecaca",
                        border: "1px solid rgba(248,113,113,0.30)",
                        borderRadius: 10,
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "2px 8px",
                      }}
                    >
                      <div
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: "50%",
                          background: "#f87171",
                          animation: "corner-pulse-alarm 1.5s ease-in-out infinite",
                        }}
                      />
                      待处理
                    </span>
                  ) : (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        background: "rgba(34,197,94,0.10)",
                        color: "#bbf7d0",
                        border: "1px solid rgba(134,239,172,0.30)",
                        borderRadius: 10,
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "2px 8px",
                      }}
                    >
                      <CheckCircle size={10} />
                      已处置
                    </span>
                  )}
                </td>

                <td style={{ padding: "7px 10px", textAlign: "right" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                    {alarm.status === "pending" && (
                      <button
                        onClick={() => onResolve(alarm.rawId)}
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "3px 10px",
                          borderRadius: 4,
                          color: "#fff",
                          background: "linear-gradient(180deg, #60a5fa, #2563eb)",
                          border: "1px solid rgba(191,219,254,0.35)",
                          cursor: "pointer",
                        }}
                      >
                        处置
                      </button>
                    )}
                    <button
                      onClick={() => onDelete(alarm.rawId)}
                      title="删除"
                      style={{
                        padding: "3px 6px",
                        borderRadius: 4,
                        background: "rgba(239,246,255,0.08)",
                        border: "1px solid rgba(59,130,246,0.15)",
                        color: "#94a3b8",
                        cursor: "pointer",
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}

          {alarms.length === 0 && (
            <tr>
              <td colSpan={8} style={{ padding: "40px 0", textAlign: "center" }}>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 8,
                    color: "#64748b",
                  }}
                >
                  <AlertCircle size={28} />
                  <span style={{ fontSize: 12 }}>暂无相关报警记录</span>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
