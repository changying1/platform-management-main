import React, { useState, useEffect } from 'react';
import {
  Users,
  Camera,
  MapPin,
  FolderTree,
  // Fence,
  Shield,
  ChevronRight,
  Settings,
  Search,
  Plus,
  Edit2,
  Trash2,
  X,
  Save,
  Loader,
  HardDrive,
} from 'lucide-react';

// 导入各个管理子组件
import PersonManagement from '../src/components/PersonManagement';
import CameraManagement from '../src/components/CameraManagement';
import LocationDeviceManagement from '../src/components/LocationDeviceManagement';
import ProjectManagement from '../src/components/ProjectManagement';
import PermissionManagement from '../src/components/PermissionManagement';
// import FenceManagement from '../src/components/FenceManagement';

// type ManagementTab = 'person' | 'camera' | 'location' | 'project' | 'fence';
type ManagementTab = 'project' | 'person' | 'device' | 'permission';
type DeviceSubTab = 'camera' | 'location';

interface ManagementPanelProps {
  defaultTab?: ManagementTab;
}

export default function ManagementPanel({ defaultTab = 'person' }: ManagementPanelProps) {
  const [activeTab, setActiveTab] = useState<ManagementTab>(defaultTab);
  const [deviceSubTab, setDeviceSubTab] = useState<DeviceSubTab>('camera');

  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  const tabs = [
    { id: 'project' as ManagementTab, label: '项目管理', icon: FolderTree, description: '项目、工队、参建单位' },
    { id: 'person' as ManagementTab, label: '人员管理', icon: Users, description: '人员信息、岗位管理' },
    { id: 'device' as ManagementTab, label: '设备管理', icon: HardDrive, description: '摄像头、定位装置' },
    { id: 'permission' as ManagementTab, label: '权限管理', icon: Shield, description: '角色权限配置' },
    // { id: 'fence' as ManagementTab, label: '电子围栏管理', icon: Fence, description: '围栏配置、报警规则' },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'person':
        return <PersonManagement />;
      case 'device':
        return (
          <div className="h-full flex flex-col">
            <div className="mb-4 flex gap-2 p-1 bg-slate-800/50 rounded-lg w-fit">
              <button
                onClick={() => setDeviceSubTab('camera')}
                className={`px-4 py-2 rounded-md text-sm transition-all ${
                  deviceSubTab === 'camera'
                    ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/50'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Camera size={14} className="inline mr-2" />
                摄像头管理
              </button>
              <button
                onClick={() => setDeviceSubTab('location')}
                className={`px-4 py-2 rounded-md text-sm transition-all ${
                  deviceSubTab === 'location'
                    ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/50'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <MapPin size={14} className="inline mr-2" />
                定位装置管理
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              {deviceSubTab === 'camera' ? <CameraManagement /> : <LocationDeviceManagement />}
            </div>
          </div>
        );
      case 'project':
        return <ProjectManagement />;
      case 'permission':
        return <PermissionManagement />;
        
      // case 'fence':
      //   return <FenceManagement />;
      default:
        return <PersonManagement />;
    }
  };

  return (
    <div className="h-full flex flex-col gap-4 p-4 text-slate-100 bg-[radial-gradient(circle_at_12%_8%,rgba(56,189,248,0.20),transparent_32%),radial-gradient(circle_at_86%_2%,rgba(59,130,246,0.22),transparent_30%),linear-gradient(135deg,#020617,#0b1f3f_45%,#102a5e)]">
      
      {/* 页面标题 */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-cyan-500/20 rounded-lg">
          <Shield className="text-cyan-400" size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-100">管理中心</h1>
          <p className="text-sm text-slate-400">人员、设备、项目、围栏统一管理</p>
        </div>
      </div>

      {/* Tab 切换栏 */}
      <div className="rounded-lg border border-blue-400/30 bg-slate-900/65 backdrop-blur-md p-1 flex gap-1 flex-wrap">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all text-sm ${
              activeTab === tab.id
                ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/50'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <tab.icon size={18} />
            {tab.label}
            <ChevronRight size={14} className={activeTab === tab.id ? 'opacity-100' : 'opacity-0'} />
          </button>
        ))}
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-hidden">
        {renderContent()}
      </div>
    </div>
  );
}