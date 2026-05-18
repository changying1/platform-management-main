import React, { useState, useEffect } from 'react';
import { Plus, Search, Filter, Grid3X3, Map, Users, FolderTree } from 'lucide-react';
import type { Grid, GridDetail, GridStats } from '../../types';
import { GridList } from './components/GridList';
import { GridDetailModal } from './components/GridDetailModal';
import { GridFormModal } from './components/GridFormModal';
import { GridStatsCard } from './components/GridStats';
import { GridMap } from './components/GridMap';
import { ResponsibilityUnitView } from './components/ResponsibilityUnit';
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
  const [stats, setStats] = useState<GridStats | null>(null);
  const [personnelList, setPersonnelList] = useState<PersonnelItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('list');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [editingGrid, setEditingGrid] = useState<Grid | null>(null);
  const [selectedGrid, setSelectedGrid] = useState<GridDetail | null>(null);
  const [loading, setLoading] = useState(false);

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

  const loadStats = async () => {
    try {
      const data = await gridApiClient.getGridStats();
      setStats(data);
    } catch (error) {
      console.error('加载统计数据失败:', error);
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
    loadStats();
  }, []);

  useEffect(() => {
    if (activeTab === 'personnel') {
      loadPersonnel();
    }
  }, [activeTab]);

  const filteredGrids = grids.filter((grid) =>
    grid.name.toLowerCase().includes(searchTerm.toLowerCase())
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
        await loadStats();
      } catch (error) {
        console.error('删除网格失败:', error);
        alert('删除失败');
      }
    }
  };

  const handleView = async (grid: Grid) => {
    try {
      const detail = await gridApiClient.getGridById(grid.grid_id);
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
      await loadStats();
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

  const getGridNames = (gridIds: string[]) => {
    if (!gridIds || gridIds.length === 0) return '-';
    return gridIds
      .map((grid_id) => grids.find((g) => g.grid_id === grid_id)?.name)
      .filter(Boolean)
      .join(', ');
  };

  return (
    <div className="min-h-screen p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-2">网格化管理</h1>
        <p className="text-white/60">实现施工区域精细化管理，责任到人</p>
      </div>

      {stats && (
        <div className="mb-6">
          <GridStatsCard stats={stats} />
        </div>
      )}

      <div className="bg-white/10 backdrop-blur-md rounded-xl border border-white/20 p-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50" />
              <input
                type="text"
                placeholder="搜索网格名称..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-cyan-400 w-64"
              />
            </div>
            <button className="flex items-center gap-2 px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white hover:bg-white/20 transition-colors">
              <Filter size={18} />
              <span>筛选</span>
            </button>
          </div>

          <button
            onClick={handleCreate}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-lg text-white font-medium hover:from-cyan-400 hover:to-blue-400 transition-colors"
          >
            <Plus size={18} />
            <span>新建网格</span>
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-6">
        <button
          onClick={() => setActiveTab('list')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
            activeTab === 'list'
              ? 'bg-cyan-500 text-white'
              : 'bg-white/10 text-white/70 hover:bg-white/20'
          }`}
        >
          <Grid3X3 size={18} />
          <span>网格列表</span>
        </button>
        <button
          onClick={() => setActiveTab('map')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
            activeTab === 'map'
              ? 'bg-cyan-500 text-white'
              : 'bg-white/10 text-white/70 hover:bg-white/20'
          }`}
        >
          <Map size={18} />
          <span>网格地图</span>
        </button>
        <button
          onClick={() => setActiveTab('personnel')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
            activeTab === 'personnel'
              ? 'bg-cyan-500 text-white'
              : 'bg-white/10 text-white/70 hover:bg-white/20'
          }`}
        >
          <Users size={18} />
          <span>责任分配</span>
        </button>
        <button
          onClick={() => setActiveTab('unit')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
            activeTab === 'unit'
              ? 'bg-cyan-500 text-white'
              : 'bg-white/10 text-white/70 hover:bg-white/20'
          }`}
        >
          <FolderTree size={18} />
          <span>责任单元</span>
        </button>
      </div>

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
        <div className="bg-white/10 backdrop-blur-md rounded-xl border border-white/20 p-6">
          <h3 className="text-lg font-bold text-white mb-4">责任人员管理</h3>
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white/5 rounded-lg p-4">
              <p className="text-2xl font-bold text-cyan-400 mb-1">{personnelList.length}</p>
              <p className="text-sm text-white/60">总人数</p>
            </div>
            <div className="bg-white/5 rounded-lg p-4">
              <p className="text-2xl font-bold text-blue-400 mb-1">
                {personnelList.filter((p) => p.role === 'grid_manager').length}
              </p>
              <p className="text-sm text-white/60">网格长</p>
            </div>
            <div className="bg-white/5 rounded-lg p-4">
              <p className="text-2xl font-bold text-green-400 mb-1">
                {personnelList.filter((p) => p.role === 'safety_manager').length}
              </p>
              <p className="text-sm text-white/60">安全员</p>
            </div>
            <div className="bg-white/5 rounded-lg p-4">
              <p className="text-2xl font-bold text-yellow-400 mb-1">
                {personnelList.filter((p) => p.role === 'technician').length}
              </p>
              <p className="text-sm text-white/60">技术员</p>
            </div>
          </div>

          <div className="mt-6">
            <table className="w-full">
              <thead>
                <tr className="bg-white/5">
                  <th className="px-4 py-3 text-left text-sm font-semibold text-white/70">姓名</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-white/70">角色</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-white/70">所属单位</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-white/70">联系电话</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-white/70">负责网格</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold text-white/70">操作</th>
                </tr>
              </thead>
              <tbody>
                {personnelList.map((person) => (
                  <tr key={person.id} className="border-t border-white/5">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 flex items-center justify-center">
                          <span className="text-white text-sm font-medium">{person.name.charAt(0)}</span>
                        </div>
                        <span className="text-white">{person.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 rounded text-xs bg-cyan-500/10 text-cyan-300">
                        {roleNames[person.role] || person.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white/60">{person.department}</td>
                    <td className="px-4 py-3 text-white/60">{person.phone}</td>
                    <td className="px-4 py-3 text-white/60">
                      {getGridNames(person.grid_ids)}
                    </td>
                    <td className="px-4 py-3">
                      <button className="px-3 py-1 rounded text-xs bg-blue-500/10 text-blue-400 hover:bg-blue-500/20">
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
    </div>
  );
};

export default GridManagement;
