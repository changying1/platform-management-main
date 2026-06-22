import { useState, useEffect, useRef, useCallback } from "react";
import { ProjectListItem, ProjectDetail, Fence, Grid, Team } from "../types";
import { getApiUrl, getAuthHeaders } from "@/src/api/config";

const normalizeProjectKey = (value: unknown) => String(value ?? "").trim();

const gridBelongsToProject = (grid: any, project: Pick<ProjectListItem, "id" | "name">) => {
  const projectKeys = new Set([
    normalizeProjectKey(project.id),
    normalizeProjectKey(project.name),
  ].filter(Boolean));

  return [
    normalizeProjectKey(grid.project_id),
    normalizeProjectKey(grid.project),
    normalizeProjectKey(grid.project_name),
  ].some((key) => key && projectKeys.has(key));
};

const teamBelongsToProject = (
  team: any,
  project: Pick<ProjectListItem, "id" | "name">,
  projectGridIds: Set<string>,
) => {
  const projectKeys = new Set([
    normalizeProjectKey(project.id),
    normalizeProjectKey(project.name),
  ].filter(Boolean));

  const directMatch = [
    normalizeProjectKey(team.project_id),
    normalizeProjectKey(team.project),
    normalizeProjectKey(team.project_name),
  ].some((key) => key && projectKeys.has(key));

  return directMatch || projectGridIds.has(normalizeProjectKey(team.grid_id));
};

const gridIdsForProject = (grids: any[], project: Pick<ProjectListItem, "id" | "name">) =>
  new Set(
    grids
      .filter((grid) => gridBelongsToProject(grid, project))
      .flatMap((grid) => [normalizeProjectKey(grid.grid_id), normalizeProjectKey(grid.id)])
      .filter(Boolean),
  );

const withResourceCounts = (projects: ProjectListItem[], grids: any[], teams: any[]) => {
  const counts = new Map<string, number>();

  grids.forEach((grid) => {
    const keys = [
      normalizeProjectKey(grid.project_id),
      normalizeProjectKey(grid.project),
      normalizeProjectKey(grid.project_name),
    ].filter(Boolean);

    new Set(keys).forEach((key) => {
      counts.set(key, (counts.get(key) || 0) + 1);
    });
  });

  return projects.map((project) => ({
    ...project,
    grid_count: project.grid_count ?? counts.get(normalizeProjectKey(project.id)) ?? counts.get(normalizeProjectKey(project.name)) ?? 0,
    team_count:
      project.team_count ??
      teams.filter((team) => teamBelongsToProject(team, project, gridIdsForProject(grids, project))).length,
  }));
};

export function useProjectLogic() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [expandedProjectId, setExpandedProjectId] = useState<number | null>(
    null,
  );
  const [projectDetail, setProjectDetail] = useState<ProjectDetail | null>(
    null,
  );
  const [projectFences, setProjectFences] = useState<Fence[]>([]);
  const [projectGrids, setProjectGrids] = useState<Grid[]>([]);
  const [projectTeams, setProjectTeams] = useState<Team[]>([]);
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
      const res = await fetch(url, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch projects");
      const data = await res.json();
      const gridsRes = await fetch(getApiUrl("/api/grids/"), { headers: getAuthHeaders() });
      const grids = gridsRes.ok ? await gridsRes.json() : [];
      const teamsRes = await fetch(getApiUrl("/team/teams"), { headers: getAuthHeaders() });
      const teams = teamsRes.ok ? await teamsRes.json() : [];
      setProjects(withResourceCounts(
        Array.isArray(data) ? data : [],
        Array.isArray(grids) ? grids : [],
        Array.isArray(teams) ? teams : [],
      ));
    } catch (error) {
      console.error("Error fetching projects:", error);
    } finally {
      setLoading(false);
    }
  };

  const triggerSearch = useCallback((branchId?: number | null, search?: string) => {
    fetchProjects(
      search ?? searchQueryRef.current,
      branchId === undefined ? selectedBranchIdRef.current : branchId,
    );
  }, []);

  const fetchProjectDetail = async (projectId: number) => {
    try {
      const res = await fetch(getApiUrl(`/projects/${projectId}`), { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch project detail");
      const data = await res.json();
      setProjectDetail(data);
      return data;
    } catch (error) {
      console.error("Error fetching project detail:", error);
      return null;
    }
  };

  const fetchProjectFences = async (projectId: number) => {
    try {
      const res = await fetch(getApiUrl(`/projects/${projectId}/fences`), { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch project fences");
      const data = await res.json();
      setProjectFences(data);
    } catch (error) {
      console.error("Error fetching project fences:", error);
    }
  };

  const fetchProjectGrids = async (project: ProjectListItem | number) => {
    try {
      const projectInfo =
        typeof project === "number"
          ? projects.find((item) => item.id === project) || { id: project, name: "" }
          : project;
      const res = await fetch(getApiUrl("/api/grids/"), { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch project grids");
      const data = await res.json();
      const grids = Array.isArray(data) ? data.filter((grid) => gridBelongsToProject(grid, projectInfo)) : [];
      setProjectGrids(grids);
      return grids;
    } catch (error) {
      console.error("Error fetching project grids:", error);
      setProjectGrids([]);
      return [];
    }
  };

  const fetchProjectTeams = async (project: ProjectListItem | number) => {
    try {
      const projectInfo =
        typeof project === "number"
          ? projects.find((item) => item.id === project) || { id: project, name: "" }
          : project;
      const [gridsRes, teamsRes] = await Promise.all([
        fetch(getApiUrl("/api/grids/"), { headers: getAuthHeaders() }),
        fetch(getApiUrl("/team/teams"), { headers: getAuthHeaders() }),
      ]);
      const grids = gridsRes.ok ? await gridsRes.json() : [];
      const teams = teamsRes.ok ? await teamsRes.json() : [];
      const projectGridIds = gridIdsForProject(Array.isArray(grids) ? grids : [], projectInfo);
      const projectTeams = Array.isArray(teams)
        ? teams.filter((team) => teamBelongsToProject(team, projectInfo, projectGridIds))
        : [];
      setProjectTeams(projectTeams);
      return projectTeams;
    } catch (error) {
      console.error("Error fetching project teams:", error);
      setProjectTeams([]);
      return [];
    }
  };

  const deleteProject = async (projectId: number) => {
    if (!confirm("确定要删除此项目吗？")) return;

    try {
      const res = await fetch(getApiUrl(`/projects/${projectId}`), {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to delete project");
      fetchProjects(searchQueryRef.current, selectedBranchIdRef.current);
      if (expandedProjectId === projectId) {
        setExpandedProjectId(null);
        setProjectDetail(null);
        setProjectFences([]);
        setProjectGrids([]);
        setProjectTeams([]);
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
      setProjectGrids([]);
      setProjectTeams([]);
    } else {
      const project = projects.find((item) => item.id === projectId);
      setExpandedProjectId(projectId);
      await fetchProjectDetail(projectId);
      await fetchProjectFences(projectId);
      await fetchProjectGrids(project || projectId);
      await fetchProjectTeams(project || projectId);
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
    projectGrids,
    projectTeams,
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
    fetchProjectGrids,
    fetchProjectTeams,
  };
}
