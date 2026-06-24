import React, { useEffect, useMemo, useState } from 'react';
import { MapPin, Save, Search, X } from 'lucide-react';
import AMapLoader from '@amap/amap-jsapi-loader';
import type { Grid } from '../../../types';
import { API_BASE_URL, getAuthHeaders } from '../../../src/api/config';

interface GridFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  editGrid?: Grid | null;
  existingGrids?: Grid[];
}

type LatLngTuple = [number, number];

type BranchOption = {
  id: number;
  name: string;
};

type ProjectOption = {
  id: number;
  name: string;
  branch_id?: number | null;
  branch_name?: string;
  latitude?: number | null;
  longitude?: number | null;
  center?: unknown;
};

const DEFAULT_CENTER: LatLngTuple = [34.3416, 108.9398];
const AMAP_KEY = import.meta.env.VITE_AMAP_KEY || 'ab3044412b12b8deb9da741c6739be1d';
const AMAP_SECURITY_CODE = import.meta.env.VITE_AMAP_SECURITY_CODE || '65a74edbb64d47769637df170a5da117';

const apiUrl = (path: string) => `${API_BASE_URL}${path}`;

const asArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? value : []);

const nextGridId = (grids: Grid[]): string => {
  const used = new Set(grids.map((grid) => String(grid.grid_id || '').trim()).filter(Boolean));
  let index = 1;
  while (used.has(`GRID-${String(index).padStart(3, '0')}`)) {
    index += 1;
  }
  return `GRID-${String(index).padStart(3, '0')}`;
};

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const projectCenter = (project?: ProjectOption | null): LatLngTuple | null => {
  if (!project) return null;

  const lat = toNumber(project.latitude);
  const lng = toNumber(project.longitude);
  if (lat !== null && lng !== null) return [lat, lng];

  if (Array.isArray(project.center) && project.center.length >= 2) {
    const first = toNumber(project.center[0]);
    const second = toNumber(project.center[1]);
    if (first !== null && second !== null) {
      return Math.abs(first) > 90 ? [second, first] : [first, second];
    }
  }

  if (typeof project.center === 'string') {
    try {
      return projectCenter({ ...project, center: JSON.parse(project.center) });
    } catch {
      return null;
    }
  }

  return null;
};

const parseBoundaryPoints = (value?: string): LatLngTuple[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((point: unknown): point is number[] => (
        Array.isArray(point) &&
        point.length >= 2 &&
        Number.isFinite(Number(point[0])) &&
        Number.isFinite(Number(point[1]))
      ))
      .map((point: number[]) => [Number(point[0]), Number(point[1])]);
  } catch {
    return [];
  }
};

const toAmapLngLat = ([lat, lng]: LatLngTuple): [number, number] => [lng, lat];

