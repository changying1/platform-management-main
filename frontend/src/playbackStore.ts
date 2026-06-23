// frontend/store/playbackStore.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { SavedPlayback } from './playback';

interface PlaybackStore {
  savedPlaybacks: SavedPlayback[];
  
  // 添加回放记录
  addPlayback: (playback: Omit<SavedPlayback, 'id' | 'createdAt'>) => void;
  
  // 删除回放记录
  removePlayback: (id: string) => void;
  
  // 清空所有
  clearAll: () => void;
  
  // 按设备筛选
  getPlaybacksByDevice: (deviceId: number) => SavedPlayback[];
  
  // 按类型筛选
  getPlaybacksByType: (type: 'manual' | 'alarm') => SavedPlayback[];
}

// 生成唯一ID
const generateId = () => `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

export const usePlaybackStore = create<PlaybackStore>()(
  persist(
    (set, get) => ({
      savedPlaybacks: [],
      
      addPlayback: (playback) => {
        const newPlayback: SavedPlayback = {
          ...playback,
          id: generateId(),
          createdAt: new Date().toISOString()
        };
        
        set((state) => ({
          savedPlaybacks: [newPlayback, ...state.savedPlaybacks]
        }));
        
        // 可选：控制台输出，方便调试
        console.log('回放已保存:', newPlayback);
      },
      
      removePlayback: (id) => {
        set((state) => ({
          savedPlaybacks: state.savedPlaybacks.filter(p => p.id !== id)
        }));
      },
      
      clearAll: () => {
        set({ savedPlaybacks: [] });
      },
      
      getPlaybacksByDevice: (deviceId) => {
        return get().savedPlaybacks.filter(p => p.deviceId === deviceId);
      },
      
      getPlaybacksByType: (type) => {
        return get().savedPlaybacks.filter(p => p.type === type);
      }
    }),
    {
      name: 'video-playbacks-storage', // localStorage 存储的 key
    }
  )
);
