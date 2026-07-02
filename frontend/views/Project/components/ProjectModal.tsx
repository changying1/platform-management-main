import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Check, ChevronRight, Download, Loader2, MapPin, Search, Upload, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import AMapLoader from '@amap/amap-jsapi-loader';
import { ProjectFormData, User, Device, Region, Branch, Team } from '../types';
import { getApiUrl, getAuthHeaders } from '@/src/api/config';

const AMAP_KEY = import.meta.env.VITE_AMAP_KEY || 'ab3044412b12b8deb9da741c6739be1d';
const AMAP_SECURITY_CODE = import.meta.env.VITE_AMAP_SECURITY_CODE || '65a74edbb64d47769637df170a5da117';
const DEFAULT_PROJECT_CENTER: [number, number] = [109.13, 34.28];

interface ProjectModalProps {
  isEdit?: boolean;
  initialData?: ProjectFormData;
  onClose: () => void;
  onSuccess: () => void;
}

const formatApiError = (status: number, payload: unknown): string => {
  if (!payload) return `HTTP ${status}`;
  if (typeof payload === 'string') return payload || `HTTP ${status}`;

  if (typeof payload === 'object') {
    const data = payload as { detail?: unknown; message?: unknown; error?: unknown };
    const detail = data.detail ?? data.message ?? data.error;

    if (Array.isArray(detail)) {
      return detail
        .map((item) => {
          if (!item || typeof item !== 'object') return String(item);
          const errorItem = item as { loc?: unknown[]; msg?: string };
          const field = Array.isArray(errorItem.loc) ? errorItem.loc.join('.') : '';
          return field ? `${field}: ${errorItem.msg || '校验失败'}` : errorItem.msg || JSON.stringify(item);
        })
        .join('\n');
    }

    if (detail) return typeof detail === 'string' ? detail : JSON.stringify(detail);
    return JSON.stringify(payload);
  }

  return `HTTP ${status}`;
};

const readApiError = async (res: Response): Promise<string> => {
  const contentType = res.headers.get('content-type') || '';
  try {
    const payload = contentType.includes('application/json') ? await res.json() : await res.text();
    return formatApiError(res.status, payload);
  } catch {
    return `HTTP ${res.status} ${res.statusText}`;
  }
};

const asArray = <T,>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object') {
    const data = value as { data?: unknown; list?: unknown; items?: unknown; records?: unknown; devices?: unknown };
    const nested = data.data ?? data.list ?? data.items ?? data.records ?? data.devices;
    if (Array.isArray(nested)) return nested as T[];
  }
  return [];
};

const hasBrokenName = (value?: string | null) => {
  const text = String(value || '').trim();
  return text.length > 0 && /^[?\s\-()0-9]+$/.test(text);
};

const isTestAccount = (user: User) => {
  const label = `${user.full_name || ''} ${user.username || ''}`.toLowerCase();
  return /\b(test|dup|qa|demo|mock|dummy)\b/.test(label) || label.includes('test-') || label.includes('dup-');
};

const normalizeUsers = (users: User[], project: Pick<ProjectFormData, 'name' | 'branch_id'> & { id?: number }) => {
  const seen = new Set<string>();
  const projectId = String(project.id || '').trim();
  const projectName = String(project.name || '').trim();
  const branchId = String(project.branch_id || '').trim();

  return users.filter((user) => {
    const id = String(user.id || '').trim();
    const username = String(user.username || '').trim();
    const fullName = String(user.full_name || '').trim();
    const key = (username || fullName || id).toLowerCase();
    const level = String(user.permission_level || '').toLowerCase();
    const role = String(user.role || '').toUpperCase();
    const userProjectId = String(user.project_id || '').trim();
    const userProjectName = String(user.project || '').trim();
    const userBranchId = String(user.branch_id || user.department_id || '').trim();

    if (!key || seen.has(key)) return false;
    seen.add(key);

    if (hasBrokenName(fullName || username)) return false;
    if (isTestAccount(user)) return false;
    if (level === 'headquarters_admin' || level === 'branch_admin' || role === 'HQ' || role === 'ADMIN' || role === 'BRANCH') return false;

    if (userProjectId || userProjectName) {
      return Boolean(
        (projectId && userProjectId === projectId) ||
        (projectName && userProjectName === projectName),
      );
    }

    if (projectId || projectName) return false;

    if (!branchId) return true;

    if (branchId && userBranchId && userBranchId !== branchId) return false;

    return Boolean(branchId && userBranchId);
  });
};

