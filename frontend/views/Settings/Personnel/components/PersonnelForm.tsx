import React, { useState } from "react";
import {
  Save,
  UserPlus,
  Image as ImageIcon,
  CornerDownRight,
} from "lucide-react";
import { AdminUser, AdminRole } from "../types";

interface PersonnelFormProps {
  admins: AdminUser[];
  onAdd: (user: AdminUser) => void;
}

export const PersonnelForm: React.FC<PersonnelFormProps> = ({
  admins,
  onAdd,
}) => {
  const [form, setForm] = useState({
    username: "",
    dept: "",
    phone: "",
    password: "",
    role: "Worker" as AdminRole,
    parentId: "",
  });

  const getPotentialSupervisors = (currentRole: AdminRole) => {
    switch (currentRole) {
      case "HQ Manager":
        return [];
      case "Project Manager":
        return admins.filter((a) => a.role === "HQ Manager");
      case "Safety Officer":
        return admins.filter((a) => a.role === "Project Manager");
      case "Worker":
        return admins.filter((a) => a.role === "Safety Officer");
      default:
        return [];
    }
  };

  const getRoleName = (r: AdminRole) => {
    switch (r) {
      case "HQ Manager":
        return "总部负责人";
      case "Project Manager":
        return "项目经理";
      case "Safety Officer":
        return "安全员";
      default:
        return "作业人员";
    }
  };

  const handleAddSubmit = () => {
    if (!form.username || !form.password || !form.dept) {
      alert("请填写完整的必要信息");
      return;
    }

    if (form.role !== "HQ Manager" && !form.parentId) {
      alert("请选择直属上级负责人");
      return;
    }

    const newAdmin: AdminUser & { password?: string } = {
      id: "",
      username: form.username,
      dept: form.dept,
      phone: form.phone,
      password: form.password,
      role: form.role,
      addedDate: "",
      parentId: form.role === "HQ Manager" ? null : form.parentId,
    };

    onAdd(newAdmin);
    setForm({
      username: "",
      dept: "",
      phone: "",
      password: "",
      role: "Worker",
      parentId: "",
    });
  };

  return (
    <div className="flex-1 bg-white border border-gray-200 rounded-xl p-8 flex flex-col overflow-y-auto shadow-sm">
      <h2 className="text-2xl font-bold text-gray-800 mb-6 border-b border-gray-100 pb-5 flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
          <UserPlus className="text-blue-600" size={24} />
        </div>
        添加新人员
      </h2>

      <div className="flex flex-col xl:flex-row gap-10">
        {/* Form Fields */}
        <div className="flex-1 space-y-6">
          <div className="flex gap-4 items-center p-4 bg-gray-50 rounded-xl border border-gray-100">
            <div className="w-16 h-16 bg-white border-2 border-dashed border-gray-200 rounded-full flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:text-blue-500 transition-all group overflow-hidden">
              <ImageIcon
                size={20}
                className="text-gray-400 group-hover:scale-110 transition-transform"
              />
              <span className="text-[9px] text-gray-400 mt-1 uppercase font-bold tracking-tighter">
                Avatar
              </span>
            </div>
            <div className="text-xs text-gray-500 leading-relaxed">
              <span className="font-bold text-gray-700">头像上传</span>
              <br />
              支持 JPG, PNG 格式
              <br />
              建议尺寸 200x200
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div className="col-span-2">
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                人员级别
              </label>
              <select
                value={form.role}
                onChange={(e) =>
                  setForm({
                    ...form,
                    role: e.target.value as AdminRole,
                    parentId: "",
                  })
                }
                className="w-full bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800 focus:ring-2 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all appearance-none cursor-pointer"
              >
                <option value="HQ Manager">总部负责人 (最高权限)</option>
                <option value="Project Manager">项目部负责人 (管理权限)</option>
                <option value="Safety Officer">安全员 (监督权限)</option>
                <option value="Worker">作业人员 (基础权限)</option>
              </select>
            </div>

            {form.role !== "HQ Manager" && (
              <div className="col-span-2 animate-in fade-in slide-in-from-top-2 duration-300">
                <label className="block text-xs font-bold text-blue-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <CornerDownRight size={14} /> 直属上级{" "}
                  <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.parentId}
                  onChange={(e) =>
                    setForm({ ...form, parentId: e.target.value })
                  }
                  className="w-full bg-blue-50/30 border border-blue-200 rounded-lg px-4 py-2.5 text-sm text-gray-800 focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all"
                >
                  <option value="">-- 请选择上级负责人 --</option>
                  {getPotentialSupervisors(form.role).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.username} ({u.dept})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                姓名/账号 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all placeholder:text-gray-300"
                placeholder="请输入姓名"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                归属部门 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.dept}
                onChange={(e) => setForm({ ...form, dept: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all placeholder:text-gray-300"
                placeholder="例如：安保部"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                手机号码
              </label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all placeholder:text-gray-300"
                placeholder="请输入联系方式"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                初始密码 <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 transition-all placeholder:text-gray-300"
                placeholder="设置初始密码"
              />
            </div>
          </div>
        </div>

        {/* Info / Permissions Preview */}
        <div className="w-full xl:w-80 flex flex-col gap-6">
          <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-6 rounded-2xl text-white shadow-xl shadow-blue-200">
            <h3 className="text-sm font-bold opacity-80 uppercase tracking-widest mb-3 italic">
              Permission Info
            </h3>
            <h4 className="text-lg font-bold mb-2">{getRoleName(form.role)}</h4>
            <p className="text-xs opacity-90 leading-relaxed font-medium">
              {form.role === "HQ Manager" &&
                "拥有系统所有模块的完全控制权限，可管理所有项目部。"}
              {form.role === "Project Manager" &&
                "拥有本项目部下辖区域的管理权限，可管理安全员和作业人员。"}
              {form.role === "Safety Officer" &&
                "负责现场安全监督，处理报警信息，查看监控和轨迹。"}
              {form.role === "Worker" &&
                "仅可查看个人信息及相关通知，佩戴智能设备。"}
            </p>
          </div>

          <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100">
            <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">
              Hierarchy Roadmap
            </h4>
            <div className="flex flex-col gap-2 relative pl-2">
              <div className="absolute left-[1.1rem] top-3 bottom-8 w-[1px] bg-gray-200"></div>
              {[
                {
                  label: "总部负责人",
                  color: "bg-red-500",
                  target: "HQ Manager",
                },
                {
                  label: "项目部负责人",
                  color: "bg-orange-500",
                  target: "Project Manager",
                  indent: 4,
                },
                {
                  label: "安全员",
                  color: "bg-blue-500",
                  target: "Safety Officer",
                  indent: 8,
                },
                {
                  label: "作业人员",
                  color: "bg-green-500",
                  target: "Worker",
                  indent: 12,
                },
              ].map((step, idx) => (
                <div
                  key={idx}
                  className={`p-2 rounded-lg border flex items-center gap-2 transition-all relative ${
                    form.role === step.target
                      ? "bg-white border-blue-400 shadow-sm text-blue-600 font-bold translate-x-1"
                      : "bg-transparent border-transparent text-gray-400 opacity-60"
                  }`}
                  style={{ marginLeft: `${step.indent || 0}px` }}
                >
                  {step.indent && (
                    <div className="absolute -left-4 top-1/2 w-4 h-[1px] bg-gray-200"></div>
                  )}
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${step.color}`}
                  ></span>
                  <span className="text-[11px]">
                    {idx + 1}. {step.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-auto space-y-3 pt-4">
            <button
              onClick={handleAddSubmit}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-200 transition-all active:scale-[0.98]"
            >
              <Save size={18} /> 保存人员
            </button>
            <button
              onClick={() =>
                setForm({
                  username: "",
                  dept: "",
                  phone: "",
                  password: "",
                  role: "Worker",
                  parentId: "",
                })
              }
              className="w-full py-3 bg-white hover:bg-gray-50 text-gray-500 border border-gray-200 rounded-xl font-medium transition-all"
            >
              重置表单
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
