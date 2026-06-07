import React, { useEffect, useRef } from 'react';
import AMapLoader from '@amap/amap-jsapi-loader';

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

export const ProjectMap: React.FC<ProjectMapProps> = ({ project, height = "100%" }) => {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<any>(null);
    const amapRef = useRef<any>(null);
    const [mapReady, setMapReady] = React.useState(false);

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

        let textPosition = project.center;
        if (project.area_boundary && project.area_boundary.length >= 3) {
            const sum = project.area_boundary.reduce<[number, number]>(
                (acc, point) => [acc[0] + point[0], acc[1] + point[1]],
                [0, 0]
            );
            textPosition = [sum[0] / project.area_boundary.length, sum[1] / project.area_boundary.length];
        }

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

        if (project.area_boundary && project.area_boundary.length >= 3) {
            map.setFitView();
        }
    }, [mapReady, project]);

    return <div ref={mapContainerRef} style={{ width: "100%", height, borderRadius: "8px", overflow: "hidden" }} />;
};
