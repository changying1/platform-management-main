import React, { useEffect, useMemo, useRef, useState } from 'react';
import AMapLoader from '@amap/amap-jsapi-loader';
import type { Grid } from '../../../types';
import { boundsCenter, latLngToAmapPath, parseGridBounds } from '../../../src/utils/gridAreas';

const AMAP_KEY = import.meta.env.VITE_AMAP_KEY || 'ab3044412b12b8deb9da741c6739be1d';
const AMAP_SECURITY_CODE = import.meta.env.VITE_AMAP_SECURITY_CODE || '65a74edbb64d47769637df170a5da117';
const DEFAULT_CENTER: [number, number] = [109.0238, 34.3185];

interface GridMapProps {
  grids: Grid[];
  onGridClick: (grid: Grid) => void;
}

type ParsedGrid = {
  grid: Grid;
  bounds: [number, number][];
};

const getBoundsSource = (grid: Grid) => {
  const source = grid as Grid & {
    bounds?: unknown;
    boundary?: unknown;
    boundary_json?: unknown;
    boundaryJson?: unknown;
    area_boundary?: unknown;
  };
  return source.bounds_json || source.bounds || source.boundary_json || source.boundaryJson || source.boundary || source.area_boundary;
};

const getGridColor = (status: Grid['status']) => {
  switch (status) {
    case 'warning':
      return '#eab308';
    case 'alarm':
      return '#ef4444';
    case 'normal':
    default:
      return '#22d3ee';
  }
};

const centerDistanceKm = (a: [number, number], b: [number, number]) => {
  const latDistance = (a[0] - b[0]) * 111;
  const lngDistance = (a[1] - b[1]) * 111 * Math.cos((((a[0] + b[0]) / 2) * Math.PI) / 180);
  return Math.sqrt(latDistance * latDistance + lngDistance * lngDistance);
};

const pickInitialFitGrids = (grids: ParsedGrid[]) => {
  if (grids.length <= 1) return grids;
  const groups = new Map<string, ParsedGrid[]>();
  grids.forEach((item) => {
    const key = String(item.grid.project_id || 'unknown');
    groups.set(key, [...(groups.get(key) || []), item]);
  });

  const projectGroup = Array.from(groups.values())
    .filter((group) => group.length > 1)
    .sort((a, b) => b.length - a.length)[0];
  if (projectGroup) return projectGroup;

  const firstCenter = boundsCenter(grids[0].bounds);
  const nearby = grids.filter((item) => centerDistanceKm(firstCenter, boundsCenter(item.bounds)) <= 30);
  return nearby.length ? nearby : [grids[0]];
};

export const GridMap: React.FC<GridMapProps> = ({ grids, onGridClick }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const amapRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);

  const parsedGrids = useMemo(
    () => grids
      .map((grid) => ({ grid, bounds: parseGridBounds(getBoundsSource(grid)) }))
      .filter((item) => item.bounds.length >= 3),
    [grids]
  );

  useEffect(() => {
    let cancelled = false;
    const initMap = async () => {
      if (!mapContainerRef.current || mapRef.current) return;
      try {
        if (!(window as any)._AMapSecurityConfig) {
          (window as any)._AMapSecurityConfig = { securityJsCode: AMAP_SECURITY_CODE };
        }
        const AMap = await AMapLoader.load({ key: AMAP_KEY, version: '2.0' });
        if (cancelled) return;

        amapRef.current = AMap;
        mapRef.current = new AMap.Map(mapContainerRef.current, {
          zoom: 16,
          center: DEFAULT_CENTER,
          viewMode: '2D',
          layers: [
            new AMap.TileLayer.Satellite(),
            new AMap.TileLayer.RoadNet(),
          ],
        });
        setMapReady(true);
      } catch (error) {
        console.error('AMap init failed', error);
      }
    };

    initMap();
    return () => {
      cancelled = true;
      setMapReady(false);
      if (mapRef.current?.destroy) {
        mapRef.current.destroy();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !amapRef.current) return;
    const AMap = amapRef.current;
    const map = mapRef.current;

    if ((map as any)._gridOverlays) {
      (map as any)._gridOverlays.forEach((overlay: any) => map.remove(overlay));
    }
    (map as any)._gridOverlays = [];

    const fitGrids = pickInitialFitGrids(parsedGrids);
    const fitKeys = new Set(fitGrids.map(({ grid }) => String(grid.id || grid.grid_id)));
    const fitOverlays: any[] = [];

    parsedGrids.forEach(({ grid, bounds }) => {
      const color = getGridColor(grid.status);
      const polygon = new AMap.Polygon({
        path: latLngToAmapPath(bounds),
        strokeColor: color,
        strokeOpacity: 0.95,
        strokeWeight: 3,
        fillColor: color,
        fillOpacity: 0.24,
        zIndex: 40,
        bubble: true,
        clickable: true,
      });

      polygon.on('click', () => onGridClick(grid));
      polygon.on('mouseover', () => {
        const center = boundsCenter(bounds);
        const infoWindow = new AMap.InfoWindow({
          content: `
            <div style="padding:8px 12px;min-width:160px;">
              <div style="font-weight:700;margin-bottom:4px;">${grid.name}</div>
              <div style="font-size:12px;color:#64748b;">网格编号：${grid.grid_id || '-'}</div>
              <div style="font-size:12px;color:#64748b;">面积：${grid.area || '-'} m²</div>
            </div>
          `,
          offset: new AMap.Pixel(0, -8),
        });
        infoWindow.open(map, [center[1], center[0]]);
        (map as any)._currentInfoWindow = infoWindow;
      });
      polygon.on('mouseout', () => (map as any)._currentInfoWindow?.close?.());

      map.add(polygon);
      (map as any)._gridOverlays.push(polygon);
      if (fitKeys.has(String(grid.id || grid.grid_id))) fitOverlays.push(polygon);

      const center = boundsCenter(bounds);
      const label = new AMap.Marker({
        position: [center[1], center[0]],
        content: `
          <div style="
            background:rgba(8,145,178,.94);
            color:white;
            font-size:12px;
            font-weight:800;
            padding:4px 10px;
            border-radius:999px;
            border:2px solid rgba(255,255,255,.9);
            box-shadow:0 6px 16px rgba(0,0,0,.35);
            white-space:nowrap;
            pointer-events:none;
          ">${grid.name}</div>
        `,
        offset: new AMap.Pixel(0, -28),
        zIndex: 80,
      });
      map.add(label);
      (map as any)._gridOverlays.push(label);
    });

    if (fitOverlays.length > 0) {
        map.setFitView(fitOverlays, false, [40, 40, 40, 40], 17);
      }
    else {
      map.setZoomAndCenter(16, DEFAULT_CENTER);
    }
  }, [mapReady, onGridClick, parsedGrids]);

  return (
    <div className="overflow-hidden rounded-xl border border-white/20 bg-white/10 backdrop-blur-md">
      <div className="border-b border-white/10 bg-gradient-to-r from-blue-600/20 to-cyan-600/20 px-6 py-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">网格地图</h3>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded" style={{ backgroundColor: '#22d3ee', opacity: 0.8 }} />
              <span className="text-sm text-white/70">网格区域</span>
            </div>
          </div>
        </div>
      </div>

      <div className="h-[calc(100vh-245px)] min-h-[400px]" ref={mapContainerRef} />
    </div>
  );
};
