import React, { useEffect, useRef } from 'react';
import AMapLoader from '@amap/amap-jsapi-loader';
import { API_BASE_URL, getAuthHeaders } from '../api/config';
import { boundsCenter, latLngToAmapPath, toGridAreas, type GridArea } from '../utils/gridAreas';

const AMAP_KEY = import.meta.env.VITE_AMAP_KEY || "ab3044412b12b8deb9da741c6739be1d";
const AMAP_SECURITY_CODE = import.meta.env.VITE_AMAP_SECURITY_CODE || "65a74edbb64d47769637df170a5da117";

type MapDevice = {
    id?: string | number;
    name?: string;
    type?: string;
    device_type?: string;
    lng?: number | string | null;
    lat?: number | string | null;
    is_online?: boolean | number;
    status?: string;
    holder_name?: string;
    holder?: string;
    holder_phone?: string;
    holderPhone?: string;
};

interface ProjectMapProps {
    project: {
        id: number;
        name: string;
        center: [number, number];
        zoom_level: number;
        area_boundary?: Array<[number, number]>;
        devices?: MapDevice[];
        deviceCount?: number;
    };
    height?: string;
    showGridAreas?: boolean;
}

const LOCATION_TYPES = new Set([
    'rtk',
    'uwb',
    'gps_tag',
    'gps_band',
    'smart_helmet',
    'location',
    'gateway',
    'uwb_band',
    'uwb_badge',
    'rtk_band',
    'rtk_badge',
    'wifi',
    'jt808',
]);

const toPoint = (value: unknown): number | null => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
};

const isOnlineLocationDevice = (device: MapDevice) => {
    const deviceType = String(device.type || device.device_type || '').toLowerCase();
    const isOnline =
        device.is_online === 1 ||
        device.is_online === true ||
        String(device.status || '').toLowerCase() === 'online';
    return isOnline && LOCATION_TYPES.has(deviceType);
};

const distanceKm = (a: [number, number], b: [number, number]) => {
    const latDistance = (a[0] - b[0]) * 111;
    const lngDistance = (a[1] - b[1]) * 111 * Math.cos((((a[0] + b[0]) / 2) * Math.PI) / 180);
    return Math.sqrt(latDistance * latDistance + lngDistance * lngDistance);
};

const projectCenterAsLatLng = (center: [number, number]): [number, number] => [Number(center[1]), Number(center[0])];

