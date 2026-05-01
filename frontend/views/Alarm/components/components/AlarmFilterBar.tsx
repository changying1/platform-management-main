import React from "react";
import { Filter, AlertTriangle, Search, FolderOpen } from "lucide-react";
import { AlarmStatusFilter, AlarmLevelFilter } from "../types";

interface ProjectOption {
  id: number;
  name: string;
}

interface FilterBarProps {
  status: AlarmStatusFilter;
  level: AlarmLevelFilter;
  searchTerm: string;
  projectId?: number;
  projects: ProjectOption[];
  onStatusChange: (s: AlarmStatusFilter) => void;
  onLevelChange: (l: AlarmLevelFilter) => void;
  onSearchChange: (t: string) => void;
  onProjectChange: (id: number | undefined) => void;
}

export const AlarmFilterBar: React.FC<FilterBarProps> = ({
  status,
  level,
  searchTerm,
  projectId,
  projects,
  onStatusChange,
  onLevelChange,
  onSearchChange,
  onProjectChange,
}) => {
  const selectStyle: React.CSSProperties = {
    background: "rgba(59,130,246,0.12)",
    border: "1px solid rgba(59,130,246,0.25)",
    borderRadius: 4,
    color: "#e0f2fe",
    fontSize: 12,
    fontWeight: 600,
    padding: "4px 8px",
    outline: "none",
    cursor: "pointer",
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      {/* 项目筛选 */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <FolderOpen size={13} color="#64748b" />
        <select
          style={selectStyle}
          value={projectId ?? ""}
          onChange={(e) =>
            onProjectChange(e.target.value ? Number(e.target.value) : undefined)
          }
        >
          <option value="">全部项目</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <Filter size={13} color="#64748b" />
        <select
          style={selectStyle}
          value={status}
          onChange={(e) => onStatusChange(e.target.value as AlarmStatusFilter)}
        >
          <option value="all">所有状态</option>
          <option value="pending">待处理</option>
          <option value="resolved">已处置</option>
        </select>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <AlertTriangle size={13} color="#64748b" />
        <select
          style={selectStyle}
          value={level}
          onChange={(e) => onLevelChange(e.target.value as AlarmLevelFilter)}
        >
          <option value="all">所有级别</option>
          <option value="high">高危</option>
          <option value="medium">警告</option>
          <option value="low">提示</option>
        </select>
      </div>

      <div style={{ position: "relative", flex: 1, maxWidth: 200 }}>
        <input
          type="text"
          placeholder="搜索..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          style={{
            width: "100%",
            background: "rgba(59,130,246,0.08)",
            border: "1px solid rgba(59,130,246,0.2)",
            borderRadius: 4,
            color: "#e0f2fe",
            fontSize: 12,
            padding: "4px 8px 4px 28px",
            outline: "none",
          }}
        />
        <Search
          size={13}
          style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)" }}
          color="#64748b"
        />
      </div>
    </div>
  );
};
