import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Polygon, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { Grid } from '../../../types';

interface GridMapProps {
  grids: Grid[];
  onGridClick: (grid: Grid) => void;
}

export const GridMap: React.FC<GridMapProps> = ({ grids, onGridClick }) => {
  const mapRef = useRef<L.Map>(null);

  useEffect(() => {
    // 地图初始化后的自定义配置
  }, []);

  const getGridColor = (status: Grid['status']) => {
    switch (status) {
      case 'normal':
        return { fillColor: '#22c55e', color: '#16a34a', fillOpacity: 0.3 };
      case 'warning':
        return { fillColor: '#eab308', color: '#ca8a04', fillOpacity: 0.4 };
      case 'alarm':
        return { fillColor: '#ef4444', color: '#dc2626', fillOpacity: 0.4 };
      default:
        return { fillColor: '#6b7280', color: '#4b5563', fillOpacity: 0.3 };
    }
  };

  const parseBounds = (boundsJson?: string | null): L.LatLngExpression[] => {
    if (!boundsJson || typeof boundsJson !== 'string') {
      return [];
    }

    try {
      const coords = JSON.parse(boundsJson);
      if (Array.isArray(coords)) {
        return coords
          .filter((coord: unknown): coord is number[] => (
            Array.isArray(coord) &&
            coord.length >= 2 &&
            Number.isFinite(Number(coord[0])) &&
            Number.isFinite(Number(coord[1]))
          ))
          .map((coord: number[]) => [Number(coord[0]), Number(coord[1])]);
      }
    } catch {
      console.error('Failed to parse bounds JSON');
    }
    return [];
  };

  // 默认中心位置（上海）
  const defaultCenter: L.LatLngExpression = [31.2304, 121.4737];

  return (
    <div className="bg-white/10 backdrop-blur-md rounded-xl border border-white/20 overflow-hidden">
      {/* 图例 */}
      <div className="bg-gradient-to-r from-blue-600/20 to-cyan-600/20 px-6 py-3 border-b border-white/10">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">网格地图</h3>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: '#22c55e', opacity: 0.6 }}></div>
              <span className="text-sm text-white/70">正常</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: '#eab308', opacity: 0.6 }}></div>
              <span className="text-sm text-white/70">预警</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: '#ef4444', opacity: 0.6 }}></div>
              <span className="text-sm text-white/70">报警</span>
            </div>
          </div>
        </div>
      </div>

      {/* 地图 */}
      <div className="h-[400px]">
        <MapContainer
          ref={mapRef}
          center={defaultCenter}
          zoom={14}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* 网格区域 */}
          {grids.map((grid) => {
            const bounds = parseBounds(grid.bounds_json);
            if (bounds.length < 3) return null;
            
            return (
              <Polygon
                key={grid.id || grid.grid_id}
                positions={bounds}
                {...getGridColor(grid.status)}
                weight={2}
                onClick={() => onGridClick(grid)}
                className="cursor-pointer hover:fill-opacity-0.6 transition-opacity"
              >
                <Popup>
                  <div className="p-2">
                    <h4 className="font-bold text-gray-800">{grid.name}</h4>
                    <p className="text-sm text-gray-600">状态: {grid.status === 'normal' ? '正常' : grid.status === 'warning' ? '预警' : '报警'}</p>
                    <p className="text-sm text-gray-600">面积: {grid.area || '-'} m²</p>
                  </div>
                </Popup>
              </Polygon>
            );
          })}

          {/* 中心点标记 */}
          <Marker position={defaultCenter}>
            <Popup>
              <div className="p-2">
                <h4 className="font-bold text-gray-800">项目中心</h4>
              </div>
            </Popup>
          </Marker>
        </MapContainer>
      </div>
    </div>
  );
};
