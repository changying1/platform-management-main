import { useState, useMemo, useCallback, useEffect } from "react";
import { AdminUser } from "../types";

const API_BASE = "http://localhost:9000";

export function usePersonnelStore() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);

  const fetchPersonnel = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/personnel/`);
      if (!res.ok) {
        throw new Error("获取人员列表失败");
      }

      const data: AdminUser[] = await res.json();
      setAdmins(data);

      const rootExpanded: Record<string, boolean> = {};
      data.forEach((user) => {
        if (user.parentId === null) {
          rootExpanded[user.id] = true;
        }
      });
      setExpandedNodes((prev) => ({ ...rootExpanded, ...prev }));
    } catch (err) {
      console.error(err);
      alert("获取人员列表失败，请检查后端服务和 MongoDB 是否正常启动");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPersonnel();
  }, [fetchPersonnel]);

  const toggleNode = useCallback((userId: string) => {
    setExpandedNodes((prev) => ({
      ...prev,
      [userId]: !prev[userId],
    }));
  }, []);

  const deleteAdmin = useCallback(async (id: string) => {
    if (!confirm("确定要删除该人员吗？其下属人员将失去关联。")) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/personnel/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("删除失败");
      }

      setAdmins((prev) =>
        prev
          .filter((a) => a.id !== id)
          .map((a) => (a.parentId === id ? { ...a, parentId: null } : a))
      );
    } catch (err) {
      console.error(err);
      alert("删除人员失败");
    }
  }, []);

  const addAdmin = useCallback(async (user: AdminUser & { password?: string }) => {
    try {
      const res = await fetch(`${API_BASE}/personnel/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: user.username,
          dept: user.dept,
          phone: user.phone,
          password: user.password || "",
          role: user.role,
          parentId: user.parentId,
        }),
      });

      if (!res.ok) {
        throw new Error("添加失败");
      }

      const created: AdminUser = await res.json();

      setAdmins((prev) => [...prev, created]);

      if (created.parentId) {
        setExpandedNodes((prev) => ({
          ...prev,
          [created.parentId!]: true,
        }));
      }

      alert("人员添加成功！");
    } catch (err) {
      console.error(err);
      alert("添加人员失败，请检查后端服务和 MongoDB");
    }
  }, []);

  const filteredAdmins = useMemo(() => {
    if (!searchTerm) return admins;

    const lowerSearch = searchTerm.toLowerCase();
    const visibleIds = new Set<string>();

    const directMatches = admins.filter(
      (user) =>
        user.username.toLowerCase().includes(lowerSearch) ||
        user.dept.toLowerCase().includes(lowerSearch) ||
        user.phone.includes(searchTerm)
    );

    directMatches.forEach((match) => {
      let current: AdminUser | undefined = match;
      while (current) {
        visibleIds.add(current.id);
        const parentId = current.parentId;
        current = admins.find((a) => a.id === parentId);
      }
    });

    return admins.filter((a) => visibleIds.has(a.id));
  }, [admins, searchTerm]);

  useEffect(() => {
    if (!searchTerm) return;

    const lowerSearch = searchTerm.toLowerCase();
    const newExpanded = { ...expandedNodes };
    let changed = false;

    admins.forEach((user) => {
      const children = admins.filter((a) => a.parentId === user.id);
      const hasMatchingChild = children.some(
        (child) =>
          child.username.toLowerCase().includes(lowerSearch) ||
          child.dept.toLowerCase().includes(lowerSearch) ||
          child.phone.includes(searchTerm)
      );

      if (hasMatchingChild && !newExpanded[user.id]) {
        newExpanded[user.id] = true;
        changed = true;
      }
    });

    if (changed) {
      setExpandedNodes(newExpanded);
    }
  }, [searchTerm, admins]);

  return {
    admins,
    filteredAdmins,
    searchTerm,
    setSearchTerm,
    expandedNodes,
    toggleNode,
    deleteAdmin,
    addAdmin,
    loading,
    refreshPersonnel: fetchPersonnel,
  };
}