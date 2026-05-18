import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Bell, 
  Video, 
  MapPin, 
  FileText, 
  Shield, 
  Mail, 
  Database,
  HardDrive,
  Moon,
  Sun,
  Globe,
  Clock,
  Volume2,
  VolumeX,
  Save,
  RotateCcw,
  Eye,
  EyeOff,
  CheckCircle,
  AlertTriangle,
  X,
  Bot,
  Database as DatabaseIcon,
  Search,
  ChevronDown,
  ChevronRight,
  Trash2,
  Building2,
  FolderTree,
  Users,
} from 'lucide-react';

// 设置分类
type SettingsTab = 'alarm' | 'video' | 'fence' | 'log' | 'account' | 'notification' | 'backup' | 'ai';

// 设置数据结构
interface SystemSettings {
  // 通用设置
  systemName: string;
  theme: 'light' | 'dark';
  language: 'zh' | 'en';
  timezone: string;
  tablePageSize: 10 | 20 | 50 | 100;
  autoLogoutMinutes: number;
  confirmBeforeDelete: boolean;
  coordinatePrecision: 4 | 5 | 6;
  
  // 告警设置
  alarmPopup: boolean;
  alarmSound: boolean;
  alarmSoundType: 'none' | 'standard' | 'emergency';
  alarmRepeatInterval: number;
  alarmAutoResolve: boolean;
  alarmRetentionDays: number;
  alarmSevereFlash: boolean;
  alarmSevereUpgrade: 'sound' | 'voice' | 'call' | 'sms';
  
  // 告警分级开关
  alarmSosEnabled: boolean;
  alarmFenceEnabled: boolean;
  alarmLowBatteryEnabled: boolean;
  alarmOfflineEnabled: boolean;
  
  // 告警升级规则
  alarmEscalationEnabled: boolean;
  alarmEscalationMinutes: number;
  
  // AI检测行为告警等级配置
  aiAlarmLevelConfigs: {
    id: string;
    name: string;
    category: string;
    code: string;
    level: 'low' | 'medium' | 'high';
    description: string;
  }[];
  
  // 视频设置
  videoRetentionDays: number;
  videoQuality: 'high' | 'medium' | 'low';
  videoSegmentMinutes: number;
  videoStorageType: 'local' | 'cloud' | 'hybrid';
  videoStoragePath: string;
  alarmVideoRetentionDays: number;
  alarmVideoSurroundMinutes: number;
  alarmScreenshotRetentionDays: number;
  
  // 围栏设置
  fenceDetectionInterval: number;
  fenceDefaultRadius: number;
  fenceRetentionDays: number;
  fenceGracePeriod: number;
  fenceAlarmSilenceMinutes: number;
  fenceDefaultBehavior: 'No Entry' | 'No Exit';
  fenceDefaultSeverity: 'normal' | 'risk' | 'severe';
  trackRetentionDays: number;
  trackSimplifyPrecision: number;
  trackRecordInterval: number;
  stationaryReminderEnabled: boolean;
  stationaryReminderMinutes: number;
  passwordExpireDays: number;
  
  // 日志设置
  logRetentionDays: number;
  logAutoClean: boolean;
  logLevel: 'all' | 'error' | 'warning';
  logOperation: boolean;
  logLogin: boolean;
  logAlarm: boolean;
  logConfig: boolean;
  logAuditEnabled: boolean;
  logDiffEnabled: boolean;
  logExportEncoding: 'utf8' | 'gb2312';
  logLoginFailedAlert: number;
  logErrorReport: boolean;
  logAutoCompress: boolean;
  
  // 通知设置
  smsNotification: boolean;
  callNotification: boolean;
  smsApiUrl: string;
  smsApiKey: string;
  smsSign: string;
  smsTemplateId: string;
  callApiUrl: string;
  callApiKey: string;
  notifySevereBySms: boolean;
  notifySevereByCall: boolean;
  notifyMediumBySms: boolean;
  notifyMediumByCall: boolean;
  notifyLowBySms: boolean;
  notifyLowByCall: boolean;
  notificationRecipients: { name: string; phone: string; level: 'all' | 'severe' | 'medium' | 'low'; enabled: boolean }[];
}

interface PersonNode {
  id: string;
  name: string;
  phone: string;
  company: string;
  project: string;
  team: string;
  employeeId: string;
}

interface OrgNode {
  id: string;
  name: string;
  type: 'company' | 'project' | 'team' | 'person';
  children?: OrgNode[];
  data?: PersonNode;
}

interface SystemSettings {
  // 备份设置
  autoBackup: boolean;
  backupFrequency: 'daily' | 'weekly' | 'monthly';
  backupTime: string;
  backupRetention: number;
  
  // 账号安全
  forceInitialPasswordChange: boolean;
  passwordMinLength: number;
  passwordRequireComplexity: boolean;
  loginAttempts: number;
  lockoutDuration: number;
  maxConcurrentSessions: number;
  
  // 各级管理员默认权限
  hqAdminPermissions: string[];
  branchAdminPermissions: string[];
  projectAdminPermissions: string[];
  teamAdminPermissions: string[];
  
  // AI 助手设置
  aiServiceUrl: string;
  aiEnableRAG: boolean;
  aiKbName: string;
  aiModelName: string;
  aiVectorDbPath: string;
}

const orgTreeData: OrgNode[] = [
  {
    id: 'company-1',
    name: '中铁一局',
    type: 'company',
    children: [
      {
        id: 'project-1',
        name: '西安地铁8号线项目',
        type: 'project',
        children: [
          { id: 'team-1-1', name: '隧道作业一队', type: 'team', children: [
            { id: 'p1', name: '张安全', type: 'person', data: { id: 'p1', name: '张安全', phone: '13800138001', company: '中铁一局', project: '西安地铁8号线项目', team: '隧道作业一队', employeeId: 'TJ001' } },
            { id: 'p2', name: '李建国', type: 'person', data: { id: 'p2', name: '李建国', phone: '13800138002', company: '中铁一局', project: '西安地铁8号线项目', team: '隧道作业一队', employeeId: 'TJ002' } },
          ]},
          { id: 'team-1-2', name: '钢结构作业队', type: 'team', children: [
            { id: 'p3', name: '王文明', type: 'person', data: { id: 'p3', name: '王文明', phone: '13800138003', company: '中铁一局', project: '西安地铁8号线项目', team: '钢结构作业队', employeeId: 'TJ003' } },
          ]},
        ]
      },
      {
        id: 'project-2',
        name: '郑州高铁南站项目',
        type: 'project',
        children: [
          { id: 'team-2-1', name: '土建作业队', type: 'team', children: [
            { id: 'p4', name: '赵工程', type: 'person', data: { id: 'p4', name: '赵工程', phone: '13800138004', company: '中铁一局', project: '郑州高铁南站项目', team: '土建作业队', employeeId: 'TJ004' } },
          ]},
        ]
      },
    ]
  },
  {
    id: 'company-2',
    name: '中铁二局',
    type: 'company',
    children: [
      {
        id: 'project-3',
        name: '成都天府机场项目',
        type: 'project',
        children: [
          { id: 'team-3-1', name: '安装作业队', type: 'team', children: [
            { id: 'p5', name: '钱主管', type: 'person', data: { id: 'p5', name: '钱主管', phone: '13800138005', company: '中铁二局', project: '成都天府机场项目', team: '安装作业队', employeeId: 'TJ005' } },
          ]},
        ]
      },
    ]
  },
];

function flattenPersons(nodes: OrgNode[]): PersonNode[] {
  const persons: PersonNode[] = [];
  function traverse(nodes: OrgNode[]) {
    for (const node of nodes) {
      if (node.type === 'person' && node.data) persons.push(node.data);
      if (node.children) traverse(node.children);
    }
  }
  traverse(nodes);
  return persons;
}

