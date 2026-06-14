package com.app.myapplication.data.model;

import java.util.ArrayList;
import java.util.List;

/**
 * 角色树节点 - 与 Web 端 RoleTreeNode 对齐
 * 对应 Web 端: interface RoleTreeNode { id, name, type, children?, roleId? }
 */
public class RoleTreeNode {
    
    public enum NodeType {
        COMPANY,    // 公司/分公司
        PROJECT,    // 项目
        TEAM,       // 工队
        ROLE        // 角色
    }
    
    private String id;
    private String name;
    private NodeType type;
    private String roleId;      // 当 type 为 ROLE 时，对应 Role.id
    private List<RoleTreeNode> children = new ArrayList<>();
    private boolean expanded = true;
    private int depth = 0;      // 层级深度，用于UI缩进
    
    public RoleTreeNode(String id, String name, NodeType type) {
        this.id = id;
        this.name = name;
        this.type = type;
    }
    
    public RoleTreeNode(String id, String name, NodeType type, String roleId) {
        this.id = id;
        this.name = name;
        this.type = type;
        this.roleId = roleId;
    }
    
    // Getters and Setters
    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    
    public NodeType getType() { return type; }
    public void setType(NodeType type) { this.type = type; }
    
    public String getRoleId() { return roleId; }
    public void setRoleId(String roleId) { this.roleId = roleId; }
    
    public List<RoleTreeNode> getChildren() { return children; }
    public void setChildren(List<RoleTreeNode> children) { this.children = children; }
    
    public boolean isExpanded() { return expanded; }
    public void setExpanded(boolean expanded) { this.expanded = expanded; }
    
    public int getDepth() { return depth; }
    public void setDepth(int depth) { this.depth = depth; }
    
    public void addChild(RoleTreeNode child) {
        children.add(child);
    }
    
    public boolean hasChildren() {
        return children != null && !children.isEmpty();
    }
    
    /**
     * 根据角色列表构建角色树 - 与 Web 端 buildRoleTreeFromAccounts 对齐
     */
    public static List<RoleTreeNode> buildRoleTreeFromAccounts(List<Role> accountRoles) {
        RoleTreeNode hq = new RoleTreeNode("hq", "总部", NodeType.COMPANY);
        java.util.Map<String, RoleTreeNode> companyMap = new java.util.HashMap<>();
        java.util.Map<String, RoleTreeNode> projectMap = new java.util.HashMap<>();
        java.util.Map<String, RoleTreeNode> teamMap = new java.util.HashMap<>();
        
        for (Role role : accountRoles) {
            if (role.getLevel() == null) continue;
            
            RoleTreeNode roleNode = new RoleTreeNode(
                "role-" + role.getId(),
                role.getDisplayName(),
                NodeType.ROLE,
                role.getId()
            );
            
            // 总部管理员直接挂在总部下
            if ("headquarters_admin".equals(role.getLevel())) {
                hq.addChild(roleNode);
                continue;
            }
            
            // 获取或创建公司节点
            String company = getGroupName(role.getCompany(), "未分配公司");
            String companyKey = "company-" + company;
            RoleTreeNode companyNode = companyMap.get(companyKey);
            if (companyNode == null) {
                companyNode = new RoleTreeNode(companyKey, company, NodeType.COMPANY);
                companyMap.put(companyKey, companyNode);
            }
            
            // 分公司管理员直接挂在公司下
            if ("branch_admin".equals(role.getLevel())) {
                companyNode.addChild(roleNode);
                continue;
            }
            
            // 获取或创建项目节点
            String project = getGroupName(role.getProject(), "未分配项目");
            String projectKey = companyKey + "::" + project;
            RoleTreeNode projectNode = projectMap.get(projectKey);
            if (projectNode == null) {
                projectNode = new RoleTreeNode("project-" + projectKey, project, NodeType.PROJECT);
                projectMap.put(projectKey, projectNode);
                companyNode.addChild(projectNode);
            }
            
            // 项目管理员直接挂在项目下
            if ("project_safety_admin".equals(role.getLevel())) {
                projectNode.addChild(roleNode);
                continue;
            }
            
            // 获取或创建工队节点
            String team = getGroupName(role.getTeam(), "未分配工队");
            String teamKey = projectKey + "::" + team;
            RoleTreeNode teamNode = teamMap.get(teamKey);
            if (teamNode == null) {
                teamNode = new RoleTreeNode("team-" + teamKey, team, NodeType.TEAM);
                teamMap.put(teamKey, teamNode);
                projectNode.addChild(teamNode);
            }
            
            // 网格管理员和工队管理员挂在工队下
            teamNode.addChild(roleNode);
        }
        
        // 组装最终树
        List<RoleTreeNode> result = new ArrayList<>();
        if (hq.hasChildren()) {
            result.add(hq);
        }
        result.addAll(companyMap.values());
        
        return result;
    }
    
    /**
     * 获取组名称（与 Web 端 getGroupName 对齐）
     */
    private static String getGroupName(String value, String fallback) {
        if (value == null) return fallback;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? fallback : trimmed;
    }
}
