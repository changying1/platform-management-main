import { useState, useEffect, useRef, useCallback } from "react";
import { ProjectListItem, ProjectDetail, Fence } from "../types";
import { getApiUrl } from "@/src/api/config";

export function useProjectLogic() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [expandedProjectId, setExpandedProjectId] = useState<number | null>(
    null,
  );
  const [projectDetail, setProjectDetail] = useState<ProjectDetail | null>(
    null,
  );
  const [projectFences, setProjectFences] = useState<Fence[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const searchQueryRef = useRef(searchQuery);
  const selectedBranchIdRef = useRef(selectedBranchId);

  useEffect(() => {
    searchQueryRef.current = searchQuery;
  }, [searchQuery]);

  useEffect(() => {
    selectedBranchIdRef.current = selectedBranchId;
  }, [selectedBranchId]);

  const fetchProjects = async (search?: string, branchId?: number | null) => {
    try {
      setLoading(true);
      let url = getApiUrl("/projects/");
      const params: string[] = [];
      if (search) {
        params.push(`search=${encodeURIComponent(search)}`);
      }
      if (branchId !== null && branchId !== undefined) {
        params.push(`branch_id=${branchId}`);
      }
      if (params.length > 0) {
        url += `?${params.join("&")}`;
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch projects");
      const data = await res.json();
      setProjects(data);
    } catch (error) {
      console.error("Error fetching projects:", error);
    } finally {
      setLoading(false);
    }
  };

  const triggerSearch = useCallback(() => {
    fetchProjects(searchQueryRef.current, selectedBranchIdRef.current);
  }, []);

  const fetchProjectDetail = async (projectId: number) => {
    try {
      const res = await fetch(getApiUrl(`/projects/${projectId}`));
      if (!res.ok) throw new Error("Failed to fetch project detail");
      const data = await res.json();
      setProjectDetail(data);
    } catch (error) {
      console.error("Error fetching project detail:", error);
    }
  };

  const fetchProjectFences = async (projectId: number) => {
    try {
      const res = await fetch(getApiUrl(`/projects/${projectId}/fences`));
      if (!res.ok) throw new Error("Failed to fetch project fences");
      const data = await res.json();
      setProjectFences(data);
    } catch (error) {
      console.error("Error fetching project fences:", error);
    }
  };

  const deleteProject = async (projectId: number) => {
    if (!confirm("确定要删除此项目吗？")) return;

    try {
      const res = await fetch(getApiUrl(`/projects/${projectId}`), {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete project");
      fetchProjects(searchQueryRef.current, selectedBranchIdRef.current);
      if (expandedProjectId === projectId) {
        setExpandedProjectId(null);
        setProjectDetail(null);
        setProjectFences([]);
      }
    } catch (error) {
      console.error("Error deleting project:", error);
      alert("删除失败");
    }
  };

  const toggleProject = async (projectId: number) => {
    if (expandedProjectId === projectId) {
      setExpandedProjectId(null);
      setProjectDetail(null);
      setProjectFences([]);
    } else {
      setExpandedProjectId(projectId);
      await fetchProjectDetail(projectId);
      await fetchProjectFences(projectId);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  return {
    projects,
    expandedProjectId,
    projectDetail,
    projectFences,
    searchQuery,
    selectedBranchId,
    loading,
    setSearchQuery,
    setSelectedBranchId,
    fetchProjects,
    triggerSearch,
    deleteProject,
    toggleProject,
    fetchProjectDetail,
    fetchProjectFences,
  };
}