const normalizeDevices = (devices: any[]): Device[] => {
  const seen = new Set<string>();

  return devices
    .map((device) => {
      const id = String(device.id || device.device_id || device.device_code || device.raw_id || '').trim();
      const name = String(device.device_name || device.name || device.device_id || device.device_code || id).trim();
      const status = String(device.status || '').toLowerCase();

      return {
        id,
        device_name: name,
        device_type: String(device.device_type || device.type || ''),
        is_online: Boolean(device.is_online) || status === 'online',
      };
    })
    .filter((device) => {
      if (!device.id || seen.has(device.id)) return false;
      seen.add(device.id);
      return Boolean(device.device_name);
    });
};

const matchesCurrentProject = (
  item: any,
  project: Pick<ProjectFormData, 'name'> & { id?: number | string },
  projectNameFields: string[] = ['project', 'project_name'],
) => {
  const projectId = String(project.id || '').trim();
  const projectName = String(project.name || '').trim();
  const itemProjectId = String(item.project_id || item.projectId || '').trim();
  const itemProjectName = projectNameFields
    .map((field) => String(item[field] || '').trim())
    .find(Boolean) || '';

  if (!itemProjectId && !itemProjectName) return false;
  return Boolean(
    (projectId && itemProjectId === projectId) ||
    (projectName && itemProjectName === projectName),
  );
};

const uniqueStrings = (values: unknown[]) =>
  Array.from(new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean)));

const uniqueNumbers = (values: unknown[]) =>
  Array.from(new Set(values.map((value) => Number(value)).filter((value) => Number.isFinite(value))));