export default function SettingsView() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('video');
  const [showCloudModal, setShowCloudModal] = useState(false);
  const [showLocalModal, setShowLocalModal] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showAddRecipientModal, setShowAddRecipientModal] = useState(false);
  const [recipientSearch, setRecipientSearch] = useState('');
  const [expandedOrgNodes, setExpandedOrgNodes] = useState<Set<string>>(new Set(['company-1', 'company-2']));
  const [selectedPersons, setSelectedPersons] = useState<PersonNode[]>([]);
  const [localConfig, setLocalConfig] = useState({
    path: '',
    name: ''
  });
  const [cloudConfig, setCloudConfig] = useState({
    type: 'oss',
    name: '',
    endpoint: 'oss-cn-beijing.aliyuncs.com',
    bucket: '',
    access_key: '',
    secret_key: '',
    region: ''
  });
  const [storagePaths, setStoragePaths] = useState<any[]>([]);
  const [backupFiles, setBackupFiles] = useState<any[]>([
    { filename: 'full_backup_20250421_143022.tar.gz', date: '2025-04-21 14:30', size: '15.2 MB', type: '完整备份' },
    { filename: 'full_backup_20250420_220000.tar.gz', date: '2025-04-20 22:00', size: '14.8 MB', type: '定时备份' },
    { filename: 'full_backup_20250419_181533.tar.gz', date: '2025-04-19 18:15', size: '13.5 MB', type: '手动备份' },
  ]);
  
  useEffect(() => {
    fetch('/api/backup/storage/paths')
      .then(res => res.json())
      .then(paths => {
        console.log('加载存储路径:', paths);
        setStoragePaths(paths);
      });
    
    fetch('/api/backup/list')
      .then(res => res.json())
      .then(files => {
        console.log('加载备份文件:', files);
        if (files && files.length > 0) {
          setBackupFiles(files);
        }
      });
  }, []);

  const refreshStoragePaths = () => {
    fetch('/api/backup/storage/paths')
      .then(res => res.json())
      .then(paths => {
        console.log('刷新存储路径:', paths);
        setStoragePaths(paths);
      });
  };

  const handleDeleteStoragePath = (index: number) => {
    fetch(`/api/backup/storage/paths/${index}`, { method: 'DELETE' })
      .then(r => r.json())
      .then(r => {
        console.log('删除结果:', r);
        refreshStoragePaths();
      });
  };

  const handleSetPrimary = (index: number) => {
    fetch(`/api/backup/storage/paths/${index}/primary`, { method: 'POST' })
      .then(r => {
        if (!r.ok) throw new Error('切换失败');
        return r.json();
      })
      .then(r => {
        console.log('设置主存储结果:', r);
        refreshStoragePaths();
      })
      .catch(e => {
        console.log('切换主存储失败:', e);
      });
  };
  
  useEffect(() => {
    setTimeout(() => {
      const slider = document.getElementById('alarmVolumeSlider') as HTMLInputElement;
      const valueText = document.getElementById('alarmVolumeValue');
      if (slider && valueText) {
        slider.addEventListener('input', () => {
          (window as any).alarmVolume = Number(slider.value) / 100;
          valueText.textContent = slider.value + '%';
        });
      }
    }, 100);
  }, [activeTab]);

  const [settings, setSettings] = useState<SystemSettings>({
    systemName: '中铁一局智能安全管理系统',
    theme: 'dark',
    language: 'zh',
    timezone: 'Asia/Shanghai',
    tablePageSize: 20,
    autoLogoutMinutes: 30,
    confirmBeforeDelete: true,
    coordinatePrecision: 6,
    alarmPopup: true,
    alarmSound: true,
    alarmSoundType: 'standard',
    alarmRepeatInterval: 5,
    alarmAutoResolve: false,
    alarmRetentionDays: 30,
    alarmSevereFlash: true,
    alarmSevereUpgrade: 'sound',
    alarmSosEnabled: true,
    alarmFenceEnabled: true,
    alarmLowBatteryEnabled: true,
    alarmOfflineEnabled: true,
    alarmEscalationEnabled: true,
    alarmEscalationMinutes: 5,
    videoRetentionDays: 15,
    videoQuality: 'high',
    videoSegmentMinutes: 30,
    videoStorageType: 'local',
    videoStoragePath: './backend/static',
    alarmVideoRetentionDays: 90,
    alarmVideoSurroundMinutes: 1,
    alarmScreenshotRetentionDays: 90,
    fenceDetectionInterval: 3,
    fenceDefaultRadius: 50,
    fenceRetentionDays: 365,
    fenceGracePeriod: 0,
    fenceAlarmSilenceMinutes: 1,
    fenceDefaultBehavior: 'No Entry',
    fenceDefaultSeverity: 'normal',
    trackRetentionDays: 30,
    passwordExpireDays: 90,
    logRetentionDays: 90,
    logAutoClean: true,
    logLevel: 'all',
    smsNotification: false,
    callNotification: false,
    smsApiUrl: 'https://sms.example.com/api',
    smsApiKey: '',
    smsSign: '【安全管理系统】',
    smsTemplateId: 'SMS_123456',
    callApiUrl: 'https://call.example.com/api',
    callApiKey: '',
    notifySevereBySms: true,
    notifySevereByCall: true,
    notifyMediumBySms: false,
    notifyMediumByCall: false,
    notifyLowBySms: false,
    notifyLowByCall: false,
    notificationRecipients: [
      { name: '张安全', phone: '13800138001', level: 'severe', enabled: true },
      { name: '李主管', phone: '13800138002', level: 'all', enabled: true },
      { name: '王经理', phone: '13800138003', level: 'medium', enabled: false },
    ],
    autoBackup: true,
    backupFrequency: 'daily',
    backupTime: '02:00',
    backupRetention: 7,
    forceInitialPasswordChange: true,
        passwordMinLength: 8,
        passwordRequireComplexity: true,
        loginAttempts: 5,
        lockoutDuration: 30,
        maxConcurrentSessions: 3,
        
        // 各级管理员默认权限
        hqAdminPermissions: ['dashboard', 'monitor', 'fence', 'device', 'personnel', 'alarm', 'system'],
        branchAdminPermissions: ['dashboard', 'monitor', 'fence', 'device', 'personnel', 'alarm'],
        projectAdminPermissions: ['dashboard', 'monitor', 'fence', 'device.view', 'personnel.view', 'alarm'],
        teamAdminPermissions: ['dashboard', 'monitor.view', 'personnel.view', 'alarm.view'],

    // AI 助手设置
  aiServiceUrl: '/api/ai',
  aiEnableRAG: true,
  aiKbName: 'default',
  aiModelName: 'DeepSeek-R1-Distill-Qwen-7B-F16',
  aiVectorDbPath: './vector_db',

    // AI检测行为告警等级配置
    aiAlarmLevelConfigs: [
      { id: '1', name: '未佩戴安全帽', category: '安全防护', code: 'helmet_missing', level: 'high', description: '检测人员是否正确佩戴安全帽' },
      { id: '2', name: '未系安全带', category: '安全防护', code: 'safety_harness_missing', level: 'high', description: '高空作业人员安全带佩戴检测' },
      { id: '3', name: '吸烟检测', category: '作业行为', code: 'smoking', level: 'high', description: '禁烟区域吸烟行为检测' },
      { id: '4', name: '人员倒地', category: '人员安全', code: 'person_fall', level: 'high', description: '人员摔倒、倒地异常检测' },
      { id: '5', name: '陌生人员闯入', category: '人员管理', code: 'unauthorized_person', level: 'high', description: '未授权人员进入管控区域' },
      { id: '6', name: '明火检测', category: '消防安全', code: 'fire_detected', level: 'high', description: '明火、烟雾、火焰检测' },
      { id: '7', name: '禁入区无安全帽', category: '区域管理', code: 'no_helmet_area', level: 'medium', description: '危险区域未佩戴安全帽' },
      { id: '8', name: '人员聚集', category: '人员管理', code: 'crowd_detection', level: 'medium', description: '人员过度聚集检测' },
      { id: '9', name: '反光衣缺失', category: '安全防护', code: 'reflective_vest_missing', level: 'high', description: '施工现场反光衣佩戴检测' },
      { id: '10', name: '电气焊作业', category: '动火作业', code: 'welding_detection', level: 'high', description: '违规电气焊作业检测' },
      { id: '11', name: '洞口防护缺失', category: '临边防护', code: 'hole_protection', level: 'high', description: '洞口、临边防护设施缺失' },
      { id: '12', name: '起重半径违规', category: '起重作业', code: 'lifting_radius', level: 'high', description: '人员进入起重作业危险半径' },
      { id: '13', name: '动火监护缺失', category: '动火作业', code: 'hotwork_supervisor', level: 'high', description: '动火作业无现场监护' },
      { id: '14', name: '特种设备操作', category: '设备安全', code: 'special_equipment', level: 'high', description: '无证操作特种设备' },
      { id: '15', name: '安全帽颜色合规', category: '安全防护', code: 'helmet_color', level: 'low', description: '不同岗位安全帽颜色规范检查' },
    ],
  });
  
  const [saved, setSaved] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordData, setPasswordData] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [algoSearchKeyword, setAlgoSearchKeyword] = useState('');
  const [algoCategoryFilter, setAlgoCategoryFilter] = useState('');
  const [algoLevelFilter, setAlgoLevelFilter] = useState('');
  const [newKbName, setNewKbName] = useState('');
  const [kbDocuments, setKbDocuments] = useState<any[]>([]);
  const [kbTotalSize, setKbTotalSize] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [showKbManager, setShowKbManager] = useState(false);
  const [showKbCreator, setShowKbCreator] = useState(false);
  const [kbList, setKbList] = useState(['default']);
  const [selectedKb, setSelectedKb] = useState('default');

  // 初始化时从后端加载设置和知识库文档
  useEffect(() => {
    fetch('/admin/settings')
      .then(res => res.json())
      .then(config => {
        if (config && Object.keys(config).length > 0) {
          setSettings(prev => ({ 
            ...prev, 
            ...config,
            aiAlarmLevelConfigs: config.aiAlarmLevelConfigs || prev.aiAlarmLevelConfigs,
          }));
        }
      })
      .catch(() => {
        console.log('使用本地默认设置');
      });

    loadKbDocuments();
  }, []);

  const loadKbDocuments = () => {
    fetch('/api/ai/kb/documents')
      .then(res => res.json())
      .then(data => {
        if (data.status === 'success') {
          setKbDocuments(data.documents || []);
          setKbTotalSize(data.total_size_mb || 0);
        }
      })
      .catch(() => {
        console.log('加载知识库文档失败，使用演示数据');
      });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    let successCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const formData = new FormData();
      formData.append('file', file);

      try {
        const res = await fetch('/api/ai/kb/upload', {
          method: 'POST',
          body: formData,
        });
        
        if (res.ok) {
          successCount++;
        }
      } catch (err) {
        console.error('上传失败:', err);
      }
    }

    setUploading(false);
    if (successCount > 0) {
      alert(`成功上传 ${successCount} 个文件！`);
      loadKbDocuments();
    } else {
      alert('上传失败，请检查 LLM 服务是否启动');
    }

    e.target.value = '';
  };

  const handleDeleteDocument = async (filename: string) => {
    if (!confirm(`确定要删除「${filename}」吗？`)) return;

    try {
      const res = await fetch(`/api/ai/kb/documents/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
      });
      
      if (res.ok) {
        alert('删除成功！');
        loadKbDocuments();
      } else {
        alert('删除失败');
      }
    } catch (err) {
      alert('删除失败，请检查 LLM 服务是否启动');
    }
  };

  const handleSave = async () => {
    // 同时保存到 localStorage 和后端
    localStorage.setItem('systemSettings', JSON.stringify(settings));
    
    try {
      await fetch('/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

    } catch (e) {
      console.log('后端设置保存失败，已保存到本地');
    }
    
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    console.log('设置已保存:', settings);
  };

  const handleReset = () => {
    if (confirm('确定要恢复默认设置吗？所有修改将丢失。')) {
      // 恢复默认设置
      const defaultSettings: SystemSettings = {
        systemName: '中铁一局智能安全管理系统',
        theme: 'dark',
        language: 'zh',
        timezone: 'Asia/Shanghai',
        alarmPopup: true,
        alarmSound: true,
        alarmSoundType: 'standard',
        alarmRepeatInterval: 5,
        alarmAutoResolve: false,
        alarmRetentionDays: 30,
        alarmSevereFlash: false,
        alarmSevereUpgrade: 'sound',
        aiAlarmLevelConfigs: [
          { id: '1', name: '未佩戴安全帽', category: '安全防护', code: 'helmet_missing', level: 'high', description: '检测人员是否正确佩戴安全帽' },
          { id: '2', name: '未系安全带', category: '安全防护', code: 'safety_harness_missing', level: 'high', description: '高空作业人员安全带佩戴检测' },
          { id: '3', name: '吸烟检测', category: '作业行为', code: 'smoking', level: 'high', description: '禁烟区域吸烟行为检测' },
          { id: '4', name: '人员倒地', category: '人员安全', code: 'person_fall', level: 'high', description: '人员摔倒、倒地异常检测' },
          { id: '5', name: '陌生人员闯入', category: '人员管理', code: 'unauthorized_person', level: 'high', description: '未授权人员进入管控区域' },
          { id: '6', name: '明火检测', category: '消防安全', code: 'fire_detected', level: 'high', description: '明火、烟雾、火焰检测' },
          { id: '7', name: '禁入区无安全帽', category: '区域管理', code: 'no_helmet_area', level: 'medium', description: '危险区域未佩戴安全帽' },
          { id: '8', name: '人员聚集', category: '人员管理', code: 'crowd_detection', level: 'medium', description: '人员过度聚集检测' },
          { id: '9', name: '反光衣缺失', category: '安全防护', code: 'reflective_vest_missing', level: 'high', description: '施工现场反光衣佩戴检测' },
          { id: '10', name: '电气焊作业', category: '动火作业', code: 'welding_detection', level: 'high', description: '违规电气焊作业检测' },
          { id: '11', name: '洞口防护缺失', category: '临边防护', code: 'hole_protection', level: 'high', description: '洞口、临边防护设施缺失' },
          { id: '12', name: '起重半径违规', category: '起重作业', code: 'lifting_radius', level: 'high', description: '人员进入起重作业危险半径' },
          { id: '13', name: '动火监护缺失', category: '动火作业', code: 'hotwork_supervisor', level: 'high', description: '动火作业无现场监护' },
          { id: '14', name: '特种设备操作', category: '设备安全', code: 'special_equipment', level: 'high', description: '无证操作特种设备' },
          { id: '15', name: '安全帽颜色合规', category: '安全防护', code: 'helmet_color', level: 'low', description: '不同岗位安全帽颜色规范检查' },
        ],
        videoRetentionDays: 15,
        videoQuality: 'high',
        videoSegmentMinutes: 30,
        videoStorageType: 'local',
        videoStoragePath: './backend/static',
        alarmVideoRetentionDays: 90,
        alarmVideoSurroundMinutes: 1,
        alarmScreenshotRetentionDays: 90,
        fenceDetectionInterval: 3,
        fenceDefaultRadius: 50,
        fenceRetentionDays: 365,
        fenceGracePeriod: 3,
        fenceAlarmSilenceMinutes: 5,
        fenceDefaultBehavior: 'No Entry',
        fenceDefaultSeverity: 'risk',
        trackRetentionDays: 30,
        trackSimplifyPrecision: 2,
        trackRecordInterval: 5,
        stationaryReminderEnabled: true,
        stationaryReminderMinutes: 30,
        logRetentionDays: 90,
        logAutoClean: true,
        logLevel: 'all',
        logOperation: true,
        logLogin: true,
        logAlarm: true,
        logConfig: true,
        logAuditEnabled: true,
        logDiffEnabled: true,
        logExportEncoding: 'utf8',
        logLoginFailedAlert: 5,
        logErrorReport: true,
        logAutoCompress: true,
        emailNotification: false,
        smsNotification: false,
        emailServer: 'smtp.example.com',
        emailPort: 587,
        autoBackup: true,
        backupFrequency: 'daily',
        backupTime: '02:00',
        backupRetention: 7,
        
        // AI 助手设置
        aiServiceUrl: '/api/ai',
        aiEnableRAG: true,
        aiKbName: 'default',
        aiModelName: 'DeepSeek-R1-Distill-Qwen-7B-F16',
        aiVectorDbPath: './vector_db',
      };
      setSettings(defaultSettings);
    }
  };

  const validatePassword = (password: string): { valid: boolean; message?: string } => {
    if (password.length < settings.passwordMinLength) {
      return { valid: false, message: `密码长度至少${settings.passwordMinLength}位` };
    }
    if (settings.passwordRequireComplexity) {
      const hasUpperCase = /[A-Z]/.test(password);
      const hasLowerCase = /[a-z]/.test(password);
      const hasNumber = /[0-9]/.test(password);
      if (!hasUpperCase || !hasLowerCase || !hasNumber) {
        return { valid: false, message: '密码必须同时包含大写字母、小写字母和数字' };
      }
    }
    return { valid: true };
  };

  const handleChangePassword = () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      alert('两次输入的新密码不一致');
      return;
    }
    const validation = validatePassword(passwordData.newPassword);
    if (!validation.valid) {
      alert(validation.message);
      return;
    }
    console.log('修改密码:', passwordData);
    setShowPasswordModal(false);
    setPasswordData({ oldPassword: '', newPassword: '', confirmPassword: '' });
    alert('密码修改成功！');
  };

  const tabs = [
    { key: 'video', label: '视频设置', icon: Video },
    { key: 'fence', label: '围栏及定位设置', icon: MapPin },
    { key: 'alarm', label: '告警设置', icon: Bell },
    { key: 'ai', label: 'AI 助手设置', icon: Bot },
    { key: 'log', label: '日志设置', icon: FileText },
    { key: 'account', label: '账号安全', icon: Shield },
    { key: 'notification', label: '通知设置', icon: Mail },
    { key: 'backup', label: '数据备份', icon: Database },
  ];

  return (
    <div className="h-full overflow-auto p-6">
      <div className="flex gap-6">
        {/* 左侧 w-56：标题 + 导航 */}
        <div className="w-56 shrink-0">
          {/* 大标题 */}
          <div className="mb-4">
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <Settings size={28} className="text-cyan-400" />
              系统设置
            </h1>
            <p className="text-slate-400 text-sm mt-1">配置系统各项参数</p>
          </div>

          {/* 导航菜单 */}
          <div className="space-y-1">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as SettingsTab)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all ${
                activeTab === tab.key
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/50'
                  : 'text-white hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
            
            <div className="h-px bg-slate-700/50 my-6"></div>
            
            <div className="space-y-2 px-1">
              <button
                onClick={() => setShowResetConfirm(true)}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm transition-all bg-slate-700/50 hover:bg-slate-700 text-slate-300 border border-slate-600/50"
              >
                <RotateCcw size={14} />
                恢复默认
              </button>
              <button
                onClick={handleSave}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white shadow-lg shadow-cyan-500/20"
              >
                <Save size={14} />
                保存设置
              </button>
            </div>
          </div>
        </div>

        {/* 右侧内容 */}
        <div className="flex-1 bg-slate-900/50 backdrop-blur-sm rounded-xl border border-cyan-400/30 p-6">
          {/* AI 助手设置 */}
          {activeTab === 'ai' && (
            <div className="space-y-4">
              <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/50 mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <Bot size={16} className="text-cyan-400" />
                  <h3 className="text-sm font-semibold text-white">大语言模型服务配置</h3>
                </div>
                
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">模型名称</label>
                    <select
                      value={settings.aiModelName}
                      onChange={(e) => setSettings({ ...settings, aiModelName: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-400/50"
                    >
                      <option value="DeepSeek-R1-Distill-Qwen-7B-F16">DeepSeek-R1-Distill-Qwen-7B-F16</option>
                    </select>
                  </div>
                </div>
              </div>
              
              <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/50 mb-4">
                <div className="flex items-center gap-2 mb-4">
                  <DatabaseIcon size={16} className="text-emerald-400" />
                  <h3 className="text-sm font-semibold text-white">知识库 (RAG) 配置</h3>
                </div>
                
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-white">启用检索增强</span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={settings.aiEnableRAG}
                          onChange={(e) => setSettings({ ...settings, aiEnableRAG: e.target.checked })}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-cyan-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
                      </label>
                    </div>
                    
                    <div className="flex-1 max-w-xs">
                      <label className="block text-xs text-slate-400 mb-1">当前知识库</label>
                      <select
                        value={settings.aiKbName}
                        onChange={(e) => setSettings({ ...settings, aiKbName: e.target.value })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-400/50"
                      >
                        {kbList.map(kb => (
                          <option key={kb} value={kb}>{kb} {kb === 'default' ? '(默认知识库)' : ''}</option>
                        ))}
                      </select>
                    </div>
                    
                    <button
                      onClick={() => setShowKbManager(true)}
                      className="px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 text-sm rounded-lg transition-colors border border-cyan-500/30"
                    >
                      知识库管理
                    </button>
                    
                    <button
                      onClick={() => setShowKbCreator(true)}
                      className="px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-sm rounded-lg transition-colors border border-emerald-500/30"
                    >
                      新建知识库
                    </button>
                  </div>
                  
                  <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <HardDrive size={14} className="text-cyan-400" />
                      <h4 className="text-xs font-semibold text-white">AI 数据存储结构</h4>
                    </div>
                    <div className="font-mono text-xs text-slate-400 space-y-0.5">
                      <div className="text-emerald-400">📂 LargeLanguageModel/</div>
                      <div className="ml-4">├─ 📂 <span className="text-cyan-400">Documents/</span>          <span className="text-slate-500"># 上传的源文档</span></div>
                      <div className="ml-4">│  ├─ 📄 安全管理制度.pdf</div>
                      <div className="ml-4">│  └─ 📄 ...</div>
                      <div className="ml-4">├─ 📂 <span className="text-violet-400">vector_db/</span>          <span className="text-slate-500"># 向量数据库</span></div>
                      <div className="ml-4">│  ├─ 📂 default/</div>
                      <div className="ml-4">│  └─ 📂 {settings.aiKbName}/</div>
                      <div className="ml-4">└─ 📂 <span className="text-amber-400">BAAIbge-large-zh-v1.5/</span>  <span className="text-slate-500"># 嵌入模型</span></div>
                    </div>
                  </div>
                </div>
              </div>
              
              {showKbManager && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
                  <div className="bg-slate-900 rounded-xl border border-slate-700 w-full max-w-4xl mx-4 overflow-hidden">
                    <div className="flex items-center justify-between p-4 border-b border-slate-700">
                      <h3 className="text-sm font-semibold text-white">知识库管理</h3>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-400">嵌入模型：<span className="text-emerald-400">bge-large-zh-v1.5</span></span>
                        <button onClick={() => setShowKbManager(false)} className="text-slate-400 hover:text-white">
                          <X size={18} />
                        </button>
                      </div>
                    </div>
                    
                    <div className="flex">
                      <div className="w-56 border-r border-slate-700 bg-slate-800/30">
                        <div className="p-3 border-b border-slate-700">
                          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">知识库列表</div>
                        </div>
                        <div className="p-2 space-y-1 max-h-[400px] overflow-y-auto">
                          {kbList.map((kb) => (
                            <div key={kb} className={`group relative`}>
                              <button
                                onClick={() => setSelectedKb(kb)}
                                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between ${
                                  selectedKb === kb 
                                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' 
                                    : 'text-slate-300 hover:bg-slate-700/50 border border-transparent'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <DatabaseIcon size={14} />
                                  <span className="font-mono truncate max-w-[120px]">{kb}</span>
                                </div>
                                {kb === settings.aiKbName && (
                                  <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded">使用中</span>
                                )}
                              </button>
                              {kb !== 'default' && (
                                <button
                                  onClick={() => {
                                    if (confirm(`确定要删除知识库「${kb}」吗？`)) {
                                      setKbList(kbList.filter(k => k !== kb));
                                      if (selectedKb === kb) setSelectedKb('default');
                                    }
                                  }}
                                  className="absolute right-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-opacity"
                                >
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                        <div className="p-3 border-t border-slate-700">
                          <button
                            onClick={() => {
                              setShowKbManager(false);
                              setShowKbCreator(true);
                            }}
                            className="w-full py-2 text-sm text-cyan-400 hover:bg-cyan-500/10 rounded-lg transition-colors border border-dashed border-cyan-500/30"
                          >
                            + 新建知识库
                          </button>
                        </div>
                      </div>
                      
                      <div className="flex-1 p-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-sm text-white">文档管理 · </span>
                            <span className="text-sm text-cyan-400 font-mono">{selectedKb}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {selectedKb !== settings.aiKbName && (
                              <button
                                onClick={() => {
                                  setSettings({ ...settings, aiKbName: selectedKb });
                                }}
                                className="px-3 py-1.5 text-xs bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 rounded-lg transition-colors border border-emerald-500/30"
                              >
                                设为当前使用
                              </button>
                            )}
                            <label className={`text-sm transition-colors cursor-pointer px-3 py-1.5 rounded-lg ${uploading ? 'bg-slate-700 text-slate-400' : 'bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 border border-cyan-500/30'}`}>
                              <input
                                type="file"
                                className="hidden"
                                accept=".pdf,.txt,.docx,.md"
                                multiple
                                disabled={uploading}
                                onChange={handleFileUpload}
                              />
                              {uploading ? '上传中...' : '+ 添加文档'}
                            </label>
                          </div>
                        </div>
                        
                        <div className="bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden">
                          <div className="p-3 border-b border-slate-700/50 text-xs text-slate-400 bg-slate-800">
                            支持格式：PDF、TXT、DOCX、MD | 最大 50MB/文件
                          </div>
                          <div className="max-h-[280px] overflow-y-auto">
                            {kbDocuments.length === 0 ? (
                              <div className="text-xs text-slate-500 text-center py-12">
                                暂无文档，点击右上角「添加文档」上传
                              </div>
                            ) : (
                              kbDocuments.map((doc, idx) => {
                                const colors = ['text-cyan-400', 'text-emerald-400', 'text-amber-400', 'text-rose-400', 'text-violet-400'];
                                return (
                                  <div key={idx} className="flex items-center justify-between p-3 hover:bg-slate-700/30 transition-colors border-b border-slate-700/30 last:border-b-0">
                                    <div className="flex items-center gap-3">
                                      <FileText size={16} className={colors[idx % colors.length]} />
                                      <div>
                                        <div className="text-sm text-white">{doc.name}</div>
                                        <div className="text-xs text-slate-500">{doc.size_mb}MB · {doc.upload_time}</div>
                                      </div>
                                    </div>
                                    <button 
                                      onClick={() => handleDeleteDocument(doc.name)}
                                      className="px-2 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
                                    >
                                      删除
                                    </button>
                                  </div>
                                );
                              })
                            )}
                          </div>
                          <div className="p-3 text-xs text-slate-500 text-center border-t border-slate-700/50 bg-slate-800">
                            「{selectedKb}」共 {kbDocuments.length} 个文档，总计 {kbTotalSize}MB
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex justify-end p-4 border-t border-slate-700 bg-slate-800/30">
                      <button
                        onClick={() => setShowKbManager(false)}
                        className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition-colors"
                      >
                        关闭
                      </button>
                    </div>
                  </div>
                </div>
              )}
              
              {showKbCreator && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
                  <div className="bg-slate-900 rounded-xl border border-slate-700 w-full max-w-lg mx-4 overflow-hidden">
                    <div className="flex items-center justify-between p-4 border-b border-slate-700">
                      <h3 className="text-sm font-semibold text-white">创建新知识库</h3>
                      <button onClick={() => setShowKbCreator(false)} className="text-slate-400 hover:text-white">
                        <X size={18} />
                      </button>
                    </div>
                    
                    <div className="p-6 space-y-5">
                      <div>
                        <label className="block text-sm text-slate-300 mb-2">知识库名称</label>
                        <input
                          type="text"
                          placeholder="输入知识库名称，如：安全制度库"
                          value={newKbName}
                          onChange={(e) => setNewKbName(e.target.value)}
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-cyan-400/50"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm text-slate-300 mb-2">文本嵌入模型</label>
                        <select className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-sm text-white outline-none focus:border-cyan-400/50 cursor-pointer">
                          <option>BAAI/bge-large-zh-v1.5</option>
                        </select>
                        <p className="text-xs text-slate-500 mt-2">针对中文知识库检索优化，后续将支持更多嵌入模型</p>
                      </div>
                      
                      <div>
                        <label className="block text-sm text-slate-300 mb-2">上传初始文档（可选）</label>
                        <label className="block w-full border-2 border-dashed border-slate-600 rounded-lg p-8 text-center cursor-pointer hover:border-cyan-400/50 transition-colors">
                          <input type="file" className="hidden" accept=".pdf,.txt,.docx,.md" multiple />
                          <div className="text-4xl mb-2">📄</div>
                          <div className="text-sm text-slate-300">点击或拖拽文件到此处</div>
                          <div className="text-xs text-slate-500 mt-1">支持 PDF、TXT、DOCX、MD 格式</div>
                        </label>
                      </div>
                    </div>
                    
                    <div className="flex justify-end gap-3 p-4 border-t border-slate-700 bg-slate-800/30">
                      <button
                        onClick={() => setShowKbCreator(false)}
                        className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition-colors"
                      >
                        取消
                      </button>
                      <button
                        onClick={async () => {
                          if (!newKbName.trim()) {
                            alert('请输入知识库名称');
                            return;
                          }
                          try {
                            const res = await fetch(`/api/ai/kb/create?kb_name=${encodeURIComponent(newKbName.trim())}`, { method: 'POST' });
                            if (res.ok) {
                              const kbName = newKbName.trim();
                              setKbList([...kbList, kbName]);
                              setSelectedKb(kbName);
                              setSettings({ ...settings, aiKbName: kbName });
                              alert(`知识库「${kbName}」创建成功！`);
                              setNewKbName('');
                              setShowKbCreator(false);
                              setShowKbManager(true);
                            } else {
                              const data = await res.json();
                              alert(data.detail || '创建失败');
                            }
                          } catch (err) {
                            alert('创建失败，请检查 LLM 服务是否启动');
                          }
                        }}
                        className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white text-sm rounded-lg transition-colors"
                      >
                        创建知识库
                      </button>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="bg-cyan-500/10 rounded-lg p-4 border border-cyan-400/30">
                <h4 className="text-sm font-semibold text-cyan-300 mb-2">使用说明</h4>
                <ul className="text-xs text-slate-300 space-y-1">
                  <li>• 启动后端 LLM 服务：进入 backend/LargeLanguageModel 目录运行 python main.py</li>
                  <li>• 确保 Ollama 服务已启动并已下载对应的模型</li>
                  <li>• 知识库向量库会自动生成在 vector_db 目录下</li>
                  <li>• 修改配置后点击"保存设置"按钮生效</li>
                </ul>
              </div>
            </div>
          )}

          {/* 视频设置 */}
          {activeTab === 'video' && (
            <div className="space-y-4">
              {/* 录像保存设置 */}
              <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/50 mb-4">
                <h3 className="text-sm font-semibold text-white mb-2">录像保存设置</h3>
                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">常规录像保存天数</label>
                    <input
                      type="number"
                      value={settings.videoRetentionDays}
                      onChange={(e) => setSettings({ ...settings, videoRetentionDays: Number(e.target.value) })}
                      min={1}
                      max={90}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200"
                    />
                    <p className="text-xs text-slate-500 mt-0.5">超过此天数的常规录像将被自动清理</p>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">录像质量</label>
                    <select
                      value={settings.videoQuality}
                      onChange={(e) => setSettings({ ...settings, videoQuality: e.target.value as 'high' | 'medium' | 'low' })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200"
                    >
                      <option value="high">高清 (H.264, 4Mbps)</option>
                      <option value="medium">标清 (H.264, 2Mbps)</option>
                      <option value="low">流畅 (H.265, 1Mbps)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">常规录像分段时长(分钟)</label>
                    <input
                      type="number"
                      value={settings.videoSegmentMinutes}
                      onChange={(e) => setSettings({ ...settings, videoSegmentMinutes: Number(e.target.value) })}
                      min={5}
                      max={60}
                      step={5}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200"
                    />
                    <p className="text-xs text-slate-500 mt-0.5">当前后端配置: 0.5分钟(30秒)/段</p>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">存储方式</label>
                    <select
                      value={settings.videoStorageType}
                      onChange={(e) => setSettings({ ...settings, videoStorageType: e.target.value as 'local' | 'cloud' | 'hybrid' })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200"
                    >
                      <option value="local">本地存储</option>
                      <option value="cloud">云存储</option>
                      <option value="hybrid">混合存储</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">告警录像保存天数</label>
                    <input
                      type="number"
                      value={settings.alarmVideoRetentionDays || 90}
                      onChange={(e) => setSettings({ ...settings, alarmVideoRetentionDays: Number(e.target.value) })}
                      min={7}
                      max={365}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">告警时刻前后录制时长(分钟)</label>
                    <input
                      type="number"
                      value={settings.alarmVideoSurroundMinutes || 1}
                      onChange={(e) => setSettings({ ...settings, alarmVideoSurroundMinutes: Number(e.target.value) })}
                      min={0.5}
                      max={10}
                      step={0.5}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200"
                    />
                    <p className="text-xs text-slate-500 mt-0.5">告警发生前后各录制此时长</p>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">告警截图保存天数</label>
                    <input
                      type="number"
                      value={settings.alarmScreenshotRetentionDays || 90}
                      onChange={(e) => setSettings({ ...settings, alarmScreenshotRetentionDays: Number(e.target.value) })}
                      min={7}
                      max={365}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200"
                    />
                  </div>
                </div>
              </div>

              {/* 视频保存路径说明 */}
              <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/50">
                <div className="flex items-center gap-2 mb-3">
                  <HardDrive size={16} className="text-cyan-400" />
                  <h3 className="text-sm font-semibold text-white">视频保存路径</h3>
                </div>
                
                <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-3 mb-3">
                  <div className="text-sm text-cyan-300 flex items-center gap-2">
                    <Database size={16} />
                    <span>视频存储路径已与「数据备份」中的「当前主存储」路径绑定</span>
                  </div>
                </div>
                
                {/* 子文件夹说明 */}
                <div className="bg-slate-900/50 rounded-lg p-3 space-y-2">
                  <div className="text-xs text-slate-300 font-medium mb-1">文件存储结构：</div>
                  <div className="space-y-1.5 text-xs font-mono">
                    <div className="flex items-start gap-2">
                      <span className="text-cyan-400 shrink-0">├──</span>
                      <div>
                        <span className="text-cyan-300">[当前主存储路径]</span>
                        <span className="text-slate-500 ml-1">(根目录)</span>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-cyan-400 shrink-0">│   ├──</span>
                      <div>
                        <span className="text-yellow-300">recordings/</span>
                        <span className="text-slate-400 ml-1">- 常规录像分段</span>
                        <div className="text-slate-500 ml-4">每30秒一段，按设备ID分文件夹存储</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-cyan-400 shrink-0">│   ├──</span>
                      <div>
                        <span className="text-red-300">alarm_videos/</span>
                        <span className="text-slate-400 ml-1">- 告警视频</span>
                        <div className="text-slate-500 ml-4">AI检测到异常时自动保存的片段</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-cyan-400 shrink-0">│   ├──</span>
                      <div>
                        <span className="text-purple-300">playback_videos/</span>
                        <span className="text-slate-400 ml-1">- 常态化回放</span>
                        <div className="text-slate-500 ml-4">按3小时窗口合并的归档视频</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-cyan-400 shrink-0">│   ├──</span>
                      <div>
                        <span className="text-blue-300">temp_cache/</span>
                        <span className="text-slate-400 ml-1">- 临时缓存</span>
                        <div className="text-slate-500 ml-4">手动触发的临时录像，自动清理旧文件</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-cyan-400 shrink-0">│   └──</span>
                      <div>
                        <span className="text-green-300">alarm_screenshots/</span>
                        <span className="text-slate-400 ml-1">- 告警截图</span>
                        <div className="text-slate-500 ml-4">告警发生时自动截取的图片</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 围栏设置 */}
          {activeTab === 'fence' && (
            <div className="space-y-4">
              <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/50">
                <h3 className="text-base font-semibold text-white mb-4">围栏与轨迹参数设置</h3>
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm text-slate-400 mb-1.5">检测间隔(秒)</label>
                    <input
                      type="number"
                      value={settings.fenceDetectionInterval}
                      onChange={(e) => setSettings({ ...settings, fenceDetectionInterval: Number(e.target.value) })}
                      min={1}
                      max={10}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-base text-slate-200"
                    />
                    <p className="text-sm text-slate-500 mt-1">每秒越界检测的频率</p>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1.5">越界判定延迟(秒)</label>
                    <select
                      value={settings.fenceGracePeriod}
                      onChange={(e) => setSettings({ ...settings, fenceGracePeriod: Number(e.target.value) })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-base text-slate-200"
                    >
                      <option value={0}>立即触发</option>
                      <option value={1}>1 秒</option>
                      <option value={2}>2 秒</option>
                      <option value={3}>3 秒 (推荐)</option>
                      <option value={5}>5 秒</option>
                    </select>
                    <p className="text-sm text-slate-500 mt-1">解决围栏边缘误报问题</p>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1.5">告警静默(分钟)</label>
                    <input
                      type="number"
                      value={settings.fenceAlarmSilenceMinutes}
                      onChange={(e) => setSettings({ ...settings, fenceAlarmSilenceMinutes: Number(e.target.value) })}
                      min={0}
                      max={60}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-base text-slate-200"
                    />
                    <p className="text-sm text-slate-500 mt-1">同设备不重复告警</p>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1.5">轨迹保存天数</label>
                    <select
                      value={settings.trackRetentionDays || 30}
                      onChange={(e) => setSettings({ ...settings, trackRetentionDays: Number(e.target.value) })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-base text-slate-200"
                    >
                      <option value={7}>7天</option>
                      <option value={15}>15天</option>
                      <option value={30}>30天</option>
                      <option value={60}>60天</option>
                      <option value={90}>90天</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1.5">轨迹抽稀精度(米)</label>
                    <input
                      type="number"
                      value={settings.trackSimplifyPrecision || 2}
                      onChange={(e) => setSettings({ ...settings, trackSimplifyPrecision: Number(e.target.value) })}
                      min={1}
                      max={20}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-base text-slate-200"
                    />
                    <p className="text-sm text-slate-500 mt-1">超过N米才保留轨迹点</p>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1.5">轨迹记录间隔(秒)</label>
                    <input
                      type="number"
                      value={settings.trackRecordInterval || 5}
                      onChange={(e) => setSettings({ ...settings, trackRecordInterval: Number(e.target.value) })}
                      min={1}
                      max={60}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-base text-slate-200"
                    />
                    <p className="text-sm text-slate-500 mt-1">定位数据上报频率</p>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1.5">默认围栏半径(米)</label>
                    <input
                      type="number"
                      value={settings.fenceDefaultRadius}
                      onChange={(e) => setSettings({ ...settings, fenceDefaultRadius: Number(e.target.value) })}
                      min={10}
                      max={5000}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-base text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1.5">围栏数据保存天数</label>
                    <input
                      type="number"
                      value={settings.fenceRetentionDays}
                      onChange={(e) => setSettings({ ...settings, fenceRetentionDays: Number(e.target.value) })}
                      min={7}
                      max={365}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-base text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1.5">默认围栏规则</label>
                    <select
                      value={settings.fenceDefaultBehavior}
                      onChange={(e) => setSettings({ ...settings, fenceDefaultBehavior: e.target.value as 'No Entry' | 'No Exit' })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-base text-slate-200"
                    >
                      <option value="No Entry">禁止进入</option>
                      <option value="No Exit">禁止离开</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1.5">默认告警等级</label>
                    <select
                      value={settings.fenceDefaultSeverity}
                      onChange={(e) => setSettings({ ...settings, fenceDefaultSeverity: e.target.value as 'normal' | 'risk' | 'severe' })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-base text-slate-200"
                    >
                      <option value="normal">一般</option>
                      <option value="risk">风险</option>
                      <option value="severe">严重</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1.5">长时间未移动提醒</label>
                    <label className="relative inline-flex items-center cursor-pointer mt-1.5">
                      <input
                        type="checkbox"
                        checked={settings.stationaryReminderEnabled || false}
                        onChange={(e) => setSettings({ ...settings, stationaryReminderEnabled: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-10 h-5 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-cyan-500 after:content-[''] after:absolute after:top-[1px] after:left-[1px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
                    </label>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1.5">未移动判定时长(分钟)</label>
                    <input
                      type="number"
                      value={settings.stationaryReminderMinutes || 30}
                      onChange={(e) => setSettings({ ...settings, stationaryReminderMinutes: Number(e.target.value) })}
                      min={5}
                      max={180}
                      disabled={!settings.stationaryReminderEnabled}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-base text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <p className="text-sm text-slate-500 mt-1">静止N分钟后触发提醒</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 告警设置 */}
          {activeTab === 'alarm' && (
            <div className="space-y-4">
              <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/50 mb-4">
                <h3 className="text-sm font-semibold text-white mb-3">基础设置</h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  <div className="flex items-center justify-between py-1">
                    <div>
                      <div className="text-sm text-white">告警弹窗</div>
                      <div className="text-xs text-slate-400">有新告警时弹出窗口</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" checked={settings.alarmPopup} onChange={(e) => setSettings({ ...settings, alarmPopup: e.target.checked })} className="sr-only peer" />
                      <div className="w-9 h-5 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-cyan-500 after:content-[''] after:absolute after:top-[1px] after:left-[1px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
                    </label>
                  </div>
                  
                  <div className="flex items-center justify-between py-1">
                    <div>
                      <div className="text-sm text-white">告警声音</div>
                      <div className="text-xs text-slate-400">有新告警时播放声音</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" checked={settings.alarmSound} onChange={(e) => setSettings({ ...settings, alarmSound: e.target.checked })} className="sr-only peer" />
                      <div className="w-9 h-5 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-cyan-500 after:content-[''] after:absolute after:top-[1px] after:left-[1px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between py-1">
                    <div>
                      <div className="text-sm text-white">自动处理</div>
                      <div className="text-xs text-slate-400">30秒后自动标记已处理</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" checked={settings.alarmAutoResolve} onChange={(e) => setSettings({ ...settings, alarmAutoResolve: e.target.checked })} className="sr-only peer" />
                      <div className="w-9 h-5 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-cyan-500 after:content-[''] after:absolute after:top-[1px] after:left-[1px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between py-1">
                    <div>
                      <div className="text-sm text-white">高等级闪烁</div>
                      <div className="text-xs text-slate-400">严重告警时状态栏闪烁</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" checked={settings.alarmSevereFlash || false} onChange={(e) => setSettings({ ...settings, alarmSevereFlash: e.target.checked })} className="sr-only peer" />
                      <div className="w-9 h-5 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-cyan-500 after:content-[''] after:absolute after:top-[1px] after:left-[1px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
                    </label>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-slate-700/50">
                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">告警保留天数</label>
                      <input
                        type="number"
                        value={settings.alarmRetentionDays}
                        onChange={(e) => setSettings({ ...settings, alarmRetentionDays: Number(e.target.value) })}
                        min={7}
                        max={180}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200"
                      />
                    </div>
                    {settings.alarmSound && (
                      <>
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">声音类型</label>
                          <select
                            value={settings.alarmSoundType}
                            onChange={(e) => setSettings({ ...settings, alarmSoundType: e.target.value as 'none' | 'standard' | 'emergency' })}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200"
                          >
                            <option value="standard">标准</option>
                            <option value="emergency">紧急</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-slate-400 mb-1">重复间隔(分钟)</label>
                          <input
                            type="number"
                            value={settings.alarmRepeatInterval}
                            onChange={(e) => setSettings({ ...settings, alarmRepeatInterval: Number(e.target.value) })}
                            min={1}
                            max={30}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200"
                          />
                        </div>
                      </>
                    )}
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">严重告警提升</label>
                      <select
                        value={settings.alarmSevereUpgrade || 'sound'}
                        onChange={(e) => setSettings({ ...settings, alarmSevereUpgrade: e.target.value })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200"
                      >
                        <option value="sound">仅加强声音</option>
                        <option value="voice">语音播报</option>
                        <option value="call">自动拨打电话</option>
                        <option value="sms">自动发短信</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-slate-700/50">
                  <div className="mb-4">
                    <label className="block text-sm text-slate-400 mb-2">报警音量</label>
                    <div className="flex items-center gap-3">
                      <span className="text-slate-500 text-sm">🔈</span>
                      <input 
                        id="alarmVolumeSlider"
                        type="range" 
                        min="0" 
                        max="100" 
                        defaultValue={Math.round((window as any).alarmVolume * 100)}
                        className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                      />
                      <span className="text-slate-500 text-sm">🔊</span>
                      <span id="alarmVolumeValue" className="text-cyan-400 text-sm font-medium w-12 text-right">{Math.round((window as any).alarmVolume * 100)}%</span>
                    </div>
                  </div>

                  <div className="mb-3">
                    <label className="block text-sm text-slate-400 mb-2">告警测试</label>
                  </div>

                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <button
                      onClick={() => { window.stopAlarmSound && window.stopAlarmSound(); window.playAlarmSound && window.playAlarmSound('low'); }}
                      className="bg-slate-700 hover:bg-slate-600 text-slate-300 font-medium py-2.5 px-4 rounded-lg transition-all text-sm"
                    >
                      🔵 低等级
                    </button>
                    <button
                      onClick={() => { window.stopAlarmSound && window.stopAlarmSound(); window.playAlarmSound && window.playAlarmSound('medium', true); }}
                      className="bg-amber-600 hover:bg-amber-500 text-white font-medium py-2.5 px-4 rounded-lg transition-all text-sm shadow-lg shadow-amber-500/20"
                    >
                      🟡 中等级
                    </button>
                    <button
                      onClick={() => window.showFenceAlarm('测试设备', '非法闯入', '测试区域', 'high')}
                      className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-medium py-2.5 px-4 rounded-lg transition-all text-sm shadow-lg shadow-red-500/30"
                    >
                      🔴 高等级
                    </button>
                  </div>
                  
                  <button
                    onClick={() => window.stopAlarmSound && window.stopAlarmSound()}
                    className="w-full bg-slate-600 hover:bg-slate-500 text-white font-medium py-2 px-4 rounded-lg transition-all text-sm"
                  >
                    🔇 停止报警声
                  </button>
                </div>
              </div>

              <div className="bg-slate-800/30 rounded-lg border border-slate-700/50 mb-4 overflow-hidden">
                <div className="p-4 border-b border-slate-700/50">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-semibold text-white">AI检测行为告警等级配置中心</h3>
                      <p className="text-xs text-slate-500 mt-1">支持50+种检测算法，可按类别筛选、模糊搜索快速定位</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">共 {(settings.aiAlarmLevelConfigs || []).length} 种算法</span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-3">
                    <div className="relative">
                      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input
                        type="text"
                        placeholder="搜索算法名称、描述..."
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-sm text-slate-200 focus:border-cyan-500 focus:outline-none"
                        value={algoSearchKeyword}
                        onChange={(e) => setAlgoSearchKeyword(e.target.value.toLowerCase())}
                      />
                    </div>
                    <select
                      className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-cyan-500 focus:outline-none"
                      value={algoCategoryFilter}
                      onChange={(e) => setAlgoCategoryFilter(e.target.value)}
                    >
                      <option value="">全部类别</option>
                      <option value="安全防护">安全防护</option>
                      <option value="作业行为">作业行为</option>
                      <option value="人员安全">人员安全</option>
                      <option value="人员管理">人员管理</option>
                      <option value="消防安全">消防安全</option>
                      <option value="区域管理">区域管理</option>
                      <option value="动火作业">动火作业</option>
                      <option value="临边防护">临边防护</option>
                      <option value="起重作业">起重作业</option>
                      <option value="设备安全">设备安全</option>
                    </select>
                    <select
                      className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-cyan-500 focus:outline-none"
                      value={algoLevelFilter}
                      onChange={(e) => setAlgoLevelFilter(e.target.value)}
                    >
                      <option value="">全部等级</option>
                      <option value="low">一般</option>
                      <option value="medium">风险</option>
                      <option value="high">紧急</option>
                    </select>
                  </div>
                </div>

                <div className="max-h-[500px] overflow-y-auto p-3">
                  <div className="grid grid-cols-3 gap-3">
                    {(settings.aiAlarmLevelConfigs || []).filter(c => {
                      const matchKeyword = !algoSearchKeyword || 
                        c.name.toLowerCase().includes(algoSearchKeyword) || 
                        c.description.toLowerCase().includes(algoSearchKeyword);
                      const matchCategory = !algoCategoryFilter || c.category === algoCategoryFilter;
                      const matchLevel = !algoLevelFilter || c.level === algoLevelFilter;
                      return matchKeyword && matchCategory && matchLevel;
                    }).map((config) => (
                      <div key={config.id} className="bg-slate-800/50 rounded-lg border border-slate-700/50 p-3 hover:border-slate-600 transition-colors">
                        <div className="mb-2">
                          <div className="text-sm font-medium text-white truncate">{config.name}</div>
                          <div className="text-xs text-slate-500 mt-0.5">{config.description}</div>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400">
                            {config.category}
                          </span>
                          <select
                            value={config.level}
                            onChange={(e) => {
                              const newConfigs = settings.aiAlarmLevelConfigs.map(c => 
                                c.id === config.id ? { ...c, level: e.target.value as 'low' | 'medium' | 'high' } : c
                              );
                              setSettings({ ...settings, aiAlarmLevelConfigs: newConfigs });
                            }}
                            className={`text-xs px-2 py-1 rounded-lg border-0 cursor-pointer font-medium ${
                              config.level === 'high' ? 'bg-red-500/20 text-red-400' :
                              config.level === 'medium' ? 'bg-amber-500/20 text-amber-400' :
                              'bg-slate-500/20 text-slate-400'
                            }`}
                          >
                            <option value="low">一般</option>
                            <option value="medium">风险</option>
                            <option value="high">紧急</option>
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 日志设置 */}
          {activeTab === 'log' && (
            <div className="space-y-5">
              {/* 基础配置 - 4列 */}
              <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/50">
                <h3 className="text-base font-semibold text-white mb-4">基础配置</h3>
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm text-slate-400 mb-1.5">日志保留天数</label>
                    <input
                      type="number"
                      value={settings.logRetentionDays}
                      onChange={(e) => setSettings({ ...settings, logRetentionDays: Number(e.target.value) })}
                      min={7}
                      max={365}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-base text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1.5">日志级别</label>
                    <select
                      value={settings.logLevel}
                      onChange={(e) => setSettings({ ...settings, logLevel: e.target.value as 'all' | 'error' | 'warning' })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-base text-slate-200"
                    >
                      <option value="all">全部</option>
                      <option value="error">仅错误</option>
                      <option value="warning">仅警告</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1.5">导出文件编码</label>
                    <select
                      value={settings.logExportEncoding}
                      onChange={(e) => setSettings({ ...settings, logExportEncoding: e.target.value as 'utf8' | 'gb2312' })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-base text-slate-200"
                    >
                      <option value="utf8">UTF-8</option>
                      <option value="gb2312">GB2312</option>
                    </select>
                    <p className="text-sm text-slate-500 mt-1">解决Excel乱码</p>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1.5">登录失败告警阈值</label>
                    <input
                      type="number"
                      value={settings.logLoginFailedAlert || 5}
                      onChange={(e) => setSettings({ ...settings, logLoginFailedAlert: Number(e.target.value) })}
                      min={1}
                      max={20}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-base text-slate-200"
                    />
                    <p className="text-sm text-slate-500 mt-1">连续N次触发告警</p>
                  </div>
                </div>
              </div>

              {/* 日志分类记录 */}
              <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/50">
                <h3 className="text-base font-semibold text-white mb-4">日志分类记录</h3>
                <div className="grid grid-cols-4 gap-6">
                  <label className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-slate-700/50 transition-colors">
                    <input
                      type="checkbox"
                      checked={settings.logOperation}
                      onChange={(e) => setSettings({ ...settings, logOperation: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-0"
                    />
                    <div>
                      <div className="text-sm text-white">操作日志</div>
                      <div className="text-xs text-slate-500">用户增删改操作</div>
                    </div>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-slate-700/50 transition-colors">
                    <input
                      type="checkbox"
                      checked={settings.logLogin}
                      onChange={(e) => setSettings({ ...settings, logLogin: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-0"
                    />
                    <div>
                      <div className="text-sm text-white">登录日志</div>
                      <div className="text-xs text-slate-500">登录登出记录</div>
                    </div>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-slate-700/50 transition-colors">
                    <input
                      type="checkbox"
                      checked={settings.logAlarm}
                      onChange={(e) => setSettings({ ...settings, logAlarm: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-0"
                    />
                    <div>
                      <div className="text-sm text-white">告警日志</div>
                      <div className="text-xs text-slate-500">告警处理记录</div>
                    </div>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-slate-700/50 transition-colors">
                    <input
                      type="checkbox"
                      checked={settings.logConfig}
                      onChange={(e) => setSettings({ ...settings, logConfig: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-0"
                    />
                    <div>
                      <div className="text-sm text-white">配置变更</div>
                      <div className="text-xs text-slate-500">参数修改历史</div>
                    </div>
                  </label>
                </div>
              </div>

              {/* 高级开关 */}
              <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/50">
                <h3 className="text-base font-semibold text-white mb-4">高级功能</h3>
                <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <div className="text-sm text-white">日志自动清理</div>
                      <div className="text-xs text-slate-400">超过保留天数的日志自动删除</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.logAutoClean}
                        onChange={(e) => setSettings({ ...settings, logAutoClean: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-cyan-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                    </label>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <div className="text-sm text-white">敏感操作审计</div>
                      <div className="text-xs text-slate-400">管理员操作强制记录，不受分类开关控制</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.logAuditEnabled}
                        onChange={(e) => setSettings({ ...settings, logAuditEnabled: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-cyan-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                    </label>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <div className="text-sm text-white">修改前后对比</div>
                      <div className="text-xs text-slate-400">记录配置变更前/后值</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.logDiffEnabled}
                        onChange={(e) => setSettings({ ...settings, logDiffEnabled: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-cyan-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                    </label>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <div className="text-sm text-white">异常自动上报</div>
                      <div className="text-xs text-slate-400">前端异常自动收集</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.logErrorReport}
                        onChange={(e) => setSettings({ ...settings, logErrorReport: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-cyan-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                    </label>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <div className="text-sm text-white">日志自动压缩</div>
                      <div className="text-xs text-slate-400">超过7天自动ZIP压缩</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.logAutoCompress}
                        onChange={(e) => setSettings({ ...settings, logAutoCompress: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-cyan-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 账号安全 */}
          {activeTab === 'account' && (
            <div className="space-y-4">
              <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/50 mb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-white">修改密码</div>
                    <div className="text-xs text-slate-400">定期更换密码提高安全性</div>
                  </div>
                  <button
                    onClick={() => setShowPasswordModal(true)}
                    className="px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 rounded-lg text-sm transition-all"
                  >
                    修改密码
                  </button>
                </div>
              </div>
              
              <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/50 mb-4">
                <h3 className="text-sm font-semibold text-white mb-3">密码强度规则</h3>
                <div className="grid grid-cols-4 gap-4 items-center">
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">密码最小长度</label>
                    <select
                      value={settings.passwordMinLength}
                      onChange={(e) => setSettings({ ...settings, passwordMinLength: Number(e.target.value) })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200"
                    >
                      <option value={6}>6 位</option>
                      <option value={8}>8 位</option>
                      <option value={10}>10 位</option>
                      <option value={12}>12 位</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">密码有效期(天)</label>
                    <input
                      type="number"
                      value={settings.passwordExpireDays || 90}
                      onChange={(e) => setSettings({ ...settings, passwordExpireDays: Number(e.target.value) })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200"
                      placeholder="90"
                    />
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.forceInitialPasswordChange}
                        onChange={(e) => setSettings({ ...settings, forceInitialPasswordChange: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-cyan-500 after:content-[''] after:absolute after:top-[1px] after:left-[1px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
                    </label>
                    <div className="text-sm text-white">初始密码强制修改</div>
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.passwordRequireComplexity}
                        onChange={(e) => setSettings({ ...settings, passwordRequireComplexity: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-cyan-500 after:content-[''] after:absolute after:top-[1px] after:left-[1px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
                    </label>
                    <div className="text-sm text-white">要求复杂度</div>
                  </div>
                </div>
              </div>
              
              <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/50">
                <h3 className="text-sm font-semibold text-white mb-3">登录安全</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">连续失败锁定次数</label>
                    <select
                      value={settings.loginAttempts}
                      onChange={(e) => setSettings({ ...settings, loginAttempts: Number(e.target.value) })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200"
                    >
                      <option value={3}>3 次</option>
                      <option value={5}>5 次</option>
                      <option value={10}>10 次</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">锁定时长(分钟)</label>
                    <select
                      value={settings.lockoutDuration}
                      onChange={(e) => setSettings({ ...settings, lockoutDuration: Number(e.target.value) })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200"
                    >
                      <option value={15}>15 分钟</option>
                      <option value={30}>30 分钟</option>
                      <option value={60}>1 小时</option>
                      <option value={1440}>24 小时</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">最大同时在线数</label>
                    <select
                      value={settings.maxConcurrentSessions}
                      onChange={(e) => setSettings({ ...settings, maxConcurrentSessions: Number(e.target.value) })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200"
                    >
                      <option value={1}>仅限 1 台</option>
                      <option value={3}>最多 3 台</option>
                      <option value={5}>最多 5 台</option>
                      <option value={0}>不限制</option>
                    </select>
                  </div>
                </div>
              </div>
              
              {/* 各级管理员初始权限 */}
              <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/50">
                <h3 className="text-base font-semibold text-white mb-4">各级管理员初始权限</h3>
                <div className="grid grid-cols-4 gap-4">
                  {/* 总部管理员 */}
                  <div className="bg-slate-800/50 rounded-lg p-3 border border-red-500/30">
                    <div className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2">
                      <Building2 size={14} />
                      总部管理员
                    </div>
                    <div className="space-y-2">
                      {['dashboard', 'monitor', 'fence', 'device', 'personnel', 'alarm', 'system'].map(perm => (
                        <label key={perm} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settings.hqAdminPermissions?.includes(perm) || false}
                            onChange={(e) => {
                              const perms = settings.hqAdminPermissions || [];
                              setSettings({
                                ...settings,
                                hqAdminPermissions: e.target.checked 
                                  ? [...perms, perm] 
                                  : perms.filter(p => p !== perm)
                              });
                            }}
                            className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-800 text-red-500 focus:ring-red-500 focus:ring-offset-0"
                          />
                          <span className="text-xs text-slate-300">{
                            perm === 'dashboard' ? '仪表板' :
                            perm === 'monitor' ? '视频监控' :
                            perm === 'fence' ? '电子围栏' :
                            perm === 'device' ? '设备管理' :
                            perm === 'personnel' ? '人员管理' :
                            perm === 'alarm' ? '告警管理' :
                            perm === 'system' ? '系统设置' : perm
                          }</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  
                  {/* 分公司管理员 */}
                  <div className="bg-slate-800/50 rounded-lg p-3 border border-orange-500/30">
                    <div className="text-sm font-semibold text-orange-400 mb-3 flex items-center gap-2">
                      <Building2 size={14} />
                      分公司管理员
                    </div>
                    <div className="space-y-2">
                      {['dashboard', 'monitor', 'fence', 'device', 'personnel', 'alarm'].map(perm => (
                        <label key={perm} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settings.branchAdminPermissions?.includes(perm) || false}
                            onChange={(e) => {
                              const perms = settings.branchAdminPermissions || [];
                              setSettings({
                                ...settings,
                                branchAdminPermissions: e.target.checked 
                                  ? [...perms, perm] 
                                  : perms.filter(p => p !== perm)
                              });
                            }}
                            className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-800 text-orange-500 focus:ring-orange-500 focus:ring-offset-0"
                          />
                          <span className="text-xs text-slate-300">{
                            perm === 'dashboard' ? '仪表板' :
                            perm === 'monitor' ? '视频监控' :
                            perm === 'fence' ? '电子围栏' :
                            perm === 'device' ? '设备管理' :
                            perm === 'personnel' ? '人员管理' :
                            perm === 'alarm' ? '告警管理' : perm
                          }</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  
                  {/* 项目管理员 */}
                  <div className="bg-slate-800/50 rounded-lg p-3 border border-blue-500/30">
                    <div className="text-sm font-semibold text-blue-400 mb-3 flex items-center gap-2">
                      <FolderTree size={14} />
                      项目管理员
                    </div>
                    <div className="space-y-2">
                      {['dashboard', 'monitor', 'fence', 'device.view', 'personnel.view', 'alarm'].map(perm => (
                        <label key={perm} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settings.projectAdminPermissions?.includes(perm) || false}
                            onChange={(e) => {
                              const perms = settings.projectAdminPermissions || [];
                              setSettings({
                                ...settings,
                                projectAdminPermissions: e.target.checked 
                                  ? [...perms, perm] 
                                  : perms.filter(p => p !== perm)
                              });
                            }}
                            className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                          />
                          <span className="text-xs text-slate-300">{
                            perm === 'dashboard' ? '仪表板' :
                            perm === 'monitor' ? '视频监控' :
                            perm === 'fence' ? '电子围栏' :
                            perm === 'device.view' ? '设备查看' :
                            perm === 'personnel.view' ? '人员查看' :
                            perm === 'alarm' ? '告警管理' : perm
                          }</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  
                  {/* 工队管理员 */}
                  <div className="bg-slate-800/50 rounded-lg p-3 border border-green-500/30">
                    <div className="text-sm font-semibold text-green-400 mb-3 flex items-center gap-2">
                      <Users size={14} />
                      工队管理员
                    </div>
                    <div className="space-y-2">
                      {['dashboard', 'monitor.view', 'personnel.view', 'alarm.view'].map(perm => (
                        <label key={perm} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settings.teamAdminPermissions?.includes(perm) || false}
                            onChange={(e) => {
                              const perms = settings.teamAdminPermissions || [];
                              setSettings({
                                ...settings,
                                teamAdminPermissions: e.target.checked 
                                  ? [...perms, perm] 
                                  : perms.filter(p => p !== perm)
                              });
                            }}
                            className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-800 text-green-500 focus:ring-green-500 focus:ring-offset-0"
                          />
                          <span className="text-xs text-slate-300">{
                            perm === 'dashboard' ? '仪表板' :
                            perm === 'monitor.view' ? '监控查看' :
                            perm === 'personnel.view' ? '人员查看' :
                            perm === 'alarm.view' ? '告警查看' : perm
                          }</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-3">
                  * 新建对应级别管理员账号时，将自动授予以上选中的初始模块权限
                </p>
              </div>
            </div>
          )}

          {/* 通知设置 */}
          {activeTab === 'notification' && (
            <div className="space-y-4">
              <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/50 mb-4">
                <h3 className="text-sm font-semibold text-white mb-3">通知方式总开关</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <div className="text-sm text-white">短信通知</div>
                      <div className="text-xs text-slate-400">告警通过短信发送</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.smsNotification}
                        onChange={(e) => setSettings({ ...settings, smsNotification: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-cyan-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                    </label>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <div className="text-sm text-white">电话通知</div>
                      <div className="text-xs text-slate-400">告警通过语音电话播报</div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.callNotification}
                        onChange={(e) => setSettings({ ...settings, callNotification: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-cyan-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                    </label>
                  </div>
                </div>
              </div>
              
              <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/50 mb-4">
                <h3 className="text-sm font-semibold text-white mb-3">告警等级通知开关</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700">
                        <th className="py-2 text-left text-slate-400 font-normal">告警等级</th>
                        <th className="py-2 text-center text-slate-400 font-normal">短信</th>
                        <th className="py-2 text-center text-slate-400 font-normal">电话</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                      <tr>
                        <td className="py-3">
                          <span className="text-white flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-red-500"></span>
                            高级告警
                          </span>
                          <div className="text-xs text-slate-500 mt-0.5">SOS呼救、AI安全违规</div>
                        </td>
                        <td className="py-3 text-center">
                          <input
                            type="checkbox"
                            checked={settings.notifySevereBySms}
                            onChange={(e) => setSettings({ ...settings, notifySevereBySms: e.target.checked })}
                            className="w-4 h-4 accent-cyan-500"
                          />
                        </td>
                        <td className="py-3 text-center">
                          <input
                            type="checkbox"
                            checked={settings.notifySevereByCall}
                            onChange={(e) => setSettings({ ...settings, notifySevereByCall: e.target.checked })}
                            className="w-4 h-4 accent-cyan-500"
                          />
                        </td>
                      </tr>
                      <tr>
                        <td className="py-3">
                          <span className="text-white flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                            中级告警
                          </span>
                          <div className="text-xs text-slate-500 mt-0.5">围栏越界、长时间静止</div>
                        </td>
                        <td className="py-3 text-center">
                          <input
                            type="checkbox"
                            checked={settings.notifyMediumBySms}
                            onChange={(e) => setSettings({ ...settings, notifyMediumBySms: e.target.checked })}
                            className="w-4 h-4 accent-cyan-500"
                          />
                        </td>
                        <td className="py-3 text-center">
                          <input
                            type="checkbox"
                            checked={settings.notifyMediumByCall}
                            onChange={(e) => setSettings({ ...settings, notifyMediumByCall: e.target.checked })}
                            className="w-4 h-4 accent-cyan-500"
                          />
                        </td>
                      </tr>
                      <tr>
                        <td className="py-3">
                          <span className="text-white flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                            低级告警
                          </span>
                          <div className="text-xs text-slate-500 mt-0.5">低电量、设备离线提醒</div>
                        </td>
                        <td className="py-3 text-center">
                          <input
                            type="checkbox"
                            checked={settings.notifyLowBySms}
                            onChange={(e) => setSettings({ ...settings, notifyLowBySms: e.target.checked })}
                            className="w-4 h-4 accent-cyan-500"
                          />
                        </td>
                        <td className="py-3 text-center">
                          <input
                            type="checkbox"
                            checked={settings.notifyLowByCall}
                            onChange={(e) => setSettings({ ...settings, notifyLowByCall: e.target.checked })}
                            className="w-4 h-4 accent-cyan-500"
                          />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              
              {settings.emailNotification && (
                <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/50 mb-4">
                  <h3 className="text-sm font-semibold text-white mb-3">邮件服务器配置</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">SMTP服务器</label>
                      <input
                        type="text"
                        value={settings.emailServer}
                        onChange={(e) => setSettings({ ...settings, emailServer: e.target.value })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">端口</label>
                      <input
                        type="number"
                        value={settings.emailPort}
                        onChange={(e) => setSettings({ ...settings, emailPort: Number(e.target.value) })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">发件人邮箱</label>
                      <input
                        type="text"
                        value={settings.emailFrom || 'alarm@company.com'}
                        onChange={(e) => setSettings({ ...settings, emailFrom: e.target.value })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">授权码</label>
                      <input
                        type="password"
                        value={settings.emailPassword || '******'}
                        onChange={(e) => setSettings({ ...settings, emailPassword: e.target.value })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
                      />
                    </div>
                  </div>
                </div>
              )}
              
              {settings.smsNotification && (
                <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/50 mb-4">
                  <h3 className="text-sm font-semibold text-white mb-3">短信网关配置</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">API 地址</label>
                      <input
                        type="text"
                        value={settings.smsApiUrl || 'https://sms.example.com/api'}
                        onChange={(e) => setSettings({ ...settings, smsApiUrl: e.target.value })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">API Key</label>
                      <input
                        type="password"
                        value={settings.smsApiKey || '****************'}
                        onChange={(e) => setSettings({ ...settings, smsApiKey: e.target.value })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">签名</label>
                      <input
                        type="text"
                        value={settings.smsSign || '【安全管理系统】'}
                        onChange={(e) => setSettings({ ...settings, smsSign: e.target.value })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">模板ID</label>
                      <input
                        type="text"
                        value={settings.smsTemplateId || 'SMS_123456'}
                        onChange={(e) => setSettings({ ...settings, smsTemplateId: e.target.value })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
                      />
                    </div>
                  </div>
                </div>
              )}
              
              <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/50">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-white">通知接收人列表</h3>
                  <button
                    onClick={() => {
                      setSelectedPersons([]);
                      setRecipientSearch('');
                      setShowAddRecipientModal(true);
                    }}
                    className="px-3 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 rounded-lg text-xs transition-all"
                  >
                    + 添加接收人
                  </button>
                </div>
                {settings.notificationRecipients.length === 0 ? (
                  <div className="text-center py-6 text-slate-500 text-sm">
                    暂无配置接收人，添加后告警将按级别发送通知
                  </div>
                ) : (
                  <div className="space-y-2">
                    {settings.notificationRecipients.map((recipient, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                        <div className="flex-1">
                          <div className="text-sm text-white font-medium">{recipient.name}</div>
                          <div className="text-xs text-slate-500 mt-1">{recipient.phone}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            recipient.level === 'severe' ? 'bg-red-500/20 text-red-400' :
                            recipient.level === 'medium' ? 'bg-amber-500/20 text-amber-400' :
                            recipient.level === 'low' ? 'bg-emerald-500/20 text-emerald-400' :
                            'bg-cyan-500/20 text-cyan-400'
                          }`}>
                            {recipient.level === 'severe' ? '高级告警' : recipient.level === 'medium' ? '中级告警' : recipient.level === 'low' ? '低级告警' : '全部告警'}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded ${recipient.enabled ? 'bg-green-500/20 text-green-400' : 'bg-slate-500/20 text-slate-400'}`}>
                            {recipient.enabled ? '已启用' : '已禁用'}
                          </span>
                          <button
                            onClick={() => {
                              const newRecipients = [...settings.notificationRecipients];
                              newRecipients[idx].enabled = !newRecipients[idx].enabled;
                              setSettings({ ...settings, notificationRecipients: newRecipients });
                            }}
                            className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-all"
                            title={recipient.enabled ? '禁用' : '启用'}
                          >
                            {recipient.enabled ? '✓' : '○'}
                          </button>
                          <button
                            onClick={() => {
                              if (confirm('确定删除此接收人？')) {
                                const newRecipients = settings.notificationRecipients.filter((_, i) => i !== idx);
                                setSettings({ ...settings, notificationRecipients: newRecipients });
                              }
                            }}
                            className="p-1.5 hover:bg-red-500/20 rounded text-slate-400 hover:text-red-400 transition-all"
                            title="删除"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 数据备份 */}
          {activeTab === 'backup' && (
            <div className="space-y-6">
              {/* 自动备份设置 */}
              <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/50">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-white">自动备份设置</h3>
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        fetch('/api/backup/create/mysql', { method: 'POST' })
                          .then(r => r.json())
                          .then(r => console.log('MySQL备份结果:', r));
                      }}
                      className="text-sm bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-lg font-medium shadow-lg shadow-cyan-500/20 transition-all cursor-pointer"
                    >
                      备份数据库
                    </button>
                    <button
                      onClick={() => {
                        fetch('/api/backup/create/config', { method: 'POST' })
                          .then(r => r.json())
                          .then(r => console.log('配置备份结果:', r));
                      }}
                      className="text-sm bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg font-medium shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
                    >
                      备份配置
                    </button>
                    <button
                      onClick={() => {
                        fetch('/api/backup/create/full', { method: 'POST' })
                          .then(r => r.json())
                          .then(r => console.log('完整备份结果:', r));
                      }}
                      className="text-sm bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white px-4 py-2 rounded-lg font-bold shadow-lg shadow-amber-500/30 transition-all cursor-pointer"
                    >
                      完整备份
                    </button>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center py-2">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-3">
                        <div>
                          <div className="text-sm text-white">自动备份</div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settings.autoBackup}
                            onChange={(e) => setSettings({ ...settings, autoBackup: e.target.checked })}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-slate-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-cyan-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
                        </label>
                      </div>
                      {settings.autoBackup && (
                        <div className="flex items-center gap-3 ml-2 pl-4 border-l border-slate-700">
                          <div className="flex items-center gap-2">
                            <label className="text-sm text-slate-400">频率</label>
                            <select
                              value={settings.backupFrequency}
                              onChange={(e) => setSettings({ ...settings, backupFrequency: e.target.value as 'daily' | 'weekly' | 'monthly' })}
                              className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-200"
                            >
                              <option value="daily">每天</option>
                              <option value="weekly">每周</option>
                              <option value="monthly">每月</option>
                            </select>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-sm text-slate-400">时间</label>
                            <input
                              type="time"
                              value={settings.backupTime}
                              onChange={(e) => setSettings({ ...settings, backupTime: e.target.value })}
                              className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-200 w-24"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-sm text-slate-400">保留</label>
                            <input
                              type="number"
                              value={settings.backupRetention}
                              onChange={(e) => setSettings({ ...settings, backupRetention: Number(e.target.value) })}
                              min={1}
                              max={30}
                              className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-slate-200 w-16"
                            />
                            <span className="text-sm text-slate-400">份</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* 备份路径设置（数据生成时同步多写） */}
              <div className="bg-gradient-to-r from-cyan-500/10 to-emerald-500/10 rounded-lg p-4 border border-cyan-500/30 mt-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white">备份路径设置</h3>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => {
                        fetch('/api/backup/storage/open', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ path: './static' })
                        })
                          .then(r => r.json())
                          .then(r => console.log('打开文件夹:', r));
                      }}
                      className="text-xs px-2.5 py-1 rounded bg-slate-600 hover:bg-slate-500 text-slate-200 cursor-pointer transition-all"
                    >
                      打开录像存储
                    </button>
                    <button
                      onClick={() => {
                        console.log('点击了本地磁盘按钮');
                        setShowLocalModal(true);
                      }}
                      className="text-xs bg-cyan-600 hover:bg-cyan-500 text-white px-3 py-1.5 rounded-lg transition-all cursor-pointer"
                    >
                      添加本地路径
                    </button>
                    <button
                      onClick={() => setShowCloudModal(true)}
                      className="text-xs bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white px-3 py-1.5 rounded-lg transition-all"
                    >
                      添加云存储
                    </button>
                  </div>
                </div>
                
                <div className="space-y-2">
                  {storagePaths.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 text-sm">
                      暂无备份路径，请点击上方按钮添加
                    </div>
                  ) : (
                    storagePaths.map((sp: any, idx: number) => {
                      const color = (sp.type === 'mirror' || sp.type === 'primary') ? 'cyan' : 'purple';
                      const isPrimary = idx === 0;
                      return (
                        <div key={idx} className={`flex items-center justify-between rounded-lg p-3 transition-all ${isPrimary ? 'bg-gradient-to-r from-amber-500/20 to-cyan-500/20 border-2 border-amber-500/50 shadow-lg shadow-amber-500/20' : 'bg-slate-800/50'}`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isPrimary ? 'bg-amber-500/30 animate-pulse' : color === 'cyan' ? 'bg-cyan-500/20' : 'bg-purple-500/20'}`}>
                            <span className={`text-lg font-bold ${isPrimary ? 'text-amber-400' : color === 'cyan' ? 'text-cyan-400' : 'text-purple-400'}`}>{isPrimary ? '主' : color === 'cyan' ? '本' : '云'}</span>
                          </div>
                          <div>
                            <div className={`font-medium text-sm ${isPrimary ? 'text-amber-300' : 'text-white'}`}>{sp.name}</div>
                            <div className={`text-xs ${isPrimary ? 'text-amber-400/70' : 'text-slate-400'}`}>{sp.path}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {(sp.type === 'mirror' || sp.type === 'primary') && (
                            <button 
                              onClick={() => {
                                fetch('/api/backup/storage/open', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ path: sp.path })
                                })
                                  .then(r => r.json())
                                  .then(r => console.log('打开文件夹:', r));
                              }}
                              className="text-xs px-2.5 py-1 rounded bg-slate-600 hover:bg-slate-500 text-slate-200 cursor-pointer transition-all"
                            >
                              打开文件夹
                            </button>
                          )}
                          {isPrimary ? (
                            <span className="text-xs px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold shadow-lg">当前主存储</span>
                          ) : (
                              <>
                                <span className="text-xs text-green-400 bg-green-500/10 px-2 py-0.5 rounded">已启用</span>
                                <button 
                                  onClick={() => handleSetPrimary(idx)}
                                  className="text-xs px-2 py-1 rounded bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 cursor-pointer transition-all"
                                >
                                  设为主存储
                                </button>
                              </>
                            )}
                            {!isPrimary && (
                              <button 
                                onClick={() => handleDeleteStoragePath(idx)}
                                className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 cursor-pointer transition-all ml-2"
                              >
                                删除
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* 可恢复备份列表 */}
              <div className="bg-slate-800/30 rounded-lg p-4 border border-slate-700/50">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-white">系统快照恢复</h3>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => {
                        fetch('/api/backup/storage/open', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ path: './storage/backups' })
                        })
                          .then(r => r.json())
                          .then(r => console.log('打开文件夹:', r));
                      }}
                      className="text-xs px-2.5 py-1 rounded bg-slate-600 hover:bg-slate-500 text-slate-200 cursor-pointer transition-all"
                    >
                      打开备份目录
                    </button>
                    <label className="text-sm text-slate-400">备份路径</label>
                    <select className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white">
                      <option value="local">默认备份目录</option>
                      {storagePaths.map((sp: any, idx: number) => (
                        <option key={idx} value={idx}>{sp.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {backupFiles.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 text-sm">
                      暂无快照，请先去「数据备份」页面点击右上角「完整备份」生成
                    </div>
                  ) : (
                    backupFiles.map((bf: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between bg-slate-700/30 hover:bg-slate-700/50 rounded-lg p-3 transition-all">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                            <span className="text-cyan-400 font-bold">包</span>
                          </div>
                          <div>
                            <div className="text-sm text-white font-medium">{bf.filename}</div>
                            <div className="text-xs text-slate-400">{bf.date} · {bf.size} · {bf.type}</div>
                          </div>
                        </div>
                        <button 
                          onClick={() => {
                            if (confirm('确认要恢复此备份吗？这将覆盖所有当前配置！')) {
                              fetch('/api/backup/restore', {
                                method: 'POST',
                                headers: {'Content-Type': 'application/json'},
                                body: JSON.stringify({filename: bf.filename})
                              }).then(r => r.json()).then(r => {
                              console.log('恢复结果:', r);
                            });
                            }
                          }}
                          className="text-sm bg-red-600 hover:bg-red-500 text-white px-5 py-1.5 rounded-lg font-bold shadow-lg shadow-red-500/30 transition-all cursor-pointer"
                      >
                        从此节点恢复
                      </button>
                    </div>
                    ))
                  )}
                </div>
                
                <div className="mt-3 text-xs text-amber-400/70">
                  注意：恢复将覆盖：所有摄像头配置、告警规则、用户设置、系统日志、播放历史
                </div>
              </div>

            </div>
          )}

          {/* 高级设置 */}
        </div>
      </div>

      {/* 修改密码弹窗 */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowPasswordModal(false)}>
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl border border-cyan-400/30 shadow-2xl p-6 w-[450px] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-white">修改密码</h3>
              <button onClick={() => setShowPasswordModal(false)} className="p-1 hover:bg-slate-700 rounded">
                <X size={18} className="text-slate-400" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">原密码</label>
                <div className="relative">
                  <input
                    type={showOldPassword ? "text" : "password"}
                    value={passwordData.oldPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, oldPassword: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOldPassword(!showOldPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                  >
                    {showOldPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">新密码</label>
                <div className="relative">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    value={passwordData.newPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                  >
                    {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {passwordData.newPassword && (
                  <div className="mt-2 space-y-1">
                    <div className={`text-xs flex items-center gap-1.5 ${passwordData.newPassword.length >= settings.passwordMinLength ? 'text-green-400' : 'text-slate-500'}`}>
                      <CheckCircle size={12} />
                      长度≥{settings.passwordMinLength}位
                    </div>
                    {settings.passwordRequireComplexity && (
                      <>
                        <div className={`text-xs flex items-center gap-1.5 ${/[A-Z]/.test(passwordData.newPassword) ? 'text-green-400' : 'text-slate-500'}`}>
                          <CheckCircle size={12} />
                          包含大写字母 A-Z
                        </div>
                        <div className={`text-xs flex items-center gap-1.5 ${/[a-z]/.test(passwordData.newPassword) ? 'text-green-400' : 'text-slate-500'}`}>
                          <CheckCircle size={12} />
                          包含小写字母 a-z
                        </div>
                        <div className={`text-xs flex items-center gap-1.5 ${/[0-9]/.test(passwordData.newPassword) ? 'text-green-400' : 'text-slate-500'}`}>
                          <CheckCircle size={12} />
                          包含数字 0-9
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">确认新密码</label>
                <input
                  type="password"
                  value={passwordData.confirmPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
                />
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleChangePassword}
                className="flex-1 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 rounded-lg text-sm font-medium transition-all"
              >
                确认修改
              </button>
              <button
                onClick={() => setShowPasswordModal(false)}
                className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium transition-all"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 恢复默认确认弹窗 */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999]">
          <div className="bg-slate-900 rounded-2xl border border-slate-700 p-6 w-full max-w-sm mx-4 shadow-2xl">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center mx-auto mb-4">
                <AlertTriangle size={28} className="text-amber-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">确认恢复默认</h3>
              <p className="text-sm text-slate-400">确定要恢复所有设置为默认值吗？</p>
              <p className="text-sm text-amber-400/80 mt-1">此操作不可撤销！</p>
            </div>
            <div className="flex gap-3">
              <button 
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium transition-all text-white"
              >
                取消
              </button>
              <button 
                onClick={() => {
                  handleReset();
                  setShowResetConfirm(false);
                }}
                className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-500 rounded-lg text-sm font-medium transition-all text-white"
              >
                确认恢复
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 添加接收人弹窗 */}
      {showAddRecipientModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999]">
          <div className="bg-slate-900 rounded-2xl border border-slate-700 w-full max-w-2xl mx-4 shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-700">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">选择通知接收人</h3>
                <button 
                  onClick={() => setShowAddRecipientModal(false)}
                  className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-all"
                >
                  ✕
                </button>
              </div>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={recipientSearch}
                  onChange={(e) => setRecipientSearch(e.target.value)}
                  placeholder="模糊搜索姓名、项目、工队、手机号、工号..."
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/50 py-2.5 pl-10 pr-4 text-sm text-white outline-none transition-all focus:border-cyan-400/50 placeholder-slate-400"
                />
              </div>
            </div>
            
            <div className="flex" style={{ height: '400px' }}>
              <div className="flex-1 overflow-y-auto p-4 border-r border-slate-700">
                <div className="text-xs text-white mb-3 px-2">单位架构</div>
                {(() => {
                  const toggleNode = (id: string) => {
                    setExpandedOrgNodes(prev => {
                      const next = new Set(prev);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    });
                  };
                  
                  const toggleSelectPerson = (person: PersonNode) => {
                    const exists = selectedPersons.find(p => p.id === person.id);
                    if (exists) {
                      setSelectedPersons(selectedPersons.filter(p => p.id !== person.id));
                    } else {
                      setSelectedPersons([...selectedPersons, person]);
                    }
                  };
                  
                  const renderOrgNode = (node: OrgNode, level: number = 0) => {
                    if (node.type === 'person' && node.data) {
                      const matchesSearch = recipientSearch === '' || 
                        node.data.name.includes(recipientSearch) ||
                        node.data.phone.includes(recipientSearch) ||
                        node.data.project.includes(recipientSearch) ||
                        node.data.team.includes(recipientSearch) ||
                        node.data.employeeId.includes(recipientSearch);
                      if (!matchesSearch) return null;
                    }
                    
                    const hasChildren = node.children && node.children.length > 0;
                    const isExpanded = expandedOrgNodes.has(node.id);
                    const isSelected = node.type === 'person' && node.data && 
                      selectedPersons.some(p => p.id === node.data!.id);
                    
                    const hasVisibleChildren = hasChildren && node.children!.some(child => {
                      function hasVisible(node: OrgNode): boolean {
                        if (node.type === 'person' && node.data) {
                          return recipientSearch === '' || 
                            node.data.name.includes(recipientSearch) ||
                            node.data.phone.includes(recipientSearch) ||
                            node.data.project.includes(recipientSearch) ||
                            node.data.team.includes(recipientSearch) ||
                            node.data.employeeId.includes(recipientSearch);
                        }
                        return node.children ? node.children.some(hasVisible) : false;
                      }
                      return hasVisible(child);
                    });
                    if (!hasVisibleChildren && node.type !== 'person') return null;
                    
                    return (
                      <div key={node.id}>
                        <div 
                          className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-slate-700/50 rounded transition-colors text-white ${
                            isSelected ? 'bg-cyan-500/20 text-cyan-300' : ''
                          }`}
                          style={{ paddingLeft: `${level * 18 + 8}px` }}
                        >
                          {hasChildren ? (
                            <button onClick={(e) => { e.stopPropagation(); toggleNode(node.id); }} 
                              className="p-0.5 hover:bg-slate-600 rounded">
                              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </button>
                          ) : (
                            <span className="w-[22px]" />
                          )}
                          {node.type === 'person' && node.data ? (
                            <input 
                              type="checkbox" 
                              checked={isSelected}
                              onChange={() => toggleSelectPerson(node.data!)}
                              className="w-4 h-4 accent-cyan-500"
                            />
                          ) : (
                            <span className="w-4" />
                          )}
                          <span className="text-sm truncate flex-1">{node.name}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                            node.type === 'company' ? 'bg-blue-500/20 text-blue-400' :
                            node.type === 'project' ? 'bg-purple-500/20 text-purple-400' :
                            node.type === 'team' ? 'bg-green-500/20 text-green-400' :
                            'bg-slate-500/20 text-slate-400'
                          }`}>
                            {node.type === 'company' ? '分公司' : node.type === 'project' ? '项目' : 
                             node.type === 'team' ? '作业队' : '人员'}
                          </span>
                        </div>
                        {hasChildren && isExpanded && node.children!.map(child => renderOrgNode(child, level + 1))}
                      </div>
                    );
                  };
                  
                  return orgTreeData.map(node => renderOrgNode(node));
                })()}
              </div>
              
              <div className="w-56 p-4 bg-slate-800/30">
                <div className="text-xs text-white mb-3">
                  已选择 <span className="text-cyan-400 font-semibold">{selectedPersons.length}</span> 人
                </div>
                <div className="space-y-1.5 max-h-[320px] overflow-y-auto">
                  {selectedPersons.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-xs">
                      从左侧选择人员
                    </div>
                  ) : (
                    selectedPersons.map(person => (
                      <div key={person.id} className="flex items-center gap-2 p-2 bg-slate-700/50 rounded-lg">
                        <div className="w-7 h-7 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-400 text-xs font-medium">
                          {person.name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-white truncate">{person.name}</div>
                          <div className="text-[10px] text-slate-500 truncate">{person.phone}</div>
                        </div>
                        <button
                          onClick={() => setSelectedPersons(selectedPersons.filter(p => p.id !== person.id))}
                          className="p-0.5 hover:bg-slate-600 rounded text-slate-500 hover:text-red-400"
                        >
                          ✕
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
            
            <div className="p-4 border-t border-slate-700 flex gap-3">
              <button 
                onClick={() => setShowAddRecipientModal(false)}
                className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium transition-all text-white"
              >
                取消
              </button>
              <button 
                onClick={() => {
                  const newRecipients = selectedPersons.map(p => ({
                    name: p.name,
                    phone: p.phone,
                    level: 'severe' as const,
                    enabled: true
                  }));
                  const existingPhones = settings.notificationRecipients.map(r => r.phone);
                  const uniqueNew = newRecipients.filter(r => !existingPhones.includes(r.phone));
                  setSettings({
                    ...settings,
                    notificationRecipients: [...settings.notificationRecipients, ...uniqueNew]
                  });
                  setShowAddRecipientModal(false);
                  setSelectedPersons([]);
                }}
                disabled={selectedPersons.length === 0}
                className="flex-1 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-600 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-all text-white"
              >
                确认添加 {selectedPersons.length > 0 && `(${selectedPersons.length}人)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 本地磁盘配置模态框 */}
      {showLocalModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999]">
          <div className="bg-slate-900 rounded-2xl border border-slate-700 p-6 w-full max-w-md mx-4 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-white">添加本地备份路径</h3>
              <button 
                onClick={() => setShowLocalModal(false)}
                className="text-slate-400 hover:text-white text-xl"
              >
                ×
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-300 mb-2">显示名称</label>
                <input 
                  type="text"
                  placeholder="例如：D盘备份存储"
                  value={localConfig.name}
                  onChange={(e) => setLocalConfig({...localConfig, name: e.target.value})}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-300 mb-2">存储路径</label>
                <div className="flex gap-2">
                  <input 
                    type="text"
                    placeholder="D:\\backup_storage"
                    value={localConfig.path}
                    onChange={(e) => setLocalConfig({...localConfig, path: e.target.value})}
                    className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 font-mono"
                  />
                  <button 
                    onClick={() => {
                      console.log('点击文件夹选择');
                      
                      fetch('/api/backup/browse/folder')
                        .then(r => {
                          if (r.status === 404) {
                            throw new Error('请重启后端加载新接口');
                          }
                          return r.json();
                        })
                        .then(r => {
                          console.log('文件夹选择结果:', r);
                          if (r.success && r.path) {
                            setLocalConfig({...localConfig, path: r.path});
                          }
                        })
                        .catch(e => {
                          console.log('文件夹选择不可用:', e.message);
                        });
                    }}
                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm text-white transition-all cursor-pointer"
                  >
                    选择
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  点击【选择】弹出系统文件夹对话框，或手动输入路径：D:\、E:\、\\NAS\share 等
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button 
                onClick={() => setShowLocalModal(false)}
                className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium transition-all text-white"
              >
                取消
              </button>
              <button 
                onClick={() => {
                  console.log('点击添加备份路径，参数：', localConfig);
                  
                  if (!localConfig.name || !localConfig.path) {
                    console.log('请填写完整配置');
                    return;
                  }
                  
                  fetch('/api/backup/storage/paths', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                      ...localConfig,
                      type: 'mirror'
                    })
                  })
                  .then(r => {
                    console.log('后端返回状态:', r.status, r.statusText);
                    
                    if (r.status === 404 || r.status === 502) {
                      throw new Error('后端服务未启动');
                    }
                    if (!r.ok) {
                      throw new Error('HTTP错误: ' + r.status);
                    }
                    
                    return r.text();
                  })
                  .then(text => {
                    console.log('响应原文:', text);
                    try {
                      const r = JSON.parse(text);
                      console.log('添加结果：', r);
                      setShowLocalModal(false);
                      setLocalConfig({ path: '', name: '' });
                      refreshStoragePaths();
                    } catch (e) {
                      console.error('后端返回格式错误');
                    }
                  })
                  .catch(e => {
                    console.error('添加失败:', e);
                  });
                }}
                disabled={!localConfig.name || !localConfig.path}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${localConfig.name && localConfig.path ? 'bg-cyan-600 hover:bg-cyan-500 text-white cursor-pointer' : 'bg-slate-700 text-slate-500 cursor-not-allowed'}`}
              >
                ✅ 添加镜像
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 云存储配置模态框 */}
      {showCloudModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999]">
          <div className="bg-slate-900 rounded-2xl border border-slate-700 p-6 w-full max-w-md mx-4 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-white">添加云存储备份</h3>
              <button 
                onClick={() => setShowCloudModal(false)}
                className="text-slate-400 hover:text-white text-xl"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-300 mb-2">云存储类型</label>
                <select 
                  value={cloudConfig.type}
                  onChange={(e) => setCloudConfig({...cloudConfig, type: e.target.value})}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white"
                >
                  <option value="oss">阿里云 OSS</option>
                  <option value="cos">腾讯云 COS</option>
                  <option value="s3">Amazon S3 / MinIO</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-slate-300 mb-2">显示名称</label>
                <input 
                  type="text"
                  placeholder="例如：阿里云北京容灾"
                  value={cloudConfig.name}
                  onChange={(e) => setCloudConfig({...cloudConfig, name: e.target.value})}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-300 mb-2">Endpoint 地域节点</label>
                <input 
                  type="text"
                  placeholder="oss-cn-beijing.aliyuncs.com"
                  value={cloudConfig.endpoint}
                  onChange={(e) => setCloudConfig({...cloudConfig, endpoint: e.target.value})}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-300 mb-2">Bucket 名称</label>
                <input 
                  type="text"
                  placeholder="my-camera-backup"
                  value={cloudConfig.bucket}
                  onChange={(e) => setCloudConfig({...cloudConfig, bucket: e.target.value})}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-300 mb-2">AccessKey / SecretId</label>
                <input 
                  type="text"
                  placeholder="LTAI5txxxxxxx"
                  value={cloudConfig.access_key}
                  onChange={(e) => setCloudConfig({...cloudConfig, access_key: e.target.value})}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-300 mb-2">SecretKey</label>
                <input 
                  type="password"
                  placeholder="****************"
                  value={cloudConfig.secret_key}
                  onChange={(e) => setCloudConfig({...cloudConfig, secret_key: e.target.value})}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-slate-500 font-mono"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button 
                onClick={() => setShowCloudModal(false)}
                className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium transition-all text-white"
              >
                取消
              </button>
              <button 
                onClick={() => {
                  console.log('点击添加云存储备份，参数：', cloudConfig);
                  
                  if (!cloudConfig.name || !cloudConfig.bucket || !cloudConfig.access_key || !cloudConfig.secret_key) {
                    console.log('请填写完整配置');
                    return;
                  }
                  
                  fetch('/api/backup/storage/paths', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                      path: `${cloudConfig.type}://${cloudConfig.bucket}`,
                      ...cloudConfig
                    })
                  })
                  .then(r => {
                    console.log('云存储返回状态:', r.status, r.statusText);
                    
                    if (r.status === 404 || r.status === 502) {
                      throw new Error('后端服务未启动');
                    }
                    if (!r.ok) {
                      throw new Error('HTTP错误: ' + r.status);
                    }
                    
                    return r.text();
                  })
                  .then(text => {
                    console.log('云存储响应原文:', text);
                    try {
                      const r = JSON.parse(text);
                      console.log('云存储添加结果：', r);
                      setShowCloudModal(false);
                      setCloudConfig({
                        type: 'oss',
                        name: '',
                        endpoint: 'oss-cn-beijing.aliyuncs.com',
                        bucket: '',
                        access_key: '',
                        secret_key: '',
                        region: ''
                      });
                      refreshStoragePaths();
                    } catch (e) {
                      console.error('后端返回格式错误');
                    }
                  })
                  .catch(e => {
                    console.error('云存储添加失败:', e);
                  });
                }}
                className="flex-1 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-lg text-sm font-medium transition-all text-white cursor-pointer"
              >
                ✅ 添加镜像
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}