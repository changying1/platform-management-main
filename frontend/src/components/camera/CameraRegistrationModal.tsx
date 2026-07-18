import React, { useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { CheckCircle2, Eye, EyeOff, Loader, XCircle } from 'lucide-react';
import {
  createAndRegisterCamera,
  type CameraRegistrationRequest,
  type CameraRegistrationResponse,
  type RegistrationStepResult,
} from '../../api/cameraRegistrationApi';
import type { ResponsibilityUnit } from '../../api/responsibilityUnitApi';
import { parseCameraQrContent } from '../../utils/cameraQrParser';

interface CameraRegistrationModalProps {
  open: boolean;
  orgUnits: ResponsibilityUnit[];
  onClose: () => void;
  onLocalSaved: () => Promise<void> | void;
}

type FormState = CameraRegistrationRequest & { location?: string };

const initialForm: FormState = {
  name: '',
  device_type: 'dome',
  device_serial: '',
  camera_password: '',
  sim_card_id: '',
  channel_no: 1,
  location: '',
  branch_id: '',
  company: '',
  project_id: '',
  project: '',
  grid_id: '',
  grid: '',
  team_id: '',
  team: '',
  username: '',
  remark: '',
};

const unitId = (unit?: Pick<ResponsibilityUnit, 'unit_id' | 'id'>) => String(unit?.unit_id || unit?.id || '');

const statusClass = (result?: RegistrationStepResult) => {
  if (!result) return 'border-slate-700 bg-slate-800/40 text-slate-300';
  if (result.status === 'success') return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300';
  if (result.status === 'skipped') return 'border-amber-400/30 bg-amber-500/10 text-amber-200';
  return 'border-red-400/30 bg-red-500/10 text-red-300';
};

export default function CameraRegistrationModal({
  open,
  orgUnits,
  onClose,
  onLocalSaved,
}: CameraRegistrationModalProps) {
  const [form, setForm] = useState<FormState>(initialForm);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<CameraRegistrationResponse | null>(null);
  const [qrText, setQrText] = useState('');

  const branches = orgUnits.filter(unit => unit.type === 'branch');
  const projects = orgUnits.filter(unit => unit.type === 'project');
  const grids = orgUnits.filter(unit => unit.type === 'grid');
  const teams = orgUnits.filter(unit => unit.type === 'team');

  const filteredProjects = useMemo(() => (
    form.branch_id ? projects.filter(project => String(project.parent_id || '') === form.branch_id) : projects
  ), [form.branch_id, projects]);

  const filteredGrids = useMemo(() => (
    form.project_id ? grids.filter(grid => String(grid.project_id || grid.parent_id || '') === form.project_id) : grids
  ), [form.project_id, grids]);

  const filteredTeams = useMemo(() => (
    form.grid_id
      ? teams.filter(team => String(team.grid_id || team.parent_id || '') === form.grid_id)
      : teams
  ), [form.grid_id, teams]);

  if (!open) return null;

  const updateForm = (patch: Partial<FormState>) => setForm(prev => ({ ...prev, ...patch }));

  const closeModal = () => {
    if (submitting) return;
    setForm(initialForm);
    setQrText('');
    setNotice(null);
    setResult(null);
    onClose();
  };

  const handleQrText = (raw: string) => {
    setQrText(raw);
    const parsed = parseCameraQrContent(raw);
    updateForm({
      ...(parsed.deviceSerial ? { device_serial: parsed.deviceSerial } : {}),
      ...(parsed.simCardId ? { sim_card_id: parsed.simCardId } : {}),
    });
  };

  const submit = async () => {
    if (submitting) return;
    setNotice(null);
    setResult(null);
    if (!form.name.trim()) return setNotice('请填写设备名称');
    if (!form.device_serial.trim()) return setNotice('请填写设备序列号');
    if (!form.camera_password.trim()) return setNotice('请填写摄像头密码');

    setSubmitting(true);
    try {
      const payload: CameraRegistrationRequest = {
        ...form,
        name: form.name.trim(),
        device_serial: form.device_serial.trim(),
        camera_password: form.camera_password.trim(),
        sim_card_id: form.sim_card_id?.trim() || undefined,
        channel_no: Number(form.channel_no) || 1,
        status: 'offline',
      };
      const response = await createAndRegisterCamera(payload);
      if (response.local.success) await onLocalSaved();
      setResult(response);
    } catch (error: any) {
      const response = error?.response as CameraRegistrationResponse | undefined;
      if (response?.local) {
        setResult(response);
      } else {
        setNotice(error?.message || '保存并注册失败');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const headline = result
    ? result.partial_success
      ? '摄像头已保存，但部分平台注册失败'
      : result.success
        ? '摄像头添加成功'
        : '摄像头新增失败'
    : null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[110] bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-slate-900 border border-cyan-300/30 rounded-lg w-full max-w-3xl max-h-[90vh] overflow-auto p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-slate-100">添加摄像头</h3>
          <button disabled={submitting} onClick={closeModal} className="text-slate-400 hover:text-slate-200 disabled:opacity-40">
            <XCircle size={20} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="设备名称" required value={form.name} onChange={value => updateForm({ name: value })} />
          <Select
            label="设备类型"
            value={form.device_type || 'dome'}
            onChange={value => updateForm({ device_type: value })}
            options={[['dome', '球机摄像头'], ['bullet', '枪机摄像头'], ['bodycam', '执法记录仪'], ['drone', '无人机']]}
          />
          <Field label="设备序列号" required value={form.device_serial} mono onChange={value => updateForm({ device_serial: value })} />
          <div>
            <label className="block text-sm text-slate-400 mb-1">摄像头密码 <span className="text-red-400">*</span></label>
            <div className="flex">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={form.camera_password}
                onChange={e => updateForm({ camera_password: e.target.value })}
                className="w-full bg-slate-800/50 border border-slate-700 rounded-l-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
              />
              <button
                type="button"
                onClick={() => setShowPassword(value => !value)}
                className="w-10 border border-l-0 border-slate-700 rounded-r-lg bg-slate-800/70 text-slate-300 flex items-center justify-center"
                title={showPassword ? '隐藏摄像头密码' : '显示摄像头密码'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-1">请输入摄像头机身标签上的密码，用于注册萤石云</p>
          </div>
          <Field label="SIM 卡号" value={form.sim_card_id || ''} mono onChange={value => updateForm({ sim_card_id: value })} />
          <Field label="通道号" type="number" value={String(form.channel_no || 1)} onChange={value => updateForm({ channel_no: Number(value) || 1 })} />
          <Field label="安装位置" value={form.location || ''} onChange={value => updateForm({ location: value })} />
          <Select label="所属分公司" value={form.branch_id || ''} options={branches.map(unit => [unitId(unit), unit.name])} onChange={value => {
            const unit = branches.find(item => unitId(item) === value);
            updateForm({ branch_id: value, company: unit?.name || '', project_id: '', project: '', grid_id: '', grid: '', team_id: '', team: '' });
          }} />
          <Select label="所属项目" value={form.project_id || ''} options={filteredProjects.map(unit => [unitId(unit), unit.name])} onChange={value => {
            const unit = projects.find(item => unitId(item) === value);
            updateForm({ project_id: value, project: unit?.name || '', grid_id: '', grid: '', team_id: '', team: '' });
          }} />
          <Select label="所属网格" value={form.grid_id || ''} options={filteredGrids.map(unit => [unitId(unit), unit.name])} onChange={value => {
            const unit = grids.find(item => unitId(item) === value);
            updateForm({ grid_id: value, grid: unit?.name || '', team_id: '', team: '' });
          }} />
          <Select label="所属工队" value={form.team_id || ''} options={filteredTeams.map(unit => [unitId(unit), unit.name])} onChange={value => {
            const unit = teams.find(item => unitId(item) === value);
            updateForm({ team_id: value, team: unit?.name || '' });
          }} />
          <Field label="管理员" value={form.username || ''} onChange={value => updateForm({ username: value })} />
          <div className="col-span-2">
            <Field label="备注" value={form.remark || ''} onChange={value => updateForm({ remark: value })} />
          </div>
          <div className="col-span-2">
            <Field label="二维码内容" value={qrText} placeholder="粘贴扫码结果后回填序列号和 SIM 卡号" onChange={handleQrText} />
          </div>
        </div>

        {notice && <div className="mt-5 rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{notice}</div>}

        {result && (
          <div className="mt-5 space-y-3">
            <div className={`rounded-lg border px-4 py-3 text-sm ${result.partial_success ? 'border-amber-400/30 bg-amber-500/10 text-amber-200' : result.success ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300' : 'border-red-400/30 bg-red-500/10 text-red-300'}`}>
              {headline}
            </div>
            <Step label="本地系统" result={result.local} />
            <Step label="萤石云" result={result.ezviz} />
            <Step label="海康流量卡" result={result.hikiot} />
          </div>
        )}

        <div className="flex gap-3 mt-6">
          <button
            onClick={submit}
            disabled={submitting || !!result}
            className="flex-1 bg-cyan-500 hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60 py-2 rounded text-sm font-bold text-slate-900"
          >
            {submitting ? <span className="inline-flex items-center gap-2"><Loader size={16} className="animate-spin" />正在保存并注册...</span> : '保存并注册'}
          </button>
          <button onClick={closeModal} disabled={submitting} className="flex-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-60 py-2 rounded text-sm text-slate-100">
            {result?.success && !result.partial_success ? '完成' : '关闭'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  type = 'text',
  mono,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  mono?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm text-slate-400 mb-1">{label} {required && <span className="text-red-400">*</span>}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={event => onChange(event.target.value)}
        className={`w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400 ${mono ? 'font-mono' : ''}`}
      />
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <div>
      <label className="block text-sm text-slate-400 mb-1">{label}</label>
      <select
        value={value}
        onChange={event => onChange(event.target.value)}
        className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-400"
      >
        <option value="">请选择</option>
        {options.map(([optionValue, labelText]) => (
          <option key={optionValue} value={optionValue}>{labelText}</option>
        ))}
      </select>
    </div>
  );
}

function Step({ label, result }: { label: string; result: RegistrationStepResult }) {
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm flex items-start gap-2 ${statusClass(result)}`}>
      <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
      <div><span className="font-semibold">{label}：</span>{result.message}</div>
    </div>
  );
}
