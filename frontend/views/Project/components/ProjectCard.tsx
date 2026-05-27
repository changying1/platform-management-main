import React from 'react';
import {
  ChevronDown,
  ChevronUp,
  Users,
  Monitor,
  MapPin,
  ShieldAlert,
  AlertTriangle,
  Edit2,
  Trash2,
} from 'lucide-react';
import { ProjectListItem, ProjectDetail, Fence } from '../types';

interface ProjectCardProps {
  key?: React.Key;
  project: ProjectListItem;
  isExpanded: boolean;
  detail: ProjectDetail | null;
  fences: Fence[];
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function ProjectCard({
  project,
  isExpanded,
  detail,
  fences,
  onToggle,
  onEdit,
  onDelete,
}: ProjectCardProps) {
  return (
    <div className="bg-white/10 border border-white/20 rounded-lg overflow-hidden transition-all">
      {/* 项目头部 */}
      <div
        className="flex items-center justify-between p-5 cursor-pointer hover:bg-white/5"
        onClick={onToggle}
      >
        <div className="flex items-center gap-5 flex-1">
          <div className="flex-1 min-w-0">
            <h3 className="text-xl font-bold text-white mb-1.5">{project.name}</h3>
            <div className="flex items-center gap-4">
              {project.description && (
                <span className="text-base text-gray-300">{project.description}</span>
              )}
              {project.branch_name && (
                <span className="text-base text-cyan-400">{project.branch_name}</span>
              )}
            </div>
          </div>

          {/* 统计信息 */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-blue-500/15 px-3 py-2 rounded-lg border border-blue-500/30">
              <Users size={18} className="text-blue-400" />
              <span className="text-white text-base font-medium">{project.user_count} 人</span>
            </div>
            <div className="flex items-center gap-2 bg-green-500/15 px-3 py-2 rounded-lg border border-green-500/30">
              <Monitor size={18} className="text-green-400" />
              <span className="text-white text-base font-medium">{project.device_count} 设备</span>
            </div>
            <div className="flex items-center gap-2 bg-yellow-500/15 px-3 py-2 rounded-lg border border-yellow-500/30">
              <MapPin size={18} className="text-yellow-400" />
              <span className="text-white text-base font-medium">{project.region_count} 区域</span>
            </div>
            <div className="flex items-center gap-2 bg-red-500/15 px-3 py-2 rounded-lg border border-red-500/30">
              <ShieldAlert size={18} className="text-red-400" />
              <span className="text-white text-base font-medium">{project.fence_count} 围栏</span>
            </div>
            <div className="flex items-center gap-2 bg-orange-500/15 px-3 py-2 rounded-lg border border-orange-500/30">
              <AlertTriangle size={18} className="text-orange-400" />
              <span className="text-white text-base font-medium">{project.alarm_count} 告警</span>
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-2 ml-4" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={onEdit}
              disabled={!isExpanded}
              className="px-3 py-2 hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="编辑项目"
            >
              <Edit2 size={18} className="text-blue-400" />
            </button>
            <button
              onClick={onDelete}
              className="px-3 py-2 hover:bg-white/10 rounded-lg transition-colors"
              title="删除项目"
            >
              <Trash2 size={18} className="text-red-400" />
            </button>
          </div>
        </div>

        {/* 展开/收起图标 */}
        <div className="ml-2">
          {isExpanded ? (
            <ChevronUp size={24} className="text-white" />
          ) : (
            <ChevronDown size={24} className="text-white" />
          )}
        </div>
      </div>

      {/* 项目详情（展开时显示） */}
      {isExpanded && detail && (
        <div className="border-t border-white/20 p-4 bg-white/5">
          <div className="grid grid-cols-2 gap-6">
            {/* 左侧：人员和设备 */}
            <div className="space-y-4">
              {/* 人员列表 */}
              <div>
                <h4 className="text-white font-semibold mb-2 flex items-center gap-2">
                  <Users size={16} />
                  项目人员 ({detail.users.length})
                </h4>
                <div className="bg-white/5 rounded-lg p-3 max-h-40 overflow-y-auto">
                  {detail.users.length === 0 ? (
                    <p className="text-gray-400 text-sm">暂无人员</p>
                  ) : (
                    <div className="space-y-2">
                      {detail.users.map((user) => (
                        <div
                          key={user.id}
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="text-white">{user.full_name || user.username}</span>
                          <span className="text-gray-400">{user.username}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 设备列表 */}
              <div>
                <h4 className="text-white font-semibold mb-2 flex items-center gap-2">
                  <Monitor size={16} />
                  项目设备 ({detail.devices.length})
                </h4>
                <div className="bg-white/5 rounded-lg p-3 max-h-40 overflow-y-auto">
                  {detail.devices.length === 0 ? (
                    <p className="text-gray-400 text-sm">暂无设备</p>
                  ) : (
                    <div className="space-y-2">
                      {detail.devices.map((device) => (
                        <div
                          key={device.id}
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="text-white">{device.device_name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-gray-400">{device.device_type}</span>
                            <span
                              className={`w-2 h-2 rounded-full ${
                                device.is_online ? 'bg-green-400' : 'bg-gray-500'
                              }`}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 右侧：项目区域和电子围栏 */}
            <div className="space-y-4">
              {/* 项目区域 */}
              <div>
                <h4 className="text-white font-semibold mb-2 flex items-center gap-2">
                  <MapPin size={16} />
                  项目区域 ({detail.regions.length})
                </h4>
                <div className="bg-white/5 rounded-lg p-3 max-h-40 overflow-y-auto">
                  {detail.regions.length === 0 ? (
                    <p className="text-gray-400 text-sm">暂无区域</p>
                  ) : (
                    <div className="space-y-2">
                      {detail.regions.map((region) => (
                        <div key={region.id} className="text-sm">
                          <span className="text-white">{region.name}</span>
                          {region.remark && (
                            <p className="text-gray-400 text-xs mt-1">{region.remark}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 电子围栏 */}
              <div>
                <h4 className="text-white font-semibold mb-2 flex items-center gap-2">
                  <ShieldAlert size={16} />
                  电子围栏 ({fences.length})
                </h4>
                <div className="bg-white/5 rounded-lg p-3 max-h-40 overflow-y-auto">
                  {fences.length === 0 ? (
                    <p className="text-gray-400 text-sm">暂无围栏</p>
                  ) : (
                    <div className="space-y-2">
                      {fences.map((fence) => (
                        <div key={fence.id} className="text-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-white">{fence.name}</span>
                            <span
                              className={`px-2 py-0.5 rounded text-xs ${
                                fence.is_active
                                  ? 'bg-green-500/20 text-green-400'
                                  : 'bg-gray-500/20 text-gray-400'
                              }`}
                            >
                              {fence.is_active ? '启用' : '禁用'}
                            </span>
                          </div>
                          <p className="text-gray-400 text-xs mt-1">
                            {fence.region_name} · {fence.behavior} · 违规人数: {fence.worker_count}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}