const normalizeGrids = (grids: any[]): Region[] => {
  const seen = new Set<string>();

  return grids
    .map((grid) => {
      const rawId = String(grid.id || grid.grid_id || '').trim();

      return {
        id: rawId,
        name: String(grid.name || grid.grid_id || rawId).trim(),
        coordinates_json: grid.bounds_json || '',
        remark: grid.description || '',
      };
    })
    .filter((grid) => {
      const key = String(grid.id || grid.name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return Boolean(grid.name);
    });
};

const normalizeTeams = (teams: any[]): Team[] => {
  const seen = new Set<string>();

  return teams
    .map((team) => ({
      team_id: String(team.team_id || team.id || '').trim(),
      name: String(team.name || team.team_id || team.id || '').trim(),
      project_id: String(team.project_id || '').trim(),
      grid_id: String(team.grid_id || '').trim(),
    }))
    .filter((team) => {
      const key = team.team_id || team.name;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return Boolean(team.name);
    });
};

type SelectionKind = 'users' | 'devices' | 'grids' | 'teams';

interface SelectionItem {
  id: string;
  title: string;
  subtitle?: string;
}

type BatchImportKind = Extract<SelectionKind, 'users' | 'devices'>;

interface BatchImportPreviewRow {
  rowNumber: number;
  label: string;
  code: string;
  status: string;
  id?: string;
  isValid: boolean;
}

interface SelectionDialogProps {
  kind: SelectionKind;
  title: string;
  items: SelectionItem[];
  selectedIds: string[];
  emptyText: string;
  onClose: () => void;
  onConfirm: (ids: string[]) => void;
}

const normalizeCell = (value: unknown) => String(value ?? '').trim();

const normalizeLookupKey = (value: unknown) => normalizeCell(value).toLowerCase();

const downloadSelectionTemplate = (kind: BatchImportKind) => {
  const template =
    kind === 'users'
      ? {
          filename: '项目人员导入模板.xlsx',
          sheetName: '项目人员',
          rows: [
            ['姓名', '工号', '身份证号', '分公司', '项目', '工种', '班组', '电话', '进场日期', '紧急联系人'],
            ['张三', '10001', '41010119900307653X', '第一分公司', '地铁1号线工程', '木工', '木工一班', '13800138001', '2024-03-15', '李桂花 13800138099'],
          ],
        }
      : {
          filename: '项目设备导入模板.xlsx',
          sheetName: '项目设备',
          rows: [
            ['设备名称', '机器码', '通道号', '类型', '位置', '分公司', '项目', '管理员', '管理员电话', '视频流地址'],
            ['海康球机摄像头1号', 'CAMERA-001', '1', '球机', '东门入口', '第一分公司', '地铁1号线工程', '张三', '13800138001', 'rtsp://example.com/live/1'],
          ],
        };

  const worksheet = XLSX.utils.aoa_to_sheet(template.rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, template.sheetName);
  XLSX.writeFile(workbook, template.filename);
};

const findSelectionItem = (items: SelectionItem[], candidates: string[]) => {
  const keys = candidates.map(normalizeLookupKey).filter(Boolean);
  if (keys.length === 0) return undefined;

  return items.find((item) => {
    const searchable = [
      item.id,
      item.title,
      ...(item.subtitle || '').split('/').map((part) => part.trim()),
    ].map(normalizeLookupKey);

    return keys.some((key) => searchable.includes(key));
  });
};

const parseBatchSelectionRows = (
  kind: BatchImportKind,
  rows: unknown[][],
  items: SelectionItem[],
): BatchImportPreviewRow[] => {
  return rows.slice(1).reduce<BatchImportPreviewRow[]>((result, row, index) => {
    const rowNumber = index + 2;
    const label = normalizeCell(row[0]);
    const code = normalizeCell(row[1]);
    const isBlank = row.every((cell) => !normalizeCell(cell));
    if (isBlank) return result;

    const phone = normalizeCell(row[7]);
    const missingMessage = kind === 'users' ? '姓名和工号必填' : '设备名称和机器码必填';
    const item = findSelectionItem(items, [code, label]);

    let status = '可导入';
    if (!label || !code) {
      status = missingMessage;
    } else if (kind === 'users' && phone && !/^1[3-9]\d{9}$/.test(phone)) {
      status = '手机号格式错误';
    } else if (!item) {
      status = kind === 'users' ? '未找到可选人员' : '未找到可选设备';
    }

    result.push({
      rowNumber,
      label,
      code,
      id: item?.id,
      status,
      isValid: status === '可导入' && Boolean(item?.id),
    });
    return result;
  }, []);
};

function SelectionDialog({ kind, title, items, selectedIds, emptyText, onClose, onConfirm }: SelectionDialogProps) {
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<Set<string>>(() => new Set(selectedIds));
  const [importRows, setImportRows] = useState<BatchImportPreviewRow[]>([]);
  const [importError, setImportError] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const batchImportKind: BatchImportKind | null = kind === 'users' || kind === 'devices' ? kind : null;
  const supportsBatchImport = Boolean(batchImportKind);

  const filteredItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => `${item.title} ${item.subtitle || ''}`.toLowerCase().includes(needle));
  }, [items, query]);

  const toggle = (id: string) => {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !batchImportKind) return;

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      try {
        const data = loadEvent.target?.result;
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        if (!sheet) throw new Error('未读取到工作表');

        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
        const previewRows = parseBatchSelectionRows(batchImportKind, rows, items);
        setImportRows(previewRows);
        setImportError(previewRows.length ? '' : '没有读取到可导入的数据');
      } catch (error) {
        setImportRows([]);
        setImportError(error instanceof Error ? error.message : 'Excel 解析失败');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const addImportedRows = () => {
    const ids = importRows.filter((row) => row.isValid && row.id).map((row) => row.id as string);
    if (ids.length === 0) return;

    setDraft((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const validImportCount = importRows.filter((row) => row.isValid).length;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[86vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-gray-700 bg-gray-800 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-700 px-5 py-4">
          <div>
            <h3 className="text-lg font-bold text-white">{title}</h3>
            <p className="mt-1 text-sm text-gray-400">已选择 {draft.size} 项</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 transition-colors hover:text-white">
            <X size={22} />
          </button>
        </div>

        <div className="border-b border-gray-700 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-gray-600 bg-gray-900/60 px-3 py-2">
              <Search size={18} className="text-gray-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索名称、ID或相关信息"
                className="w-full bg-transparent text-sm text-white outline-none placeholder:text-gray-500"
                autoFocus
              />
            </div>
            {supportsBatchImport && (
              <div className="flex shrink-0 gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleImportFile}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm text-white transition-colors hover:bg-blue-500"
                >
                  <Upload size={16} />
                  批量导入
                </button>
                <button
                  type="button"
                  onClick={() => batchImportKind && downloadSelectionTemplate(batchImportKind)}
                  className="inline-flex items-center gap-2 rounded-lg bg-gray-700 px-3 py-2 text-sm text-white transition-colors hover:bg-gray-600"
                >
                  <Download size={16} />
                  模板下载
                </button>
              </div>
            )}
          </div>

          {supportsBatchImport && (importRows.length > 0 || importError) && (
            <div className="mt-3 rounded-lg border border-gray-700 bg-gray-900/50 p-3">
              {importError ? (
                <p className="text-sm text-red-300">{importError}</p>
              ) : (
                <>
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <p className="text-sm text-gray-300">
                      导入预览：共 {importRows.length} 条，有效 {validImportCount} 条
                    </p>
                    <button
                      type="button"
                      onClick={addImportedRows}
                      disabled={validImportCount === 0}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      加入选择
                    </button>
                  </div>
                  <div className="mt-3 max-h-40 overflow-y-auto rounded border border-gray-700">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-gray-800 text-gray-300">
                        <tr>
                          <th className="px-3 py-2 font-medium">行号</th>
                          <th className="px-3 py-2 font-medium">名称</th>
                          <th className="px-3 py-2 font-medium">编号</th>
                          <th className="px-3 py-2 font-medium">状态</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importRows.map((row) => (
                          <tr key={row.rowNumber} className="border-t border-gray-700 text-gray-300">
                            <td className="px-3 py-2">{row.rowNumber}</td>
                            <td className="px-3 py-2">{row.label || '-'}</td>
                            <td className="px-3 py-2">{row.code || '-'}</td>
                            <td className={`px-3 py-2 ${row.isValid ? 'text-emerald-300' : 'text-red-300'}`}>
                              {row.status}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
          </div>

        <div className="flex-1 overflow-y-auto p-4">
          {filteredItems.length === 0 ? (
            <div className="flex h-56 items-center justify-center rounded-lg border border-dashed border-gray-700 text-gray-400">
              {emptyText}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {filteredItems.map((item) => {
                const checked = draft.has(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggle(item.id)}
                    className={`flex min-h-[72px] items-start gap-3 rounded-lg border px-3 py-3 text-left transition-colors ${
                      checked
                        ? 'border-blue-400 bg-blue-500/15'
                        : 'border-gray-700 bg-gray-900/40 hover:border-gray-500 hover:bg-gray-700/40'
                    }`}
                  >
                    <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                      checked ? 'border-blue-400 bg-blue-500 text-white' : 'border-gray-500 bg-gray-800'
                    }`}>
                      {checked && <Check size={14} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-white">{item.title}</span>
                      {item.subtitle && <span className="mt-1 block line-clamp-2 text-xs text-gray-400">{item.subtitle}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-700 px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-lg bg-gray-600 px-5 py-2 text-white transition-colors hover:bg-gray-500">
            取消
          </button>
          <button
            type="button"
            onClick={() => onConfirm(Array.from(draft))}
            className="rounded-lg bg-blue-600 px-5 py-2 text-white transition-colors hover:bg-blue-500"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}

interface LocationPickerDialogProps {
  value: { latitude?: number | null; longitude?: number | null };
  onClose: () => void;
  onConfirm: (point: { latitude: number; longitude: number }) => void;
}

function LocationPickerDialog({ value, onClose, onConfirm }: LocationPickerDialogProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const amapRef = useRef<any>(null);
  const placeSearchRef = useRef<any>(null);
  const [point, setPoint] = useState<{ latitude: number; longitude: number } | null>(() => {
    if (value.latitude != null && value.longitude != null && Number.isFinite(Number(value.latitude)) && Number.isFinite(Number(value.longitude))) {
      return { latitude: Number(value.latitude), longitude: Number(value.longitude) };
    }
    return null;
  });
  const [mapError, setMapError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const initMap = async () => {
      try {
        if (!(window as any)._AMapSecurityConfig) {
          (window as any)._AMapSecurityConfig = { securityJsCode: AMAP_SECURITY_CODE };
        }
        const AMap = await AMapLoader.load({ key: AMAP_KEY, version: '2.0', plugins: ['AMap.PlaceSearch'] });
        if (cancelled || !mapContainerRef.current) return;

        amapRef.current = AMap;
        const center: [number, number] = point ? [point.longitude, point.latitude] : DEFAULT_PROJECT_CENTER;
        const map = new AMap.Map(mapContainerRef.current, {
          zoom: point ? 15 : 11,
          center,
          viewMode: '2D',
          layers: [new AMap.TileLayer.Satellite(), new AMap.TileLayer.RoadNet()],
        });

        const setMarker = (lng: number, lat: number) => {
          setPoint({ latitude: lat, longitude: lng });
          if (!markerRef.current) {
            markerRef.current = new AMap.Marker({ position: [lng, lat], anchor: 'bottom-center' });
            map.add(markerRef.current);
          } else {
            markerRef.current.setPosition([lng, lat]);
          }
        };

        if (point) setMarker(point.longitude, point.latitude);
        map.on('click', (event: any) => {
          const lng = Number(event.lnglat?.getLng?.() ?? event.lnglat?.lng);
          const lat = Number(event.lnglat?.getLat?.() ?? event.lnglat?.lat);
          if (Number.isFinite(lng) && Number.isFinite(lat)) setMarker(lng, lat);
        });

        mapRef.current = map;

        // init place search
        AMap.plugin(['AMap.PlaceSearch'], () => {
          placeSearchRef.current = new AMap.PlaceSearch({
            pageSize: 10,
            pageIndex: 1,
            city: '西安',
          });
        });
      } catch (error) {
        console.error('Project location map init failed', error);
        setMapError('地图加载失败，请检查网络或高德地图配置');
      }
    };

    initMap();
    return () => {
      cancelled = true;
      if (mapRef.current?.destroy) mapRef.current.destroy();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  const handleSearch = () => {
    if (!placeSearchRef.current || !searchQuery.trim()) return;
    setSearching(true);
    placeSearchRef.current.search(searchQuery.trim(), (status: string, result: any) => {
      setSearching(false);
      if (status === 'complete' && result?.info === 'OK') {
        setSearchResults(result.poiList?.pois || []);
      } else {
        setSearchResults([]);
      }
    });
  };

  const handleSelectResult = (item: any) => {
    const lng = Number(item.location?.lng);
    const lat = Number(item.location?.lat);
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      setPoint({ latitude: lat, longitude: lng });
      if (mapRef.current) {
        mapRef.current.setCenter([lng, lat]);
        mapRef.current.setZoom(15);
      }
      if (!markerRef.current) {
        markerRef.current = new amapRef.current.Marker({ position: [lng, lat], anchor: 'bottom-center' });
        mapRef.current?.add(markerRef.current);
      } else {
        markerRef.current.setPosition([lng, lat]);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
      <div className="flex h-[82vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-gray-700 bg-gray-800 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-700 px-5 py-4">
          <div>
            <h3 className="text-lg font-bold text-white">选择项目位置</h3>
            <p className="mt-1 text-sm text-gray-400">点击地图选择位置，或在左侧搜索地点</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 transition-colors hover:text-white">
            <X size={22} />
          </button>
        </div>

        <div className="relative flex flex-1 overflow-hidden bg-gray-900">
          {/* 左侧搜索面板 */}
          <div className="flex w-80 flex-col border-r border-gray-700 bg-gray-800">
            <div className="border-b border-gray-700 p-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="搜索地点，如：西安北站"
                  className="flex-1 rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white outline-none placeholder:text-gray-500 focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={handleSearch}
                  disabled={searching}
                  className="rounded-lg bg-blue-600 px-3 py-2 text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
                >
                  <Search size={16} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {searchResults.length === 0 && !searching && searchQuery && (
                <div className="py-8 text-center text-sm text-gray-400">未找到相关地点</div>
              )}
              {searchResults.map((item, index) => (
                <button
                  key={item.id || index}
                  type="button"
                  onClick={() => handleSelectResult(item)}
                  className="mb-2 flex w-full flex-col rounded-lg border border-gray-700 bg-gray-900/60 p-3 text-left transition-colors hover:border-blue-400 hover:bg-gray-700/40"
                >
                  <span className="text-sm font-semibold text-white">{item.name}</span>
                  <span className="mt-1 text-xs text-gray-400">{item.address}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 右侧地图 */}
          <div className="relative flex-1">
            <div ref={mapContainerRef} className="h-full w-full" />
            {mapError && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-900/90 text-gray-300">
                {mapError}
              </div>
            )}
            <div className="absolute left-4 top-4 rounded-lg border border-gray-700 bg-gray-900/85 px-4 py-3 text-sm text-white shadow-lg">
              {point ? (
                <>
                  <div>经度：{point.longitude.toFixed(6)}</div>
                  <div className="mt-1">纬度：{point.latitude.toFixed(6)}</div>
                </>
              ) : (
                <div className="text-gray-300">未选择位置</div>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-700 px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-lg bg-gray-600 px-5 py-2 text-white transition-colors hover:bg-gray-500">
            取消
          </button>
          <button
            type="button"
            disabled={!point}
            onClick={() => point && onConfirm(point)}
            className="rounded-lg bg-blue-600 px-5 py-2 text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            使用此位置
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProjectModal({ isEdit = false, initialData, onClose, onSuccess }: ProjectModalProps) {
  const [formData, setFormData] = useState<ProjectFormData>(
    initialData || {
      name: '',
      description: '',
      manager: '',
      status: 'active',
      remark: '',
      user_ids: [],
      device_ids: [],
      region_ids: [],
      grid_ids: [],
      team_ids: [],
      latitude: null,
      longitude: null,
    }
  );

  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [availableDevices, setAvailableDevices] = useState<Device[]>([]);
  const [availableRegions, setAvailableRegions] = useState<Region[]>([]);
  const [availableTeams, setAvailableTeams] = useState<Team[]>([]);
  const [availableBranches, setAvailableBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectionKind, setSelectionKind] = useState<SelectionKind | null>(null);
  const [showLocationPicker, setShowLocationPicker] = useState(false);

  useEffect(() => {
    // 鍔犺浇鍙€夌殑鐢ㄦ埛銆佽澶囥€佸尯鍩熴€佸垎鍏徃
    const headers = getAuthHeaders();
    Promise.all([
      fetch(getApiUrl('/admin/users'), { headers }).then((r) => r.json()).catch(() => []),
      fetch(getApiUrl('/device/list'), { headers }).then((r) => r.json()).catch(() => []),
      fetch(getApiUrl('/api/grids/'), { headers }).then((r) => r.json()).catch(() => []),
      fetch(getApiUrl('/team/list'), { headers }).then((r) => r.json()).catch(() => []),
      // fix: dashboard controller uses /api/dashboard prefix
      fetch(getApiUrl('/api/dashboard/branches'), { headers }).then((r) => r.json()).catch(() => []),
    ]).then(([users, devices, grids, teams, branches]) => {
      const projectContext = {
        ...formData,
        id: (initialData as any)?.id,
      };
      const normalizedUsers = normalizeUsers(asArray<User>(users), {
        ...projectContext,
      });
      const shouldFilterByProject = Boolean(isEdit && ((initialData as any)?.id || formData.name));
      const normalizedDevices = normalizeDevices(
        asArray<any>(devices).filter((device) => !shouldFilterByProject || matchesCurrentProject(device, projectContext)),
      );
      const normalizedGrids = normalizeGrids(
        asArray<any>(grids).filter((grid) => !shouldFilterByProject || matchesCurrentProject(grid, projectContext, [])),
      );
      const normalizedTeams = normalizeTeams(
        asArray<any>(teams).filter((team) => !shouldFilterByProject || matchesCurrentProject(team, projectContext)),
      );

      setAvailableUsers(normalizedUsers);
      setAvailableDevices(normalizedDevices);
      setAvailableRegions(normalizedGrids);
      setAvailableTeams(normalizedTeams);
      if (isEdit) {
        setFormData((prev) => ({
          ...prev,
          user_ids: uniqueNumbers([...prev.user_ids, ...(initialData as any)?.users?.map((user: User) => user.id) || [], ...normalizedUsers.map((user) => user.id)]),
          device_ids: uniqueStrings([...prev.device_ids, ...(initialData as any)?.devices?.map((device: Device) => device.id) || [], ...normalizedDevices.map((device) => device.id)]),
          grid_ids: uniqueStrings([...prev.grid_ids, ...normalizedGrids.map((grid) => grid.id)]),
          team_ids: uniqueStrings([...prev.team_ids, ...normalizedTeams.map((team) => team.team_id)]),
        }));
      }
      // fix: ensure branches is an array to avoid map error
      setAvailableBranches(Array.isArray(branches) ? branches : []);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!Number.isFinite(Number(formData.latitude)) || !Number.isFinite(Number(formData.longitude))) {
      alert('请选择项目位置');
      return;
    }

    setLoading(true);

    try {
      const url = isEdit ? getApiUrl(`/projects/${(initialData as any).id}`) : getApiUrl('/projects/');
      const method = isEdit ? 'PUT' : 'POST';
      const payload = {
        ...formData,
        branch_id: formData.branch_id || undefined,
        latitude: Number(formData.latitude),
        longitude: Number(formData.longitude),
        user_ids: formData.user_ids.filter((id) => Number.isFinite(id)),
        device_ids: formData.device_ids.filter(Boolean),
        region_ids: formData.region_ids.filter((id) => Number.isFinite(id)),
        grid_ids: formData.grid_ids.filter(Boolean),
        team_ids: formData.team_ids.filter(Boolean),
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(await readApiError(res));
      onSuccess();
    } catch (error) {
      console.error('Error saving project:', error);
      const message = error instanceof Error ? error.message : String(error);
      alert(`${isEdit ? '更新失败' : '创建失败'}\n\n原因：${message}`);
    } finally {
      setLoading(false);
    }
  };

  const userItems: SelectionItem[] = availableUsers.map((user) => ({
    id: String(user.id),
    title: user.full_name || user.username || String(user.id),
    subtitle: [user.username, user.project, user.team || user.work_team].filter(Boolean).join(' / '),
  }));

  const deviceItems: SelectionItem[] = availableDevices.map((device) => ({
    id: String(device.id),
    title: device.device_name,
    subtitle: `${device.id}${device.device_type ? ` / ${device.device_type}` : ''} / ${device.is_online ? '在线' : '离线'}`,
  }));

  const gridItems: SelectionItem[] = availableRegions.map((region) => ({
    id: String(region.id),
    title: region.name,
    subtitle: region.remark || String(region.id),
  }));

  const teamItems: SelectionItem[] = availableTeams.map((team) => ({
    id: String(team.team_id),
    title: team.name,
    subtitle: [team.team_id, team.project, team.grid_id].filter(Boolean).join(' / '),
  }));

  const selectionConfigs: Record<SelectionKind, {
    title: string;
    items: SelectionItem[];
    selectedIds: string[];
    emptyText: string;
    onConfirm: (ids: string[]) => void;
  }> = {
    users: {
      title: '选择项目人员',
      items: userItems,
      selectedIds: formData.user_ids.map(String),
      emptyText: '暂无人员',
      onConfirm: (ids) => setFormData({ ...formData, user_ids: ids.map(Number).filter(Number.isFinite) }),
    },
    devices: {
      title: '选择项目设备',
      items: deviceItems,
      selectedIds: formData.device_ids,
      emptyText: '暂无设备',
      onConfirm: (ids) => setFormData({ ...formData, device_ids: ids }),
    },
    grids: {
      title: '选择项目网格',
      items: gridItems,
      selectedIds: formData.grid_ids,
      emptyText: '暂无网格',
      onConfirm: (ids) => setFormData({ ...formData, grid_ids: ids }),
    },
    teams: {
      title: '选择项目工队',
      items: teamItems,
      selectedIds: formData.team_ids,
      emptyText: '暂无工队',
      onConfirm: (ids) => setFormData({ ...formData, team_ids: ids }),
    },
  };

  const selectedLabels = (items: SelectionItem[], selectedIds: string[]) => {
    const selected = items.filter((item) => selectedIds.includes(item.id)).map((item) => item.title);
    if (selected.length === 0) return '未选择';
    if (selected.length <= 2) return selected.join(', ');
    return `${selected.slice(0, 2).join(', ')} 等 ${selected.length} 项`;
  };

  const renderSelectionField = (kind: SelectionKind, label: string, value: string) => (
    <button
      type="button"
      onClick={() => setSelectionKind(kind)}
      className="flex w-full items-center justify-between rounded-lg border border-gray-600 bg-gray-700 px-4 py-3 text-left transition-colors hover:border-blue-400 hover:bg-gray-600"
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-white">{label}</span>
        <span className="mt-1 block truncate text-sm text-gray-300">{value}</span>
      </span>
      <ChevronRight size={20} className="shrink-0 text-gray-400" />
    </button>
  );

  return (
    <>
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* 鏍囬鏍?*/}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">{isEdit ? '编辑项目' : '新建项目'}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* 琛ㄥ崟鍐呭 */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          <div className="space-y-4">
            {/* 鍩烘湰淇℃伅 */}
            <div>
              <label className="block text-white font-semibold mb-2">
                项目名称 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
                placeholder="请输入项目名称"
              />
            </div>

            <div>
              <label className="block text-white font-semibold mb-2">项目描述</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
                placeholder="请输入项目描述"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-white font-semibold mb-2">项目经理</label>
                <input
                  type="text"
                  value={formData.manager}
                  onChange={(e) => setFormData({ ...formData, manager: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
                  placeholder="请输入项目经理"
                />
              </div>

              <div>
                <label className="block text-white font-semibold mb-2">项目状态</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="active">进行中</option>
                  <option value="completed">已完成</option>
                  <option value="paused">已暂停</option>
                </select>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-white font-semibold mb-2">所属分公司</label>
              <select
                value={formData.branch_id || ''}
                onChange={(e) => setFormData({ ...formData, branch_id: e.target.value ? Number(e.target.value) : undefined })}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
              >
                <option value="">无（直属总部）</option>
                {availableBranches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-white font-semibold mb-2">
                项目位置 <span className="text-red-400">*</span>
              </label>
              <button
                type="button"
                onClick={() => setShowLocationPicker(true)}
                className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors ${
                  Number.isFinite(Number(formData.latitude)) && Number.isFinite(Number(formData.longitude))
                    ? 'border-blue-400 bg-blue-500/10'
                    : 'border-red-400/60 bg-gray-700 hover:border-red-300'
                }`}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <MapPin size={20} className="shrink-0 text-blue-300" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-white">
                      {Number.isFinite(Number(formData.latitude)) && Number.isFinite(Number(formData.longitude))
                        ? '已选择项目位置'
                        : '点击地图选择项目位置'}
                    </span>
                    <span className="mt-1 block truncate text-sm text-gray-300">
                      {Number.isFinite(Number(formData.latitude)) && Number.isFinite(Number(formData.longitude))
                        ? `经度 ${Number(formData.longitude).toFixed(6)}，纬度 ${Number(formData.latitude).toFixed(6)}`
                        : '创建项目必须选择位置'}
                    </span>
                  </span>
                </span>
                <ChevronRight size={20} className="shrink-0 text-gray-400" />
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {renderSelectionField('users', '项目人员', selectedLabels(userItems, formData.user_ids.map(String)))}
              {renderSelectionField('devices', '项目设备', selectedLabels(deviceItems, formData.device_ids))}
              {renderSelectionField('grids', '项目网格', selectedLabels(gridItems, formData.grid_ids))}
              {renderSelectionField('teams', '项目工队', selectedLabels(teamItems, formData.team_ids))}
            </div>

            <div>
              <label className="block text-white font-semibold mb-2">备注</label>
              <textarea
                value={formData.remark}
                onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
                placeholder="请输入备注"
                rows={2}
              />
            </div>
          </div>

          {/* 鎿嶄綔鎸夐挳 */}
          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading && <Loader2 className="animate-spin" size={16} />}
              {isEdit ? '保存' : '创建'}
            </button>
          </div>
        </form>
      </div>
    </div>
    {selectionKind && (
      <SelectionDialog
        kind={selectionKind}
        {...selectionConfigs[selectionKind]}
        onClose={() => setSelectionKind(null)}
        onConfirm={(ids) => {
          selectionConfigs[selectionKind].onConfirm(ids);
          setSelectionKind(null);
        }}
      />
    )}
    {showLocationPicker && (
      <LocationPickerDialog
        value={{ latitude: formData.latitude, longitude: formData.longitude }}
        onClose={() => setShowLocationPicker(false)}
        onConfirm={(location) => {
          setFormData({ ...formData, ...location });
          setShowLocationPicker(false);
        }}
      />
    )}
    </>
  );
}
