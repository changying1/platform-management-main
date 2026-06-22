import { useState } from "react";
import { ProjectFormData, ProjectDetail } from "../types";

export function useProjectForm(initialProject?: ProjectDetail) {
  const [formData, setFormData] = useState<ProjectFormData>({
    name: initialProject?.name || "",
    description: initialProject?.description || "",
    manager: initialProject?.manager || "",
    status: initialProject?.status || "active",
    remark: initialProject?.remark || "",
    branch_id: initialProject?.branch_id,
    user_ids: initialProject?.users.map((u) => u.id) || [],
    device_ids: initialProject?.devices.map((d) => d.id) || [],
    region_ids: initialProject?.regions.map((r) => r.id) || [],
    grid_ids: initialProject?.grid_ids || [],
    team_ids: initialProject?.team_ids || [],
  });

  const updateForm = (updates: Partial<ProjectFormData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  const resetForm = (project?: ProjectDetail) => {
    if (project) {
      setFormData({
        name: project.name,
        description: project.description || "",
        manager: project.manager || "",
        status: project.status,
        remark: project.remark || "",
        branch_id: project.branch_id,
        user_ids: project.users.map((u) => u.id),
        device_ids: project.devices.map((d) => d.id),
        region_ids: project.regions.map((r) => r.id),
        grid_ids: project.grid_ids || [],
        team_ids: project.team_ids || [],
      });
    } else {
      setFormData({
        name: "",
        description: "",
        manager: "",
        status: "active",
        remark: "",
        branch_id: undefined,
        user_ids: [],
        device_ids: [],
        region_ids: [],
        grid_ids: [],
        team_ids: [],
      });
    }
  };

  return { formData, updateForm, resetForm };
}
