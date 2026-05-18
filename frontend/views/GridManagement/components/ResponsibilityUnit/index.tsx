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

export const ResponsibilityUnitView: React.FC = () => {
  const [units, setUnits] = useState<UnitTreeNode[]>([]);
  const [allUnits, setAllUnits] = useState<ResponsibilityUnit[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<ResponsibilityUnit | null>(null);
  const [parentUnit, setParentUnit] = useState<{ unit_id: string; name: string } | null>(null);

  const [isChangeParentOpen, setIsChangeParentOpen] = useState(false);
  const [changingUnit, setChangingUnit] = useState<ResponsibilityUnit | null>(null);

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
    if (!searchTerm) return nodes;
    return nodes
      .map((node) => {
        const match =
          node.name.includes(searchTerm) || node.unit_id.includes(searchTerm);
        const filteredChildren = node.children ? filterUnits(node.children) : [];
        if (match || filteredChildren.length > 0) {
          return { ...node, children: filteredChildren };
        }
        return null;
      })
      .filter(Boolean) as UnitTreeNode[];
  };

  const filteredUnits = filterUnits(units);

  // 新建一级
  const handleCreateTop = () => {
    setEditingUnit(null);
    setParentUnit(null);
    setIsFormOpen(true);
  };

  // 新建下级
  const handleCreateChild = (unit: UnitTreeNode) => {
    setEditingUnit(null);
    setParentUnit({ unit_id: unit.unit_id, name: unit.name });
    setIsFormOpen(true);
  };

  // 编辑
  const handleEdit = (unit: UnitTreeNode) => {
    setEditingUnit(unit);
    setParentUnit(null);
    setIsFormOpen(true);
  };

  // 删除
  const handleDelete = async (unitId: string) => {
    if (window.confirm('确定要删除这个责任单元吗？')) {
      try {
        await unitApiClient.deleteUnit(unitId);
        await loadTree();
        await loadAllUnits();
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
      alert('变更上级失败');
    }
  };

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-xl border border-white/20 p-6">
      {/* 工具栏 */}
      <div className="flex items-center justify-between mb-6">
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
          <button
            onClick={handleCreateTop}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-lg text-white font-medium hover:from-cyan-400 hover:to-blue-400 transition-colors"
          >
            <Plus size={18} />
            <span>新建一级</span>
          </button>
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
      />

      <ChangeParentModal
        isOpen={isChangeParentOpen}
        onClose={() => {
          setIsChangeParentOpen(false);
          setChangingUnit(null);
        }}
        onSubmit={handleChangeParentSubmit}
        unit={changingUnit}
        allUnits={allUnits}
      />
    </div>
  );
};
