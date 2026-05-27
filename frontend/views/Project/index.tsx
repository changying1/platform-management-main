import React, { useState } from 'react';
import { Plus, Loader2 } from 'lucide-react';
import { SearchBar } from './components/SearchBar';
import { ProjectCard } from './components/ProjectCard';
import { ProjectModal } from './components/ProjectModal';
import { useProjectLogic } from './hooks/useProjectLogic';
import { useProjectForm } from './hooks/useProjectForm';

export default function ProjectManagement() {
  const logic = useProjectLogic();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const { formData, resetForm } = useProjectForm();

  const handleEdit = () => {
    if (logic.projectDetail) {
      resetForm(logic.projectDetail);
      setShowEditModal(true);
    }
  };

  const handleCreateSuccess = () => {
    setShowCreateModal(false);
    logic.triggerSearch();
  };

  const handleEditSuccess = () => {
    setShowEditModal(false);
    logic.triggerSearch();
    if (logic.expandedProjectId) {
      logic.fetchProjectDetail(logic.expandedProjectId);
      logic.fetchProjectFences(logic.expandedProjectId);
    }
  };

  return (
    <div className="h-full w-full flex flex-col p-6 overflow-hidden">
      {/* 标题和操作栏 */}
      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold text-white">项目管理</h1>

        {/* 搜索栏 */}
        <div className="flex-1">
          <SearchBar
            searchQuery={logic.searchQuery}
            selectedBranchId={logic.selectedBranchId}
            onSearchChange={logic.setSearchQuery}
            onBranchChange={logic.setSelectedBranchId}
            onSearch={logic.triggerSearch}
          />
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={20} />
          新建项目
        </button>
      </div>

      {/* 项目列表 */}
      <div className="flex-1 overflow-y-auto">
        {logic.loading ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="animate-spin text-white" size={48} />
          </div>
        ) : logic.projects.length === 0 ? (
          <div className="text-center text-gray-400 py-16">
            <p>暂无项目</p>
          </div>
        ) : (
          <div className="space-y-3">
            {logic.projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                isExpanded={logic.expandedProjectId === project.id}
                detail={logic.expandedProjectId === project.id ? logic.projectDetail : null}
                fences={logic.expandedProjectId === project.id ? logic.projectFences : []}
                onToggle={() => logic.toggleProject(project.id)}
                onEdit={handleEdit}
                onDelete={() => logic.deleteProject(project.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 创建项目模态框 */}
      {showCreateModal && (
        <ProjectModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={handleCreateSuccess}
        />
      )}

      {/* 编辑项目模态框 */}
      {showEditModal && logic.projectDetail && (
        <ProjectModal
          isEdit
          initialData={{
            ...formData,
            id: logic.projectDetail.id,
          } as any}
          onClose={() => setShowEditModal(false)}
          onSuccess={handleEditSuccess}
        />
      )}
    </div>
  );
}