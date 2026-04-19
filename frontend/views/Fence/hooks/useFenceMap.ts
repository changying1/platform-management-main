// frontend/hooks/useFenceMap.ts
import { useRef, useState, useEffect, useCallback } from "react";
import type React from "react";
import AMapLoader from "@amap/amap-jsapi-loader";
import { FenceData, ProjectRegionData, FenceDevice } from "../types";

const AMAP_KEY = import.meta.env.VITE_AMAP_KEY || "ab3044412b12b8deb9da741c6739be1d";
const AMAP_SECURITY_CODE = import.meta.env.VITE_AMAP_SECURITY_CODE || "65a74edbb64d47769637df170a5da117";

const DEFAULT_CENTER_LNGLAT: [number, number] = [109.13, 34.28];


export const useFenceMap = (containerRef: React.RefObject<HTMLDivElement>) => {
  const mapRef = useRef<any>(null);
  const amapRef = useRef<any>(null);
  const infoWindowRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);
  const overlayRefs = useRef<{
    fences: any[];
    devices: Record<string, any>;
    draft: any[];
  }>({ fences: [], devices: {}, draft: [] });

  const toAmapLngLat = (latlng: [number, number]) => [latlng[1], latlng[0]] as [number, number];

  // 初始化地图
  useEffect(() => {
    let cancelled = false;
    const initMap = async () => {
      if (!containerRef.current || mapRef.current) return;
      try {
        if (!(window as any)._AMapSecurityConfig) {
          (window as any)._AMapSecurityConfig = { securityJsCode: AMAP_SECURITY_CODE };
        }
        const AMap = await AMapLoader.load({ key: AMAP_KEY, version: "2.0" });
        if (cancelled) return;

        amapRef.current = AMap;
mapRef.current = new AMap.Map(containerRef.current, {
  zoom: 17,
  zooms: [10, 20],
  center: DEFAULT_CENTER_LNGLAT,
  viewMode: "2D",
  layers: [
    new AMap.TileLayer.Satellite(), // 卫星图底层
    new AMap.TileLayer.RoadNet()    // 路网+标注图层
  ],
});
        infoWindowRef.current = new AMap.InfoWindow({ offset: new AMap.Pixel(0, -20) });
        setMapReady(true);
              initPlaceSearch();
      } catch (e) {
        console.error("AMap init failed", e);
      }
    };
    initMap();
    return () => {
      cancelled = true;
      if (mapRef.current && mapRef.current.destroy) {
        mapRef.current.destroy();
        mapRef.current = null;
      }
    };
  }, []);

  // 清除指定组的所有覆盖物
  const clearGroup = useCallback((group: keyof typeof overlayRefs.current) => {
    if (!mapRef.current) return;
    if (group === "devices") {
      Object.values(overlayRefs.current.devices).forEach((overlay) => mapRef.current.remove(overlay));
      overlayRefs.current.devices = {};
    } else {
      overlayRefs.current[group].forEach((overlay) => mapRef.current.remove(overlay));
      overlayRefs.current[group] = [];
    }
  }, []);

  // 设置地图中心点
  const setCenter = useCallback((latlng: [number, number]) => {
    if (mapRef.current) mapRef.current.setCenter(toAmapLngLat(latlng));
  }, []);

  // 添加地点搜索
const initPlaceSearch = useCallback(() => {
  if (!mapRef.current || !amapRef.current) return;
  const AMap = amapRef.current;
  
  // 创建自动完成插件
  AMap.plugin(['AMap.AutoComplete', 'AMap.PlaceSearch'], () => {
    const autoOptions = {
      city: '全国',
      input: 'place-search'
    };
    const autoComplete = new AMap.AutoComplete(autoOptions);
    
    autoComplete.on('select', (e: any) => {
      const { location, name } = e.poi;
      if (location) {
        mapRef.current.setCenter([location.lng, location.lat]);
        mapRef.current.setZoom(18);
        
        // 添加标记
        new AMap.Marker({
          position: [location.lng, location.lat],
          map: mapRef.current,
          title: name
        });
      }
    });
  });
}, []);

  // 渲染围栏和区域
