import React, { useEffect, useState } from 'react';
import { AlertCircle, Filter, Grid3X3, Map, Plus, Search, X } from 'lucide-react';
import type { Grid, GridDetail } from '../../types';
import { gridApiClient } from '../../src/api/gridApi';
import { hasStoredPermission } from '../../src/utils/permissions';
import { GridDetailModal } from './components/GridDetailModal';
import { GridFormModal } from './components/GridFormModal';
import { GridList } from './components/GridList';
import { GridMap } from './components/GridMap';

type TabType = 'list' | 'map';

const GridManagement: React.FC = () => {
  const [grids, setGrids] = useState<Grid[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('list');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [editingGrid, setEditingGrid] = useState<Grid | null>(null);
  const [selectedGrid, setSelectedGrid] = useState<GridDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const canCreatePersonnel = hasStoredPermission('personnel.create');
  const canEditPersonnel = hasStoredPermission('personnel.edit');
  const canDeletePersonnel = hasStoredPermission('personnel.delete');

  const loadGrids = async () => {
    try {
      setLoading(true);
      setGrids(await gridApiClient.getGrids());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGrids();
  }, []);

  const filteredGrids = grids.filter((grid) =>
    String(grid?.name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleView = async (grid: Grid) => {
    const detail = await gridApiClient.getGridById(grid.grid_id || grid.id);
    setSelectedGrid({
      ...detail,
      personnel: [],
      devices: [],
      alarm_count: 0,
      danger_count: 0,
    });
    setIsDetailOpen(true);
  };

  const handleFormSubmit = async (data: any) => {
    if (saving) return;
    try {
      setSaving(true);
      if (editingGrid) {
        await gridApiClient.updateGrid(editingGrid.id, data);
      } else {
        await gridApiClient.createGrid(data);
      }
      await loadGrids();
      setIsFormOpen(false);
      setEditingGrid(null);
    } catch (error: any) {
      const detail = error?.response?.data?.detail || error?.message;
      const message = detail === 'Grid ID already exists'
        ? '网格编号已存在，请更换网格编号'
        : detail || '保存网格失败';
      setErrorMessage(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (gridId: string) => {
    if (!window.confirm('确定删除这个网格吗？')) return;
    await gridApiClient.deleteGrid(gridId);
    await loadGrids();
  };

  return (
    <div className="rounded-lg border border-blue-400/30 bg-slate-900/65 backdrop-blur-md p-4 h-full overflow-auto">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[180px] max-w-[280px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-cyan-400" />
          <input
            type="text"
            placeholder="搜索网格名称..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="w-full bg-slate-800/50 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
          />
        </div>

        <button className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 border border-slate-700 rounded-lg text-sm text-slate-300 hover:bg-slate-700/50 hover:text-slate-100 transition-colors">
          <Filter size={14} />
          <span>筛选</span>
        </button>

        {canCreatePersonnel && (
        <button
          onClick={() => {
            setEditingGrid(null);
            setIsFormOpen(true);
          }}
          className="flex items-center gap-2 px-4 py-1.5 bg-cyan-500/20 border border-cyan-500/50 rounded-lg text-sm text-cyan-300 hover:bg-cyan-500/30 transition-colors"
        >
          <Plus size={14} />
          <span>新建网格</span>
        </button>
        )}

        <button
          onClick={() => setActiveTab('list')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors text-sm ${
            activeTab === 'list'
              ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/50'
              : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
          }`}
        >
          <Grid3X3 size={16} />
          <span>网格列表</span>
        </button>
        <button
          onClick={() => setActiveTab('map')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors text-sm ${
            activeTab === 'map'
              ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/50'
              : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
          }`}
        >
          <Map size={16} />
          <span>网格地图</span>
        </button>
      </div>

      {loading ? (
        <div className="py-10 text-center text-slate-400">加载中...</div>
      ) : activeTab === 'list' ? (
        <GridList
          grids={filteredGrids}
          onEdit={(grid) => {
            setEditingGrid(grid);
            setIsFormOpen(true);
          }}
          onDelete={handleDelete}
          onView={handleView}
          canEdit={canEditPersonnel}
          canDelete={canDeletePersonnel}
        />
      ) : (
        <GridMap grids={grids} onGridClick={handleView} />
      )}

      <GridFormModal
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingGrid(null);
        }}
        onSubmit={handleFormSubmit}
        editGrid={editingGrid}
        existingGrids={grids}
      />

      <GridDetailModal
        grid={selectedGrid!}
        isOpen={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false);
          setSelectedGrid(null);
        }}
      />

      {errorMessage && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-rose-400/40 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <div className="flex items-center gap-2 text-rose-300">
                <AlertCircle size={20} />
                <h3 className="text-base font-semibold text-white">保存网格失败</h3>
              </div>
              <button
                type="button"
                onClick={() => setErrorMessage('')}
                className="rounded-md p-1 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
            <div className="px-5 py-4 text-sm leading-6 text-slate-200">{errorMessage}</div>
            <div className="flex justify-end border-t border-white/10 px-5 py-4">
              <button
                type="button"
                onClick={() => setErrorMessage('')}
                className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-400"
              >
                知道了
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GridManagement;
