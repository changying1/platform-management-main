import React, { useState, useEffect } from 'react';
import { Plus, Search, Filter, Grid3X3, Map, Users, FolderTree } from 'lucide-react';
import type { Grid, GridDetail, GridStats } from '../../types';
import { GridList } from './components/GridList';
import { GridDetailModal } from './components/GridDetailModal';
import { GridFormModal } from './components/GridFormModal';
import { GridMap } from './components/GridMap';
import { ResponsibilityUnitView } from './components/ResponsibilityUnit';
import { AssignGridModal } from './components/AssignGridModal';
import {
  gridApiClient,
  gridPersonnelApiClient,
  roleNames,
} from '../../src/api/gridApi';

type TabType = 'list' | 'map' | 'personnel' | 'unit';

interface PersonnelItem {
  id: string;
  name: string;
  role: string;
  phone: string;
  department: string;
  grid_ids: string[];
}

const GridManagement: React.FC = () => {
  const [grids, setGrids] = useState<Grid[]>([]);
  const [personnelList, setPersonnelList] = useState<PersonnelItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('list');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [editingGrid, setEditingGrid] = useState<Grid | null>(null);
  const [selectedGrid, setSelectedGrid] = useState<GridDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [assigningPersonnel, setAssigningPersonnel] = useState<PersonnelItem | null>(null);

  const loadGrids = async () => {
    try {
      setLoading(true);
      const data = await gridApiClient.getGrids();
      setGrids(data);
    } catch (error) {
      console.error('加载网格列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPersonnel = async () => {
    try {
      const data = await gridPersonnelApiClient.getPersonnel();
      setPersonnelList(data);
    } catch (error) {
      console.error('加载责任人员失败:', error);
    }
  };

  useEffect(() => {
    loadGrids();
  }, []);

  useEffect(() => {
    if (activeTab === 'personnel') {
      loadPersonnel();
    }
  }, [activeTab]);

  const filteredGrids = grids.filter((grid) =>
    String(grid?.name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreate = () => {
    setEditingGrid(null);
    setIsFormOpen(true);
  };

  const handleEdit = (grid: Grid) => {
    setEditingGrid(grid);
    setIsFormOpen(true);
  };

  const handleDelete = async (gridId: string) => {
    if (window.confirm('确定要删除这个网格吗？')) {
      try {
        await gridApiClient.deleteGrid(gridId);
        await loadGrids();
      } catch (error) {
        console.error('删除网格失败:', error);
        alert('删除失败');
      }
    }
  };

  const handleView = async (grid: Grid) => {
    try {
      const detail = await gridApiClient.getGridById(grid.grid_id || grid.id);
      setSelectedGrid({
        ...detail,
        personnel: [],
        devices: [],
        alarm_count: 0,
        danger_count: 0,
      });
      setIsDetailOpen(true);
    } catch (error) {
      console.error('加载网格详情失败:', error);
    }
  };

  const handleFormSubmit = async (data: any) => {
    try {
      if (editingGrid) {
        await gridApiClient.updateGrid(editingGrid.id, data);
      } else {
        await gridApiClient.createGrid(data);
      }
      await loadGrids();
      setIsFormOpen(false);
      setEditingGrid(null);
    } catch (error) {
      console.error('保存网格失败:', error);
      alert('保存失败');
    }
  };

  const handleGridClick = (grid: Grid) => {
    handleView(grid);
  };

  const handleAssignGrid = (person: PersonnelItem) => {
    setAssigningPersonnel(person);
    setIsAssignOpen(true);
  };

  const handleAssignSubmit = async (gridIds: string[]) => {
    if (!assigningPersonnel) return;
    try {
      await gridPersonnelApiClient.updatePersonnel(assigningPersonnel.id, { grid_ids: gridIds });
      await loadPersonnel();
      setIsAssignOpen(false);
      setAssigningPersonnel(null);
    } catch (error) {
      console.error('分配网格失败:', error);
      alert('分配失败');
    }
  };

  const getGridNames = (gridIds: string[]) => {
    if (!gridIds || gridIds.length === 0) return '-';
    return gridIds
      .map((grid_id) => grids.find((g) => g.grid_id === grid_id)?.name)
      .filter(Boolean)
      .join(', ');
  };

  return (
    <div className="rounded-lg border border-blue-400/30 bg-slate-900/65 backdrop-blur-md p-4 h-full overflow-auto">

      {/* 操作栏 */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {/* 搜索框 */}
        <div className="relative flex-1 min-w-[180px] max-w-[280px]">
          <Search size={14} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-cyan-400" />
          <input
            type="text"
            placeholder="搜索网格名称..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-800/50 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
          />
        </div>

        <button className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 border border-slate-700 rounded-lg text-sm text-slate-300 hover:bg-slate-700/50 hover:text-slate-100 transition-colors">
          <Filter size={14} />
          <span>筛选</span>
        </button>

        <button
          onClick={handleCreate}
          className="flex items-center gap-2 px-4 py-1.5 bg-cyan-500/20 border border-cyan-500/50 rounded-lg text-sm text-cyan-300 hover:bg-cyan-500/30 transition-colors"
        >
          <Plus size={14} />
          <span>新建网格</span>
        </button>

        {/* 标签切换按钮 */}
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
        <button
          onClick={() => setActiveTab('personnel')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors text-sm ${
            activeTab === 'personnel'
              ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/50'
              : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
          }`}
        >
          <Users size={16} />
          <span>责任分配</span>
        </button>
        <button
          onClick={() => setActiveTab('unit')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors text-sm ${
            activeTab === 'unit'
              ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/50'
              : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
          }`}
        >
          <FolderTree size={16} />
          <span>责任单元</span>
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {activeTab === 'list' && (
          <GridList
            grids={filteredGrids}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onView={handleView}
          />
        )}

        {activeTab === 'map' && (
          <GridMap grids={grids} onGridClick={handleGridClick} />
        )}

        {activeTab === 'personnel' && (
          <div className="bg-slate-800/30 rounded-lg border border-slate-700/50 p-4">
            <div className="flex items-center gap-6 mb-4">
              <h3 className="text-base font-semibold text-slate-200">责任人员管理</h3>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 bg-cyan-500/20 px-3 py-1 rounded-lg border border-cyan-500/30">
                  <span className="text-lg font-bold text-cyan-400">{personnelList.length}</span>
                  <span className="text-xs text-cyan-300/80">总人数</span>
                </div>
                <div className="flex items-center gap-2 bg-blue-500/20 px-3 py-1 rounded-lg border border-blue-500/30">
                  <span className="text-lg font-bold text-blue-400">
                    {personnelList.filter((p) => p.role === 'grid_manager').length}
                  </span>
                  <span className="text-xs text-blue-300/80">网格长</span>
                </div>
                <div className="flex items-center gap-2 bg-green-500/20 px-3 py-1 rounded-lg border border-green-500/30">
                  <span className="text-lg font-bold text-green-400">
                    {personnelList.filter((p) => p.role === 'safety_manager').length}
                  </span>
                  <span className="text-xs text-green-300/80">安全员</span>
                </div>
                <div className="flex items-center gap-2 bg-yellow-500/20 px-3 py-1 rounded-lg border border-yellow-500/30">
                  <span className="text-lg font-bold text-yellow-400">
                    {personnelList.filter((p) => p.role === 'technician').length}
                  </span>
                  <span className="text-xs text-yellow-300/80">技术员</span>
                </div>
              </div>
            </div>

            <div className="mt-4">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-700/30">
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400">姓名</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400">角色</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400">所属单位</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400">联系电话</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400">负责网格</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {personnelList.map((person) => (
                    <tr key={person.id} className="border-t border-slate-700/30">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 flex items-center justify-center">
                            <span className="text-white text-xs font-medium">{String(person.name || '?').charAt(0)}</span>
                          </div>
                          <span className="text-sm text-slate-200">{person.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span className="px-2 py-0.5 rounded text-xs bg-cyan-500/20 text-cyan-300">
                          {roleNames[person.role] || person.role}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-400">{person.department}</td>
                      <td className="px-3 py-2 text-sm text-slate-400">{person.phone}</td>
                      <td className="px-3 py-2 text-sm text-slate-400">
                        {getGridNames(person.grid_ids)}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => handleAssignGrid(person)}
                          className="px-2 py-1 rounded text-xs bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 border border-cyan-500/30"
                        >
                          分配网格
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'unit' && <ResponsibilityUnitView />}
      </div>

      <GridFormModal
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingGrid(null);
        }}
        onSubmit={handleFormSubmit}
        editGrid={editingGrid}
      />

      <GridDetailModal
        grid={selectedGrid!}
        isOpen={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false);
          setSelectedGrid(null);
        }}
      />

      <AssignGridModal
        isOpen={isAssignOpen}
        onClose={() => {
          setIsAssignOpen(false);
          setAssigningPersonnel(null);
        }}
        onAssign={handleAssignSubmit}
        personnelId={assigningPersonnel?.id || ''}
        currentGridIds={assigningPersonnel?.grid_ids || []}
      />
    </div>
  );
};

export default GridManagement;