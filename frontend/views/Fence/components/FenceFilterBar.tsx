import React from "react";
import { Search, X } from "lucide-react";
import { FenceFilter } from "../types";

interface FenceFilterBarProps {
  filter: FenceFilter;
  setFilter: (filter: FenceFilter) => void;
  companies: string[];
  projects: string[];
  grids: string[];
  showCompanyFilter?: boolean;
}

export const FenceFilterBar: React.FC<FenceFilterBarProps> = ({
  filter,
  setFilter,
  companies,
  projects,
  grids,
  showCompanyFilter = true,
}) => {
  const searchPlaceholder = showCompanyFilter
    ? "搜索分公司、项目、网格、围栏名、设备名..."
    : "搜索项目、网格、围栏名、设备名...";

  return (
    <div className="rounded-lg border border-blue-400/30 bg-slate-900/65 backdrop-blur-md m-4 mb-0 p-3 shadow-xl">
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-[240px]">
          <div className="relative">
            <Search size={14} className="absolute left-2 top-1/2 transform -translate-y-1/2 text-cyan-400" />
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={filter.keyword || ""}
              onChange={(e) => setFilter({ ...filter, keyword: e.target.value })}
              className="w-full bg-slate-800/50 border border-slate-700 rounded-md pl-7 pr-7 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
            />
            {filter.keyword && (
              <button
                onClick={() => setFilter({ ...filter, keyword: "" })}
                className="absolute right-2 top-1/2 transform -translate-y-1/2"
                title="清空搜索"
              >
                <X size={12} className="text-slate-400" />
              </button>
            )}
          </div>
        </div>

        {showCompanyFilter && (
          <div className="w-32">
            <select
              value={filter.company || "all"}
              onChange={(e) => setFilter({
                ...filter,
                company: e.target.value === "all" ? undefined : e.target.value,
                project: undefined,
                grid: undefined
              })}
              className="w-full bg-slate-800/50 border border-cyan-400/40 rounded-md px-2 py-1.5 text-sm text-slate-200 outline-none focus:border-cyan-400 cursor-pointer"
            >
              {companies.map(company => (
                <option key={company} value={company} className="bg-slate-800 text-slate-200">
                  {company === "all" ? "所有分公司" : company}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="w-32">
          <select
            value={filter.project || "all"}
            onChange={(e) => setFilter({
              ...filter,
              project: e.target.value === "all" ? undefined : e.target.value,
              grid: undefined
            })}
            className="w-full bg-slate-800/50 border border-cyan-400/40 rounded-md px-2 py-1.5 text-sm text-slate-200 outline-none focus:border-cyan-400 cursor-pointer"
          >
            {projects.map(project => (
              <option key={project} value={project} className="bg-slate-800 text-slate-200">
                {project === "all" ? "所有项目" : project}
              </option>
            ))}
          </select>
        </div>

        <div className="w-32">
          <select
            value={filter.grid || "all"}
            onChange={(e) => setFilter({ ...filter, grid: e.target.value === "all" ? undefined : e.target.value })}
            className="w-full bg-slate-800/50 border border-cyan-400/40 rounded-md px-2 py-1.5 text-sm text-slate-200 outline-none focus:border-cyan-400 cursor-pointer"
          >
            {grids.map(grid => (
              <option key={grid} value={grid} className="bg-slate-800 text-slate-200">
                {grid === "all" ? "所有网格" : grid}
              </option>
            ))}
          </select>
        </div>

        {(filter.company || filter.project || filter.grid || filter.keyword) && (
          <button
            onClick={() => setFilter({})}
            className="px-2 py-1.5 text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            重置
          </button>
        )}
      </div>
    </div>
  );
};
