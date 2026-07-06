import React, { useState, useEffect } from 'react';
import { Plus, Search, FolderTree } from 'lucide-react';
import { UnitTree } from './UnitTree';
import { UnitFormModal } from './UnitFormModal';
import { ChangeParentModal } from './ChangeParentModal';
import {
  unitApiClient,
  type ResponsibilityUnit,
  type UnitTreeNode,
} from '../../../../src/api/responsibilityUnitApi';
import { hasAnyStoredPermission, hasStoredPermission } from '../../../../src/utils/permissions';

const flattenUnits = (nodes: UnitTreeNode[]): ResponsibilityUnit[] =>
  nodes.flatMap((node) => [node, ...flattenUnits(node.children || [])]);

const includesKeyword = (value: unknown, keyword: string) =>
  String(value || '').toLowerCase().includes(keyword);

export const ResponsibilityUnitView: React.FC = () => {
  const [units, setUnits] = useState<UnitTreeNode[]>([]);
  const [allUnits, setAllUnits] = useState<ResponsibilityUnit[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<ResponsibilityUnit | null>(null);
  const [parentUnit, setParentUnit] = useState<{ unit_id: string; name: string; type: string; project_id?: string } | null>(null);

  const [isChangeParentOpen, setIsChangeParentOpen] = useState(false);
  const [changingUnit, setChangingUnit] = useState<ResponsibilityUnit | null>(null);
  const canCreateUnit = hasAnyStoredPermission(['grid.create', 'team.create']);
  const canEditUnit = hasAnyStoredPermission(['grid.edit', 'team.edit']);
  const canDeleteUnit = hasAnyStoredPermission(['grid.delete', 'team.delete']);

  // 加载树形数据
  const loadTree = async () => {
    try {
      setLoading(true);
      const tree = await unitApiClient.getTree();
      setUnits(tree);
    } catch (error) {
      console.error('加载责任单元失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 加载所有单元（用于变更上级选择）
  const loadAllUnits = async () => {
    try {
      const data = await unitApiClient.getUnits();
      setAllUnits(data);
    } catch (error) {
      console.error('加载单元列表失败:', error);
    }
  };

  useEffect(() => {
    loadTree();
    loadAllUnits();
  }, []);

  // 过滤
  const filterUnits = (nodes: UnitTreeNode[]): UnitTreeNode[] => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) return nodes;
    return nodes
      .map((node) => {
        const match =
          includesKeyword(node.name, keyword) ||
          includesKeyword(node.unit_id, keyword);
        const filteredChildren = node.children ? filterUnits(node.children) : [];
        if (match || filteredChildren.length > 0) {
          return { ...node, children: filteredChildren };
        }
        return null;
      })
      .filter(Boolean) as UnitTreeNode[];
  };

  const filteredUnits = filterUnits(units);
  const modalUnits = [...flattenUnits(units), ...allUnits].reduce<ResponsibilityUnit[]>((result, unit) => {
    const key = unit.unit_id || unit.id;
    if (!key || result.some((item) => (item.unit_id || item.id) === key)) return result;
    result.push(unit);
    return result;
  }, []);

  // 新建一级
  const handleCreateTop = () => {
    setEditingUnit(null);
    setParentUnit(null);
    setIsFormOpen(true);
  };

  // 新建下级
  const handleCreateChild = (unit: UnitTreeNode) => {
    setEditingUnit(null);
    setParentUnit({ unit_id: unit.unit_id || unit.id, name: unit.name, type: unit.type, project_id: unit.project_id });
    setIsFormOpen(true);
  };

  // 编辑
  const handleEdit = (unit: UnitTreeNode) => {
    setEditingUnit(unit);
    setParentUnit(null);
    setIsFormOpen(true);
  };

  // 删除
  const deleteIdCandidates = (unit: UnitTreeNode) => {
    const values = [
      unit.unit_id,
      unit.id,
      unit.grid_id,
      unit.team_id,
      unit.personnel_id,
      unit.project_id,
      unit.name,
    ];
    return values
      .map(value => String(value || '').trim())
      .filter(Boolean)
      .filter((value, index, array) => array.indexOf(value) === index);
  };

  const handleDelete = async (unit: UnitTreeNode) => {
    if (window.confirm('确定要删除这个责任单元吗？')) {
      let lastError: any = null;
      try {
        for (const unitId of deleteIdCandidates(unit)) {
          try {
            await unitApiClient.deleteUnit(unitId);
            await loadTree();
            await loadAllUnits();
            return;
          } catch (error: any) {
            lastError = error;
            if (error.response?.status && error.response.status !== 404) {
              throw error;
            }
          }
        }
        throw lastError || new Error('delete failed');
      } catch (error: any) {
        console.error('删除失败:', error);
        alert(error.response?.data?.detail || '删除失败');
      }
    }
  };

  // 表单提交
  const handleFormSubmit = async (data: any) => {
    try {
      if (editingUnit) {
        await unitApiClient.updateUnit(editingUnit.unit_id, data);
      } else {
        await unitApiClient.createUnit(data);
      }
      setIsFormOpen(false);
      setEditingUnit(null);
      setParentUnit(null);
      await loadTree();
      await loadAllUnits();
    } catch (error) {
      console.error('保存失败:', error);
      alert('保存失败');
    }
  };

  // 上移
  const handleMoveUp = async (unitId: string) => {
    try {
      await unitApiClient.moveUp(unitId);
      await loadTree();
    } catch (error) {
      console.error('上移失败:', error);
    }
  };

  // 下移
  const handleMoveDown = async (unitId: string) => {
    try {
      await unitApiClient.moveDown(unitId);
      await loadTree();
    } catch (error) {
      console.error('下移失败:', error);
    }
  };

  // 变更上级
  const handleChangeParent = (unit: UnitTreeNode) => {
    setChangingUnit(unit);
    setIsChangeParentOpen(true);
  };

  const handleChangeParentSubmit = async (unitId: string, newParentId: string) => {
    try {
      await unitApiClient.changeParent(unitId, newParentId);
      setIsChangeParentOpen(false);
      setChangingUnit(null);
      await loadTree();
      await loadAllUnits();
    } catch (error) {
      console.error('变更上级失败:', error);
      const message = (error as any)?.response?.data?.detail || (error as Error)?.message || '变更上级失败';
      alert(`变更上级失败：${message}`);
    }
  };

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-xl border border-white/20 p-4">
      {/* 工具栏 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50" />
            <input
              type="text"
              placeholder="搜索单元名称或编号..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-cyan-400 w-64"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canCreateUnit && (
          <button
            onClick={handleCreateTop}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-lg text-white font-medium hover:from-cyan-400 hover:to-blue-400 transition-colors"
          >
            <Plus size={18} />
            <span>新建一级</span>
          </button>
          )}
        </div>
      </div>

      {/* 树形表格 */}
      {loading ? (
        <div className="py-12 text-center">
          <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/60">加载中...</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <UnitTree
            units={filteredUnits}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onMoveUp={handleMoveUp}
            onMoveDown={handleMoveDown}
            onChangeParent={handleChangeParent}
            onCreateChild={handleCreateChild}
            canCreate={canCreateUnit}
            canEdit={canEditUnit}
            canDelete={canDeleteUnit}
          />
        </div>
      )}

      {/* 弹窗 */}
      <UnitFormModal
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingUnit(null);
          setParentUnit(null);
        }}
        onSubmit={handleFormSubmit}
        editUnit={editingUnit}
        parentUnit={parentUnit}
        allUnits={allUnits}
      />

      <ChangeParentModal
        isOpen={isChangeParentOpen}
        onClose={() => {
          setIsChangeParentOpen(false);
          setChangingUnit(null);
        }}
        onSubmit={handleChangeParentSubmit}
        unit={changingUnit}
        allUnits={modalUnits}
      />
    </div>
  );
};