const renderFences = useCallback((
  fences: FenceData[],
  regions: ProjectRegionData[],
  selectedFenceId?: string,
  selectedRegionId?: string,
  isDrawingMode?: boolean,
  onRegionClick?: (region: ProjectRegionData) => void,
  getFenceColor?: (severity: string) => string
) => {
    if (!mapRef.current || !amapRef.current) return;
    const AMap = amapRef.current;
    const map = mapRef.current;
    clearGroup("fences");

    // 渲染项目区域
    // regions.forEach((region) => {
    //   const isSelected = selectedRegionId === region.id;
    //   const color = "#a855f7";
    //   const isInteractionActive = onRegionClick === undefined;

    //   const polygon = new AMap.Polygon({
    //     path: region.points.map(toAmapLngLat),
    //     strokeColor: color,
    //     fillColor: color,
    //     fillOpacity: isSelected ? 0.2 : 0.05,
    //     strokeWeight: isSelected ? 3 : 2,
    //     bubble: isDrawingMode === true, 
    //     clickable: !isDrawingMode,  
    //     strokeDasharray: "2,2",
    //     // bubble: isInteractionActive,
    //     // clickable: !isInteractionActive,
    //   });

    //   if (!isInteractionActive && onRegionClick) {
    //     polygon.on("click", (e: any) => {
    //       if (e && e.originEvent) {
    //         if (e.originEvent.stopPropagation) e.originEvent.stopPropagation();
    //         if (e.originEvent.preventDefault) e.originEvent.preventDefault();
    //       }
    //       onRegionClick(region);
    //     });
    //   }
    //   map.add(polygon);
    //   overlayRefs.current.fences.push(polygon);
    // });

    // 渲染电子围栏
    fences.forEach((fence) => {
      const isSelected = selectedFenceId === fence.id;
      const now = new Date();
      const start = new Date(fence.schedule.start);
      const end = new Date(fence.schedule.end);
      const isActive = now >= start && now <= end;
      
      // 根据严重程度设置颜色
let color = getFenceColor ? getFenceColor(fence.severity) : "#3b82f6";
if (!isActive) color = "#64748b";
      const fillOpacity = isSelected ? 0.3 : isActive ? 0.15 : 0.05;
      const isInteractionActive = onRegionClick === undefined;

const commonOptions = {
  strokeColor: color,
  fillColor: color,
  fillOpacity: 0.25,
  strokeWeight: isSelected ? 5 : 4,
  strokeOpacity: 0.95,
  // 🎯 绘制模式下：所有围栏统统穿透！不要点击不要hover！
  bubble: true,
  clickable: !isDrawingMode,
  zIndex: isDrawingMode ? -9999 : 1,  // 绘制时把已存在围栏压在最底层！
};

      if (fence.type === "Circle" && fence.center) {
        const circle = new AMap.Circle({
          ...commonOptions,
          center: toAmapLngLat(fence.center),
          radius: fence.radius || 100,
          strokeDasharray: "5,10",
        });
        
        // 添加鼠标悬停显示信息
        circle.on("mouseover", () => {
          const content = `
            <div style="padding: 8px 12px; min-width: 180px;">
              <div style="font-weight: bold; margin-bottom: 4px;">${fence.name}</div>
              <div style="font-size: 12px; color: #666;">${fence.company} / ${fence.project}</div>
              <div style="font-size: 12px; color: ${isActive ? '#22c55e' : '#f97316'};">${isActive ? '● 生效中' : '○ 预约中'}</div>
              <div style="font-size: 12px;">${fence.behavior === "No Entry" ? "🚫 禁止进入" : "⚠️ 禁止离开"}</div>
              <div style="font-size: 12px;">严重程度: ${fence.severity === "severe" ? "严重" : fence.severity === "risk" ? "风险" : "一般"}</div>
              <div style="font-size: 10px; color: #999;">生效: ${fence.schedule?.start ? fence.schedule.start.slice(0, 16).replace('T', ' ') : '无效'} ~ ${fence.schedule?.end ? fence.schedule.end.slice(0, 16).replace('T', ' ') : '无效'}</div>
            </div>
          `;
          infoWindowRef.current.setContent(content);
          infoWindowRef.current.open(map, circle.getCenter());
        });
        
        circle.on("mouseout", () => {
          infoWindowRef.current.close();
        });
        
        map.add(circle);
        overlayRefs.current.fences.push(circle);
      
            const labelMarker = new AMap.Marker({
      position: toAmapLngLat(fence.center),
      content: `
        <div style="
          background: ${color};
          color: white;
          font-size: 12px;
          font-weight: bold;
          padding: 4px 12px;
          border-radius: 20px;
          border: 2px solid white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          white-space: nowrap;
          pointer-events: none;
        ">
          ${fence.name}
        </div>
      `,
      offset: new AMap.Pixel(0, -30),
    });
    map.add(labelMarker);
    overlayRefs.current.fences.push(labelMarker);
    
  } else if (fence.type === "Polygon" && fence.points) {
    const polygon = new AMap.Polygon({
      ...commonOptions,
      path: fence.points.map(toAmapLngLat),
    });


        // 计算多边形中心点用于显示信息窗口
        const center = fence.points.reduce(
          (acc, p) => [acc[0] + p[0], acc[1] + p[1]],
          [0, 0]
        ).map(c => c / fence.points!.length) as [number, number];
        
        polygon.on("mouseover", () => {
          const content = `
            <div style="padding: 8px 12px; min-width: 180px;">
              <div style="font-weight: bold; margin-bottom: 4px;">${fence.name}</div>
              <div style="font-size: 12px; color: #666;">${fence.company} / ${fence.project}</div>
              <div style="font-size: 12px; color: ${isActive ? '#22c55e' : '#f97316'};">${isActive ? '● 生效中' : '○ 预约中'}</div>
              <div style="font-size: 12px;">${fence.behavior === "No Entry" ? "🚫 禁止进入" : "⚠️ 禁止离开"}</div>
              <div style="font-size: 12px;">严重程度: ${fence.severity === "severe" ? "严重" : fence.severity === "risk" ? "风险" : "一般"}</div>
              <div style="font-size: 10px; color: #999;">生效: ${fence.schedule?.start ? fence.schedule.start.slice(0, 16).replace('T', ' ') : '无效'} ~ ${fence.schedule?.end ? fence.schedule.end.slice(0, 16).replace('T', ' ') : '无效'}</div>
            </div>
          `;
          infoWindowRef.current.setContent(content);
          infoWindowRef.current.open(map, toAmapLngLat(center));
        });
        
        polygon.on("mouseout", () => {
          infoWindowRef.current.close();
        });
        
        map.add(polygon);
        overlayRefs.current.fences.push(polygon);

        
        const labelMarker = new AMap.Marker({
      position: toAmapLngLat(center),
      content: `
        <div style="
          background: ${color};
          color: white;
          font-size: 12px;
          font-weight: bold;
          padding: 4px 12px;
          border-radius: 20px;
          border: 2px solid white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          white-space: nowrap;
          pointer-events: none;
        ">
          ${fence.name}
        </div>
      `,
      offset: new AMap.Pixel(0, -30),
    });
    map.add(labelMarker);
    overlayRefs.current.fences.push(labelMarker);
  }
});
  }, [clearGroup]);

  // 渲染设备标记
  const renderDevices = useCallback((
    devices: FenceDevice[],
    violationTypes: Record<string, "No Entry" | "No Exit" | null>,
    controlledIds: Set<string>,
    debugMode?: boolean,
    onDeviceMove?: (id: string, lat: number, lng: number) => void
  ) => {
    if (!mapRef.current || !amapRef.current) return;
    const map = mapRef.current;
    
    const currentMarkers = overlayRefs.current.devices;
    const newDeviceIds = new Set(devices.map(d => d.device_id));

    // 1. 删除已经不在列表里的设备
    Object.keys(currentMarkers).forEach(id => {
      if (!newDeviceIds.has(id)) {
        map.remove(currentMarkers[id]);
        delete currentMarkers[id];
      }
    });

    devices.forEach((device) => {
      const vType = violationTypes[device.device_id];
      const isControlled = controlledIds.has(device.device_id);
      
      let color = "#22c55e"; 
      if (device.status !== "online") color = "#64748b";
      else if (vType === "No Entry") color = "#ef4444";
      else if (vType === "No Exit") color = "#06b6d4";
      else if (isControlled) color = "#3b82f6";

      const content = `
        <div style="position:relative;cursor:pointer;filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="${color}" stroke="#ffffff" stroke-width="2"/>
          </svg>
          ${vType ? '<div style="position:absolute;top:-8px;right:-8px;width:18px;height:18px;border-radius:50%;background:#ef4444;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:bold;color:#fff;box-shadow:0 0 4px rgba(239,68,68,0.5);">!</div>' : ''}
          ${debugMode ? '<div style="position:absolute;top:-4px;left:-4px;width:12px;height:12px;background:#3b82f6;border:2px solid #fff;border-radius:50%;animation:pulse 2s infinite;"></div>' : ''}
        </div>
      `;

      if (currentMarkers[device.device_id]) {
        // 2. 更新现有设备
        const marker = currentMarkers[device.device_id];
        marker.setContent(content);
        // 核心：调试模式下不要强制 setPosition，否则拖拽会卡顿！
        if (!debugMode) {
          marker.setPosition([device.lng, device.lat]);
        }
        marker.setDraggable(debugMode === true);
        marker.setCursor(debugMode ? 'move' : 'pointer');
      } else {
        // 3. 创建新设备
        const marker = new AMap.Marker({
          position: [device.lng, device.lat],
          draggable: debugMode === true,
          cursor: debugMode ? 'move' : 'pointer',
          content: content,
          offset: new AMap.Pixel(-16, -32),
        });

        if (onDeviceMove) {
          marker.on('dragend', (e: any) => {
            const lnglat = e.target.getPosition();
            onDeviceMove(device.device_id, lnglat.lat, lnglat.lng);
          });
        }

        marker.on('mouseover', () => {
          const infoContent = `
            <div style="padding: 12px; min-width: 200px;">
              <div style="font-weight: bold; font-size: 14px; margin-bottom: 8px; color: #1e293b; border-bottom: 1px solid #f1f5f9; padding-bottom: 4px;">
                ${device.name}
              </div>
              <div style="display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #64748b;">
                <div>持有人: ${device.holder}</div>
                <div>电话: ${device.holderPhone || '--'}</div>
                <div>${device.company} / ${device.project}</div>
                <div>状态: ${device.status === 'online' ? '● 在线' : '○ 离线'}</div>
                ${vType ? `
                  <div style="margin-top: 4px; padding: 4px 8px; background: ${vType === 'No Entry' ? '#fef2f2' : '#ecfeff'}; color: ${vType === 'No Entry' ? '#ef4444' : '#0891b2'}; border-radius: 4px; text-align: center; font-weight: bold;">
                    违规: ${vType === 'No Entry' ? '非法闯入' : '非法越界'}
                  </div>
                ` : ''}
              </div>
            </div>
          `;
          infoWindowRef.current.setContent(infoContent);
          infoWindowRef.current.open(map, marker.getPosition());
        });

        marker.on('mouseout', () => {
          infoWindowRef.current.close();
        });

        map.add(marker);
        currentMarkers[device.device_id] = marker;
      }
    });
  }, [clearGroup]);

  // 渲染绘制草稿 - 支持所有5种工具
  const renderDraft = useCallback((
    activeTool: string,
    points: [number, number][],
    center: [number, number] | null,
    radius: number,
    mouseLngLat?: [number, number] | null
  ) => {
    if (!mapRef.current || !amapRef.current) return;
    const AMap = amapRef.current;
    const map = mapRef.current; 
    clearGroup("draft");

    // =============================================
    // 1. 圆形绘制 - 实时更新半径
    // =============================================
    if (activeTool === 'circle' && center) {
      const centerPos = toAmapLngLat(center);
      const circle = new AMap.Circle({
        center: centerPos,
        radius: radius,
        strokeColor: "#06b6d4",
        fillColor: "#06b6d4",
        fillOpacity: 0.15,
        strokeWeight: 3,
        strokeDasharray: "8,4",
        clickable: false,  // 🔒 绝对不拦截点击！
        bubble: true,
      });
      map.add(circle);
      overlayRefs.current.draft.push(circle);
      
      // 🎯 圆心可视化标记 - 中间一个小白点
      const centerDot = new AMap.Marker({
        position: centerPos,
        content: `<div style="width:8px;height:8px;border-radius:50%;background:#ffffff;border:2px solid #06b6d4;box-shadow:0 0 6px rgba(6,182,212,0.8);"></div>`,
        offset: new AMap.Pixel(-4, -4),
        zIndex: 200,
      });
      map.add(centerDot);
      overlayRefs.current.draft.push(centerDot);
      
      // 🎯 R=XXm 标签移到圆的右边（半径米数转经纬度偏移）
      const labelOffsetLng = radius / 111000;
      const labelPos: [number, number] = [centerPos[0], centerPos[1] + labelOffsetLng];
      const radiusLabel = new AMap.Marker({
        position: labelPos,
        content: `<div style="background:#06b6d4;color:#fff;padding:2px 10px;border-radius:10px;font-size:12px;font-weight:bold;white-space:nowrap;">R = ${Math.round(radius)}m</div>`,
        offset: new AMap.Pixel(5, -10),
        zIndex: 100,
      });
      map.add(radiusLabel);
      overlayRefs.current.draft.push(radiusLabel);
    }

    // =============================================
    // 2. 画笔/套索/方框/多边形 - 都是多边形绘制
    // =============================================
    if (points && points.length > 0) {
      const path = points.map(toAmapLngLat);

      // 🟦 矩形：有2个点或4个点时自动渲染矩形
      if (activeTool === 'rectangle' && path.length >= 2) {
        let p1, p2;
        if (path.length === 2) {
          // 绘制过程中，只有两个对角点
          [p1, p2] = path;
        } else {
          // 绘制完成后，有四个角点，取第一个和第三个作为对角点
          [p1, , p2] = path;
        }
        const rectanglePath = [
          p1,
          [p1[0], p2[1]],
          p2,
          [p2[0], p1[1]],
          p1,
        ];
        
        const rectangle = new AMap.Polygon({
          path: rectanglePath,
          strokeColor: "#06b6d4",
          fillColor: "#06b6d4",
          fillOpacity: 0.15,
          strokeWeight: 3,
          strokeDasharray: "10,5",
          clickable: false,
          bubble: true,
        });
        map.add(rectangle);
        overlayRefs.current.draft.push(rectangle);
      }
      
      // ✏️ 画笔 - 自动闭合！尾端点与首端点连接
      else if (activeTool === 'brush' && path.length >= 2) {
        
        // 🔗 自动闭合：最后一个点连回第一个点！
        const closedPath = [...path, path[0]];
        
        const polyline = new AMap.Polyline({
          path: closedPath,
          strokeColor: "#f59e0b",
          strokeWeight: 4,
          strokeOpacity: 1,
          lineJoin: "round",
          lineCap: "round",
          clickable: false,
          bubble: true,
        });
        map.add(polyline);
        overlayRefs.current.draft.push(polyline);
        
        // 半透明填充
        if (path.length >= 3) {
          const polygon = new AMap.Polygon({
            path: path,
            strokeColor: "transparent",
            fillColor: "#f59e0b",
            fillOpacity: 0.2,
            clickable: false,
            bubble: true,
          });
          map.add(polygon);
          overlayRefs.current.draft.push(polygon);
        }
      }
      
      // ⬡ 多边形 - 只要有1个点就开始显示鼠标跟随线！
      else if (activeTool === 'polygon' && path.length >= 1) {
        
        // --- 第一部分：已确认的顶点之间画实线 ---
        if (path.length >= 2) {
          const confirmedLine = new AMap.Polyline({
            path: path,
            strokeColor: "#06b6d4",
            strokeWeight: 3,
            strokeOpacity: 1,
            lineJoin: "round",
            lineCap: "round",
            clickable: false,
            bubble: true,
          });
          map.add(confirmedLine);
          overlayRefs.current.draft.push(confirmedLine);
        }
        
        // --- 第二部分：最后一个顶点 → 鼠标 画虚线！---
        if (mouseLngLat) {
          const lastPoint = path[path.length - 1];
          const mousePos = [mouseLngLat[1], mouseLngLat[0]];
          
          const previewLine = new AMap.Polyline({
            path: [lastPoint, mousePos],
            strokeColor: "#06b6d4",
            strokeWeight: 2,
            strokeOpacity: 0.6,
            strokeDasharray: "5,5",
            lineJoin: "round",
            lineCap: "round",
            clickable: false,
            bubble: true,
          });
          map.add(previewLine);
          overlayRefs.current.draft.push(previewLine);
        }
        
        // 3个点以上自动填充半透明区域（已确认的部分）
        if (path.length >= 3) {
          const polygon = new AMap.Polygon({
            path: path,
            strokeColor: "transparent",
            fillColor: "#06b6d4",
            fillOpacity: 0.15,
            clickable: false,
            bubble: true,
          });
          map.add(polygon);
          overlayRefs.current.draft.push(polygon);
        }
      }

      // =============================================
      // 顶点标记 - 多边形才显示顶点编号
      // =============================================
      if (activeTool === 'polygon') {
        path.forEach((pos, index) => {
          const marker = new AMap.Marker({
            position: pos,
            content: `<div style="width:16px;height:16px;border-radius:50%;background:#06b6d4;border:3px solid #ffffff;box-shadow:0 0 8px rgba(6,182,212,0.8);"></div>`,
            offset: new AMap.Pixel(-8, -8),
            zIndex: 100,
          });
          map.add(marker);
          overlayRefs.current.draft.push(marker);
          
          const labelMarker = new AMap.Marker({
            position: pos,
            content: `<div style="background:#06b6d4;color:#fff;font-size:11px;font-weight:bold;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;">${index + 1}</div>`,
            offset: new AMap.Pixel(-10, -26),
            zIndex: 99,
          });
          map.add(labelMarker);
          overlayRefs.current.draft.push(labelMarker);
        });
      }


    }
  }, [clearGroup]);

  // 绑定地图点击和鼠标移动事件 - 支持多边形跟随线和矩形拉伸
  const bindDrawEvents = useCallback((callbacks: {
    onClick?: (lat: number, lng: number) => void;
    onMouseMove?: (lat: number, lng: number) => void;
  }) => {
    if (!mapRef.current) return;
    
    const clickHandler = (e: any) => {
      callbacks.onClick?.(e.lnglat.getLat(), e.lnglat.getLng());
    };
    
    const mouseMoveHandler = (e: any) => {
      callbacks.onMouseMove?.(e.lnglat.getLat(), e.lnglat.getLng());
    };
    
    mapRef.current.on('click', clickHandler);
    mapRef.current.on('mousemove', mouseMoveHandler);
    
    return () => {
      mapRef.current?.off('click', clickHandler);
      mapRef.current?.off('mousemove', mouseMoveHandler);
    };
  }, []);

  // 在 bindDrawEvents 函数后面添加
const setMapDraggable = useCallback((draggable: boolean) => {
  if (!mapRef.current) return;
  mapRef.current.setStatus({ dragEnable: draggable });
}, []);

  // 兼容旧接口
  const bindClick = useCallback((callback: (lat: number, lng: number) => void) => {
    if (!mapRef.current) return;
    const handler = (e: any) => {
      callback(e.lnglat.getLat(), e.lnglat.getLng());
    };
    mapRef.current.on('click', handler);
    return () => mapRef.current?.off('click', handler);
  }, []);

  return {
    mapReady,
    mapRef,   
    setCenter,
    renderFences,
    renderDevices,
    renderDraft,
    bindClick,
    bindDrawEvents,
      setMapDraggable  // 👈 添加这一行
  };
};