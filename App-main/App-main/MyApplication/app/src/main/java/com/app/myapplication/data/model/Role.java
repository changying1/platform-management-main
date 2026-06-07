package com.app.myapplication.data.model;

import java.util.ArrayList;
import java.util.List;

/**
 * 角色 - 与 Web 端 Role 接口对齐
 * 对应 Web 端: interface Role { id, name, code, level, company, project, team, description }
 */
public class Role {
    
    private String id;
    private String name;
    private String code;        // 角色代码（如 username）
    private String level;       // headquarters_admin, branch_admin, project_safety_admin, grid_admin, team_admin
    private String company;     // 所属分公司
    private String project;     // 所属项目
    private String team;        // 所属工队
    private String description; // 角色描述
    
    // 树形结构相关
    private boolean expanded = true;
    private List<Role> children = new ArrayList<>();
    private String parentId;    // 父节点ID（用于简单层级）
    
    public Role(String id, String name, String level) {
        this.id = id;
        this.name = name;
        this.level = level;
    }
    
    public Role(String id, String name, String code, String level, 
                String company, String project, String team, String description) {
        this.id = id;
        this.name = name;
        this.code = code;
        this.level = level;
        this.company = company;
        this.project = project;
        this.team = team;
        this.description = description;
    }
    
    // Getters and Setters
    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    
    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
    
    public String getLevel() { return level; }
    public void setLevel(String level) { this.level = level; }
    
    public String getCompany() { return company; }
    public void setCompany(String company) { this.company = company; }
    
    public String getProject() { return project; }
    public void setProject(String project) { this.project = project; }
    
    public String getTeam() { return team; }
    public void setTeam(String team) { this.team = team; }
    
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    
    public boolean isExpanded() { return expanded; }
    public void setExpanded(boolean expanded) { this.expanded = expanded; }
    
    public List<Role> getChildren() { return children; }
    public void setChildren(List<Role> children) { this.children = children; }
    
    public String getParentId() { return parentId; }
    public void setParentId(String parentId) { this.parentId = parentId; }
    
    public void addChild(Role child) {
        children.add(child);
    }
    
    /**
     * 获取显示名称（带代码）
     * 与 Web 端对齐: `${role.name}${role.name === role.code ? '' : `（${role.code}）`}`
     */
    public String getDisplayName() {
        if (name == null || code == null) {
            return name != null ? name : (code != null ? code : "");
        }
        if (name.equals(code)) {
            return name;
        }
        return name + "（" + code + "）";
    }
    
    /**
     * 获取层级排名（与 Web 端 ROLE_RANK 对齐）
     */
    public static int getRoleRank(String level) {
        switch (level) {
            case "team_admin": return 1;
            case "grid_admin": return 2;
            case "project_safety_admin": return 3;
            case "branch_admin": return 4;
            case "headquarters_admin": return 5;
            default: return 0;
        }
    }
    
    /**
     * 获取层级标签（与 Web 端 levelLabel 对齐）
     */
    public static String getLevelLabel(String level) {
        switch (level) {
            case "headquarters_admin": return "总部管理员";
            case "branch_admin": return "分公司管理员";
            case "project_safety_admin": return "项目管理员";
            case "grid_admin": return "网格管理员";
            case "team_admin": return "工队管理员";
            default: return "";
        }
    }
    
    /**
     * 检查当前角色是否可以管理目标角色
     * 与 Web 端 getAllowedLevels 逻辑对齐
     */
    public boolean canManage(String targetLevel) {
        return getRoleRank(this.level) >= getRoleRank(targetLevel);
    }
}