const BoundaryDrawMap: React.FC<{
  center: LatLngTuple;
  points: LatLngTuple[];
  onChange: (points: LatLngTuple[]) => void;
}> = ({ center, points, onChange }) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<any>(null);
  const amapRef = React.useRef<any>(null);
  const overlaysRef = React.useRef<any[]>([]);
  const pointsRef = React.useRef(points);

  useEffect(() => {
    pointsRef.current = points;
  }, [points]);

  useEffect(() => {
    let cancelled = false;
    const initMap = async () => {
      if (!containerRef.current || mapRef.current) return;
      try {
        if (!(window as any)._AMapSecurityConfig) {
          (window as any)._AMapSecurityConfig = { securityJsCode: AMAP_SECURITY_CODE };
        }
        const AMap = await AMapLoader.load({ key: AMAP_KEY, version: '2.0' });
        if (cancelled) return;
        amapRef.current = AMap;
        mapRef.current = new AMap.Map(containerRef.current, {
          zoom: 16,
          center: toAmapLngLat(center),
          viewMode: '2D',
          layers: [
            new AMap.TileLayer.Satellite(),
            new AMap.TileLayer.RoadNet(),
          ],
        });
        mapRef.current.on('click', (event: any) => {
          const nextPoint: LatLngTuple = [
            Number(event.lnglat.getLat().toFixed(6)),
            Number(event.lnglat.getLng().toFixed(6)),
          ];
          onChange([...pointsRef.current, nextPoint]);
        });
      } catch (error) {
        console.error('AMap init failed', error);
      }
    };

    initMap();
    return () => {
      cancelled = true;
      if (mapRef.current?.destroy) {
        mapRef.current.destroy();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !amapRef.current) return;
    const AMap = amapRef.current;
    const map = mapRef.current;

    overlaysRef.current.forEach((overlay) => map.remove(overlay));
    overlaysRef.current = [];

    const path = points.map(toAmapLngLat);
    if (path.length >= 2) {
      const polyline = new AMap.Polyline({
        path,
        strokeColor: '#22d3ee',
        strokeOpacity: 1,
        strokeWeight: 3,
        strokeStyle: 'dashed',
      });
      map.add(polyline);
      overlaysRef.current.push(polyline);
    }

    if (path.length >= 3) {
      const polygon = new AMap.Polygon({
        path,
        strokeColor: '#06b6d4',
        strokeOpacity: 1,
        strokeWeight: 3,
        fillColor: '#06b6d4',
        fillOpacity: 0.25,
      });
      map.add(polygon);
      overlaysRef.current.push(polygon);
    }

    path.forEach((position, index) => {
      const marker = new AMap.Marker({
        position,
        content: `<div style="width:18px;height:18px;border-radius:50%;background:#06b6d4;border:3px solid white;box-shadow:0 0 8px rgba(6,182,212,.8);"></div>`,
        offset: new AMap.Pixel(-9, -9),
        zIndex: 90,
      });
      const label = new AMap.Marker({
        position,
        content: `<div style="background:#06b6d4;color:white;font-size:11px;font-weight:800;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;">${index + 1}</div>`,
        offset: new AMap.Pixel(-10, -32),
        zIndex: 91,
      });
      map.add(marker);
      map.add(label);
      overlaysRef.current.push(marker, label);
    });

    if (path.length >= 2) {
      map.setFitView(overlaysRef.current, false, [24, 24, 24, 24], 18);
    } else {
      map.setZoomAndCenter(16, toAmapLngLat(center));
    }
  }, [center, points]);

  return (
    <div className="overflow-hidden rounded-lg border border-cyan-500/30 bg-slate-900">
      <div ref={containerRef} className="h-64" />
    </div>
  );
};

