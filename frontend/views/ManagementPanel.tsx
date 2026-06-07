import React, { useEffect, useState } from 'react';
import {
  Camera,
  ChevronRight,
  FolderTree,
  GitBranch,
  Grid3X3,
  HardDrive,
  MapPin,
  Shield,
  Users,
  UsersRound,
} from 'lucide-react';

import CameraManagement from '../src/components/CameraManagement';
import LocationDeviceManagement from '../src/components/LocationDeviceManagement';
import PermissionManagement from '../src/components/PermissionManagement';
import PersonManagement from '../src/components/PersonManagement';
import GridManagement from './GridManagement';
import ProjectManagement from './Project';
import ResponsibilityManagement from './ResponsibilityManagement';
import TeamManagement from './TeamManagement';

type ManagementTab = 'project' | 'responsibility' | 'grid' | 'team' | 'person' | 'device' | 'camera' | 'location' | 'permission';
type DeviceSubTab = 'camera' | 'location';

interface ManagementPanelProps {
  defaultTab?: ManagementTab;
}

const readPermissions = () => {
  try {
    const auth = JSON.parse(localStorage.getItem('auth') || '{}');
    if (Array.isArray(auth.permissions)) return auth.permissions as string[];
  } catch {
    // Ignore invalid stored auth.
  }
  try {
    return JSON.parse(localStorage.getItem('permissions') || '[]') as string[];
  } catch {
    return [];
  }
};

const canUsePermission = (permissions: string[], code: string) => {
  return permissions.includes(code);
};

const readPermissionLevel = () => {
  const stored = localStorage.getItem('permission_level') || '';
  if (stored) return stored;
  try {
    const auth = JSON.parse(localStorage.getItem('auth') || '{}');
    return auth?.permission_level || '';
  } catch {
    return '';
  }
};

const canUseManagementTab = (level: string, tab: ManagementTab) => {
  const isHq = level === 'headquarters_admin' || !level;
  if (isHq) return true;
  if (tab === 'responsibility') return level === 'branch_admin' || level === 'project_safety_admin';
  if (tab === 'permission') return level === 'branch_admin';
  if (tab === 'project') return level === 'branch_admin';
  if (tab === 'grid') return level === 'branch_admin' || level === 'project_safety_admin';
  if (tab === 'team') return level !== 'team_admin';
  return true;
};

export default function ManagementPanel({ defaultTab = 'responsibility' }: ManagementPanelProps) {
  const normalizeTab = (tab: ManagementTab): ManagementTab => (tab === 'camera' || tab === 'location' ? 'device' : tab);
  const initialDeviceSubTab = (tab: ManagementTab): DeviceSubTab => (tab === 'location' ? 'location' : 'camera');
  const [activeTab, setActiveTab] = useState<ManagementTab>(normalizeTab(defaultTab));
  const [deviceSubTab, setDeviceSubTab] = useState<DeviceSubTab>(initialDeviceSubTab(defaultTab));

  useEffect(() => {
    setActiveTab(normalizeTab(defaultTab));
    if (defaultTab === 'camera' || defaultTab === 'location') {
      setDeviceSubTab(defaultTab);
    }
  }, [defaultTab]);

  const permissions = readPermissions();
  const permissionLevel = readPermissionLevel();
  const permissionByTab: Record<ManagementTab, string> = {
    project: 'personnel.view',
    responsibility: 'personnel.view',
    grid: 'personnel.view',
    team: 'personnel.view',
    person: 'personnel.view',
    device: 'device.view',
    camera: 'device.view',
    location: 'device.view',
    permission: 'system.role',
  };

  const tabs = [
    { id: 'responsibility' as ManagementTab, label: '穿透式责任管理', icon: GitBranch },
    { id: 'project' as ManagementTab, label: '项目管理', icon: FolderTree },
    { id: 'grid' as ManagementTab, label: '网格管理', icon: Grid3X3 },
    { id: 'team' as ManagementTab, label: '工队管理', icon: UsersRound },
    { id: 'person' as ManagementTab, label: '人员管理', icon: Users },
    { id: 'device' as ManagementTab, label: '设备管理', icon: HardDrive },
    { id: 'permission' as ManagementTab, label: '权限管理', icon: Shield },
  ];
  const visibleTabs = tabs.filter(tab =>
    canUsePermission(permissions, permissionByTab[tab.id]) && canUseManagementTab(permissionLevel, tab.id)
  );

  useEffect(() => {
    if (!visibleTabs.find(tab => tab.id === activeTab)) {
      setActiveTab(visibleTabs[0]?.id || 'person');
    }
  }, [activeTab, visibleTabs]);

  const renderContent = () => {
    switch (activeTab) {
      case 'project':
        return <ProjectManagement />;
      case 'responsibility':
        return <ResponsibilityManagement />;
      case 'grid':
        return <GridManagement />;
      case 'team':
        return <TeamManagement />;
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
      case 'permission':
        return <PermissionManagement />;
      default:
        return <PersonManagement />;
    }
  };

  return (
    <div className="h-full flex flex-col gap-4 p-4 text-slate-100 bg-[radial-gradient(circle_at_12%_8%,rgba(56,189,248,0.20),transparent_32%),radial-gradient(circle_at_86%_2%,rgba(59,130,246,0.22),transparent_30%),linear-gradient(135deg,#020617,#0b1f3f_45%,#102a5e)]">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-cyan-500/20 rounded-lg">
            <Shield className="text-cyan-400" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-100">管理中心</h1>
            <p className="text-sm text-slate-400">人员、设备、项目、网格统一管理</p>
          </div>
        </div>

        <div className="flex-1">
          <div className="rounded-lg border border-blue-400/30 bg-slate-900/65 backdrop-blur-md p-2 flex gap-2">
            {visibleTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-3 rounded-md transition-all text-base font-medium ${
                  activeTab === tab.id
                    ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/50'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <tab.icon size={20} />
                {tab.label}
                <ChevronRight size={16} className={activeTab === tab.id ? 'opacity-100' : 'opacity-0'} />
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {renderContent()}
      </div>
    </div>
  );
}