export const ProjectMap: React.FC<ProjectMapProps> = ({ project, height = "100%", showGridAreas = true }) => {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<any>(null);
    const amapRef = useRef<any>(null);
    const [mapReady, setMapReady] = React.useState(false);
    const [gridAreas, setGridAreas] = React.useState<GridArea[]>([]);

    useEffect(() => {
        let cancelled = false;
        const initMap = async () => {
            if (!mapContainerRef.current || mapRef.current) return;
            try {
                if (!(window as any)._AMapSecurityConfig) {
                    (window as any)._AMapSecurityConfig = { securityJsCode: AMAP_SECURITY_CODE };
                }
                const AMap = await AMapLoader.load({ key: AMAP_KEY, version: "2.0" });
                if (cancelled) return;

                amapRef.current = AMap;
                mapRef.current = new AMap.Map(mapContainerRef.current, {
                    zoom: project.zoom_level || 16,
                    center: project.center,
                    viewMode: "2D",
                    layers: [
                        new AMap.TileLayer.Satellite(),
                        new AMap.TileLayer.RoadNet()
                    ],
                });

                setMapReady(true);
            } catch (e) {
                console.error("AMap init failed", e);
            }
        };
        initMap();
        return () => {
            cancelled = true;
            setMapReady(false);
            if (mapRef.current && mapRef.current.destroy) {
                mapRef.current.destroy();
                mapRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        if (!showGridAreas) {
            setGridAreas([]);
            return;
        }

        let stopped = false;
        const loadGridAreas = async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/api/grids/`, {
                    headers: getAuthHeaders(),
                    credentials: 'include',
                });
                if (!response.ok) return;
                const data = await response.json();
                if (stopped) return;
                const allAreas = toGridAreas(Array.isArray(data) ? data : []);
                const sameProjectAreas = allAreas.filter((area) => String(area.project_id || '') === String(project.id));
                if (sameProjectAreas.length > 0) {
                    setGridAreas(sameProjectAreas);
                    return;
                }

                const projectCenter = projectCenterAsLatLng(project.center);
                setGridAreas(allAreas.filter((area) => distanceKm(projectCenter, boundsCenter(area.bounds)) <= 30));
            } catch (error) {
                console.warn('Failed to load grid areas for project map', error);
                if (!stopped) setGridAreas([]);
            }
        };

        loadGridAreas();
        return () => {
            stopped = true;
        };
    }, [project.id, showGridAreas]);

    useEffect(() => {
        if (!mapReady || !mapRef.current || !amapRef.current) return;

        const AMap = amapRef.current;
        const map = mapRef.current;

        map.setZoomAndCenter(project.zoom_level || 16, project.center);

        if ((map as any)._overlays) {
            (map as any)._overlays.forEach((overlay: any) => map.remove(overlay));
        }
        (map as any)._overlays = [];

        if (project.area_boundary && project.area_boundary.length >= 3) {
            const polygon = new AMap.Polygon({
                path: project.area_boundary,
                strokeColor: "#3b82f6",
                strokeOpacity: 0.8,
                strokeWeight: 3,
                fillColor: "#3b82f6",
                fillOpacity: 0.1,
            });
            map.add(polygon);
            (map as any)._overlays.push(polygon);
        }

        if (showGridAreas) gridAreas.forEach((area) => {
            const color = "#22d3ee";
            const polygon = new AMap.Polygon({
                path: latLngToAmapPath(area.bounds),
                strokeColor: color,
                strokeOpacity: 0.95,
                strokeWeight: 3,
                fillColor: color,
                fillOpacity: 0.22,
                zIndex: 40,
                bubble: true,
                clickable: true,
            });

            polygon.on("mouseover", () => {
                const center = boundsCenter(area.bounds);
                const infoWindow = new AMap.InfoWindow({
                    content: `
                        <div style="padding:8px 12px;min-width:150px;">
                            <div style="font-weight:700;margin-bottom:4px;">${area.name}</div>
                            <div style="font-size:12px;color:#64748b;">网格区域 ${area.grid_id || ""}</div>
                        </div>
                    `,
                    offset: new AMap.Pixel(0, -8),
                });
                infoWindow.open(map, [center[1], center[0]]);
                (map as any)._currentInfoWindow = infoWindow;
            });
            polygon.on("mouseout", () => {
                (map as any)._currentInfoWindow?.close?.();
            });

            map.add(polygon);
            (map as any)._overlays.push(polygon);

            const center = boundsCenter(area.bounds);
            const labelMarker = new AMap.Marker({
                position: [center[1], center[0]],
                content: `
                    <div style="
                        background: rgba(8, 145, 178, 0.92);
                        color: #ffffff;
                        font-size: 12px;
                        font-weight: 800;
                        padding: 4px 10px;
                        border-radius: 999px;
                        border: 2px solid rgba(255,255,255,.9);
                        box-shadow: 0 6px 16px rgba(0,0,0,.35);
                        white-space: nowrap;
                        pointer-events: none;
                    ">
                        ${area.name}
                    </div>
                `,
                offset: new AMap.Pixel(0, -28),
                zIndex: 80,
            });
            map.add(labelMarker);
            (map as any)._overlays.push(labelMarker);
        });

        const textPosition = project.center;

        const verticalText = project.name
            .split('')
            .map(char => `<span style="display: block; text-align: center;">${char}</span>`)
            .join('');

        const nameMarker = new AMap.Marker({
            position: textPosition,
            content: `
                <div style="
                    background: transparent;
                    color: #3b82f6;
                    font-size: 40px;
                    font-weight: 700;
                    font-family: 'PingFang SC', 'Microsoft YaHei', 'STHeiti', system-ui, sans-serif;
                    text-align: center;
                    line-height: 1.3;
                    letter-spacing: 4px;
                    text-shadow: 0 0 25px rgba(59,130,246,0.9), 0 0 10px rgba(0,0,0,0.6);
                    -webkit-font-smoothing: antialiased;
                    white-space: nowrap;
                ">
                    ${verticalText}
                </div>
            `,
            offset: new AMap.Pixel(-20, -project.name.length * 22),
            anchor: 'top-center'
        });
        map.add(nameMarker);
        (map as any)._overlays.push(nameMarker);

        (project.devices || []).filter(isOnlineLocationDevice).forEach(device => {
            const lng = toPoint(device.lng);
            const lat = toPoint(device.lat);
            if (lng === null || lat === null) return;

            const marker = new AMap.Marker({
                position: [lng, lat],
                content: `<div style="width: 14px; height: 14px; background: #22c55e; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.3);"></div>`,
                offset: new AMap.Pixel(-7, -7),
                extData: device
            });

            marker.on('mouseover', () => {
                const holderName = device.holder_name || device.holder || '未绑定';
                const holderPhone = device.holder_phone || device.holderPhone || '';
                const content = `
                    <div style="padding: 8px 12px; min-width: 180px;">
                        <div style="font-weight: bold; margin-bottom: 6px;">${device.name || '定位设备'}</div>
                        <div style="font-size: 12px; color: #666;">持有人: ${holderName}</div>
                        ${holderPhone ? `<div style="font-size: 12px; color: #666;">电话: ${holderPhone}</div>` : ''}
                        <div style="font-size: 12px; color: #22c55e; margin-top: 4px;">在线</div>
                    </div>
                `;
                const infoWindow = new AMap.InfoWindow({
                    content,
                    offset: new AMap.Pixel(0, -10)
                });
                infoWindow.open(map, marker.getPosition());
                (map as any)._currentInfoWindow = infoWindow;
            });

            map.add(marker);
            (map as any)._overlays.push(marker);
        });

        map.setZoomAndCenter(project.zoom_level || 16, project.center);
    }, [gridAreas, mapReady, project, showGridAreas]);

    return <div ref={mapContainerRef} style={{ width: "100%", height, borderRadius: "8px", overflow: "hidden" }} />;
};