export const GridFormModal: React.FC<GridFormModalProps> = ({ isOpen, onClose, onSubmit, editGrid, existingGrids = [] }) => {
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [mapCenter, setMapCenter] = useState<LatLngTuple>(DEFAULT_CENTER);
  const [mapSearch, setMapSearch] = useState('');
  const [searchingMap, setSearchingMap] = useState(false);
  const [formData, setFormData] = useState({
    grid_id: '',
    name: '',
    project_id: '',
    bounds_json: '',
    description: '',
  });

  useEffect(() => {
    if (!isOpen) return;

    const loadOptions = async () => {
      const requestOptions: RequestInit = {
        headers: getAuthHeaders(),
        credentials: 'include',
      };
      const [projectRes, summaryRes, branchRes] = await Promise.allSettled([
        fetch(apiUrl('/projects/'), requestOptions),
        fetch(apiUrl('/api/dashboard/summary'), requestOptions),
        fetch(apiUrl('/api/dashboard/branches'), requestOptions),
      ]);

      const basicProjects = projectRes.status === 'fulfilled' && projectRes.value.ok
        ? asArray<any>(await projectRes.value.json())
        : [];
      const summaryProjects = summaryRes.status === 'fulfilled' && summaryRes.value.ok
        ? asArray<any>(await summaryRes.value.json())
        : [];
      const branchList = branchRes.status === 'fulfilled' && branchRes.value.ok
        ? asArray<any>(await branchRes.value.json())
        : [];

      const summaryById = new Map(summaryProjects.map((item) => [String(item.id), item]));
      const nextProjects = basicProjects.map((project) => {
        const summary = summaryById.get(String(project.id)) || {};
        return {
          id: Number(project.id),
          name: project.name || summary.name || '',
          branch_id: toNumber(project.branch_id ?? summary.branch_id),
          branch_name: project.branch_name,
          latitude: toNumber(summary.latitude ?? project.latitude ?? project.lat),
          longitude: toNumber(summary.longitude ?? project.longitude ?? project.lng),
          center: summary.center ?? project.center,
        };
      }).filter((project) => Number.isFinite(project.id) && project.name);

      const branchNames = new Map<number, string>();
      branchList.forEach((branch) => {
        const id = toNumber(branch.id);
        if (id !== null) branchNames.set(id, branch.name || `鍒嗗叕鍙?${id}`);
      });
      basicProjects.forEach((project) => {
        const id = toNumber(project.branch_id);
        if (id !== null && project.branch_name) branchNames.set(id, project.branch_name);
      });
      nextProjects.forEach((project) => {
        if (project.branch_id !== null && project.branch_id !== undefined && !branchNames.has(project.branch_id)) {
          branchNames.set(project.branch_id, `鍒嗗叕鍙?${project.branch_id}`);
        }
      });

      setBranches(Array.from(branchNames.entries()).map(([id, name]) => ({ id, name })));
      setProjects(nextProjects);

      if (nextProjects.length === 1) {
        setSelectedBranchId(nextProjects[0].branch_id ? String(nextProjects[0].branch_id) : '');
        setFormData((prev) => ({ ...prev, project_id: String(nextProjects[0].id) }));
      }
    };

    loadOptions().catch((error) => console.error('鍔犺浇椤圭洰閫夐」澶辫触:', error));
  }, [isOpen]);

  useEffect(() => {
    if (editGrid) {
      setFormData({
        grid_id: editGrid.grid_id,
        name: editGrid.name,
        project_id: editGrid.project_id?.toString() || '',
        bounds_json: editGrid.bounds_json,
        description: editGrid.description || '',
      });
      return;
    }

    setFormData({
      grid_id: nextGridId(existingGrids),
      name: '',
      project_id: '',
      bounds_json: '',
      description: '',
    });
  }, [editGrid, existingGrids, isOpen]);

  const selectedProject = useMemo(
    () => projects.find((project) => String(project.id) === formData.project_id),
    [formData.project_id, projects]
  );

  const visibleProjects = useMemo(() => {
    if (!selectedBranchId) return projects;
    return projects.filter((project) => String(project.branch_id || '') === selectedBranchId);
  }, [projects, selectedBranchId]);

  useEffect(() => {
    const center = projectCenter(selectedProject);
    if (center) setMapCenter(center);
  }, [selectedProject]);

  const handleProjectChange = (projectId: string) => {
    setFormData((prev) => ({ ...prev, project_id: projectId }));
  };

  const handleBranchChange = (branchId: string) => {
    setSelectedBranchId(branchId);
    const firstProject = projects.find((project) => !branchId || String(project.branch_id || '') === branchId);
    setFormData((prev) => ({ ...prev, project_id: firstProject ? String(firstProject.id) : '' }));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const boundaryPoints = parseBoundaryPoints(formData.bounds_json);

  const handleBoundaryChange = (points: LatLngTuple[]) => {
    setFormData((prev) => ({
      ...prev,
      bounds_json: points.length ? JSON.stringify(points) : '',
    }));
  };

  const handleAmapSearch = async () => {
    const keyword = mapSearch.trim();
    if (!keyword) return;
    try {
      setSearchingMap(true);
      if (!(window as any)._AMapSecurityConfig) {
        (window as any)._AMapSecurityConfig = { securityJsCode: AMAP_SECURITY_CODE };
      }
      const AMap = await AMapLoader.load({ key: AMAP_KEY, version: '2.0' });
      await new Promise<void>((resolve) => {
        AMap.plugin(['AMap.PlaceSearch'], () => {
          const placeSearch = new AMap.PlaceSearch({ city: '全国', pageSize: 1, extensions: 'base' });
          placeSearch.search(keyword, (_status: string, result: any) => {
            const poi = result?.poiList?.pois?.[0];
            const location = poi?.location;
            const lng = Number(location?.lng ?? location?.getLng?.());
            const lat = Number(location?.lat ?? location?.getLat?.());
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
              setMapCenter([lat, lng]);
            } else {
              alert('没有找到该位置');
            }
            resolve();
          });
        });
      });
    } catch (error) {
      console.error(error);
      alert('地图搜索失败');
    } finally {
      setSearchingMap(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.project_id.trim()) {
      alert('请选择所属项目');
      return;
    }
    if (boundaryPoints.length < 3) {
      alert('请在地图上至少点选 3 个点，绘制网格区域');
      return;
    }

    onSubmit({
      ...formData,
      level: 'workface',
      parent_id: null,
      project_id: formData.project_id.trim(),
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="max-h-[88vh] w-[620px] overflow-hidden rounded-xl border border-white/20 bg-slate-800 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-blue-600/20 to-cyan-600/20 px-6 py-4">
          <h3 className="text-xl font-bold text-white">{editGrid ? '缂栬緫缃戞牸' : '鏂板缓缃戞牸'}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            type="button"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="max-h-[calc(88vh-140px)] overflow-y-auto p-6">
          {branches.length > 1 && (
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-white/80">
                所属子公司 <span className="text-red-400">*</span>
              </label>
              <select
                value={selectedBranchId}
                onChange={(event) => handleBranchChange(event.target.value)}
                className="w-full rounded-lg border border-white/20 bg-slate-700 px-4 py-2 text-white focus:border-cyan-400 focus:outline-none"
              >
                <option value="" className="bg-slate-700 text-white">请选择子公司</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id} className="bg-slate-700 text-white">
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-white/80">
              所属项目 <span className="text-red-400">*</span>
            </label>
            <select
              value={formData.project_id}
              onChange={(event) => handleProjectChange(event.target.value)}
              required
              className="w-full rounded-lg border border-white/20 bg-slate-700 px-4 py-2 text-white focus:border-cyan-400 focus:outline-none"
            >
              <option value="" className="bg-slate-700 text-white">请选择项目</option>
              {visibleProjects.map((project) => (
                <option key={project.id} value={project.id} className="bg-slate-700 text-white">
                  {project.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-white/80">
              网格编号 <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              name="grid_id"
              value={formData.grid_id}
              onChange={handleChange}
              required
              className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-white placeholder-white/40 focus:border-cyan-400 focus:outline-none"
              placeholder="如 GRID-001"
            />
          </div>

          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-white/80">
              网格名称 <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-white placeholder-white/40 focus:border-cyan-400 focus:outline-none"
              placeholder="如 1号隧道、桥梁二网格、站房施工区"
            />
          </div>

          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-white/80">地理边界</label>
            <div className="mb-2 flex gap-2">
              <div className="relative flex-1">
                <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-cyan-400" />
                <input
                  value={mapSearch}
                  onChange={(event) => setMapSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      handleAmapSearch();
                    }
                  }}
                  className="w-full rounded-md border border-white/15 bg-white/10 py-1.5 pl-9 pr-3 text-sm text-white placeholder-white/40 focus:border-cyan-400 focus:outline-none"
                  placeholder="搜索地点，定位后再绘制边界"
                />
              </div>
              <button
                type="button"
                onClick={handleAmapSearch}
                disabled={searchingMap}
                className="flex items-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-500/15 px-3 py-1.5 text-sm text-cyan-200 hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Search size={14} />
                搜索
              </button>
              <button
                type="button"
                onClick={() => handleBoundaryChange(boundaryPoints.slice(0, -1))}
                disabled={boundaryPoints.length === 0}
                className="rounded-md border border-white/15 px-2 py-1 text-xs text-white/70 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                撤销点
              </button>
              <button
                type="button"
                onClick={() => handleBoundaryChange([])}
                disabled={boundaryPoints.length === 0}
                className="rounded-md border border-white/15 px-2 py-1 text-xs text-white/70 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              >
                清空
              </button>
            </div>
            <BoundaryDrawMap center={mapCenter} points={boundaryPoints} onChange={handleBoundaryChange} />
            <div className="mt-2 text-xs text-white/50">
              选择项目后地图会定位到项目位置；也可搜索地点后，在地图上依次点击绘制网格边界。
            </div>
            <textarea
              name="bounds_json"
              value={formData.bounds_json}
              onChange={handleChange}
              rows={3}
              className="mt-2 w-full rounded-lg border border-white/20 bg-white/10 px-4 py-2 font-mono text-sm text-white placeholder-white/40 focus:border-cyan-400 focus:outline-none"
              placeholder="边界坐标会自动生成，也可粘贴 JSON 坐标"
            />
          </div>

          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-white/80">描述</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={3}
              className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-white placeholder-white/40 focus:border-cyan-400 focus:outline-none"
              placeholder="请输入网格说明"
            />
          </div>
        </form>

        <div className="flex justify-end gap-3 border-t border-white/10 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg bg-white/10 px-4 py-2 text-white transition-colors hover:bg-white/20"
            type="button"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-2 text-white transition-colors hover:from-cyan-400 hover:to-blue-400"
            type="button"
          >
            <Save size={16} />
            {editGrid ? '保存修改' : '创建网格'}
          </button>
        </div>
      </div>
    </div>
  );
};
