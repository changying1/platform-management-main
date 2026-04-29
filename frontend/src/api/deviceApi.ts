import axios from "axios";

import { API_BASE_URL } from "./config";

// 创建 axios 实例
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 5000, // 请求超时时间
  headers: {
    "Content-Type": "application/json",
    // 如果有 token 验证，可以在这里添加 Authorization
    // 'Authorization': `Bearer ${localStorage.getItem('token')}`
  },
});

// 定义接口数据类型（与 types.ts 保持一致或映射）
export interface ApiDevice {
  id: string;
  device_name: string;
  device_type: string;
  ip_address: string;
  port: number;
  is_online: boolean;
  stream_url?: string | null;
  last_latitude?: number | null;
  last_longitude?: number | null;
  owner_id?: number | null;
}

export interface LocationDevice {
  device_id: string;
  name: string;
  lat?: number;
  lng?: number;
  company: string;
  project: string;
  type?: "uwb_band" | "uwb_badge" | "rtk_band" | "rtk_badge" | "wifi" | string;
  team?: string;
  status: "online" | "offline" | "fault" | string;
  holder: string;
  holderPhone?: string;
  remark?: string;
  lastUpdate?: string;
  createdAt?: string;
  updatedAt?: string;
}

// 导出具体的数据库操作接口
export const deviceApi = {
  getLocationDevices: async () => {
    const response = await apiClient.get<LocationDevice[]>("/device/list");
    return response.data;
  },

  addLocationDevice: async (device: LocationDevice) => {
    const response = await apiClient.post<LocationDevice>("/device/add", {
      lat: 0,
      lng: 0,
      ...device,
    });
    return response.data;
  },

  updateLocationDevice: async (deviceId: string, data: Partial<LocationDevice>) => {
    const response = await apiClient.put<LocationDevice>(`/device/update/${deviceId}`, data);
    return response.data;
  },

  deleteLocationDevice: async (deviceId: string) => {
    await apiClient.delete(`/device/delete/${deviceId}`);
    return deviceId;
  },

  // 1. 获取所有设备列表 (对应数据库查询 SELECT * FROM devices)
  getAllDevices: async () => {
    const response = await apiClient.get<ApiDevice[]>("/devices/");
    return response.data;
  },

  // 2. 添加新设备 (对应数据库插入 INSERT INTO devices)
  addDevice: async (device: Partial<ApiDevice>) => {
    const response = await apiClient.post<ApiDevice>("/devices/", device);
    return response.data;
  },

  // 3. 删除设备 (对应数据库删除 DELETE FROM devices WHERE id = ?)
  deleteDevice: async (id: string) => {
    await apiClient.delete(`/devices/${id}`);
    return id;
  },

  // 4. 更新设备状态或信息 (对应数据库更新 UPDATE)
  updateDevice: async (id: string, data: Partial<ApiDevice>) => {
    const response = await apiClient.put<ApiDevice>(`/devices/${id}`, data);
    return response.data;
  },
};
