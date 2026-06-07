package com.app.myapplication.data.model;

import java.util.ArrayList;
import java.util.List;

/**
 * 责任单元 - 对应 Web 端 ResponsibilityUnit
 * 公司/项目/网格/工队的树形结构
 */
public class ResponsibilityUnit {
    
    private String id;
    private String name;
    private String type; // company, project, grid, team
    private String parentId;
    private List<ResponsibilityUnit> children;
    private boolean expanded = true;
    
    // 额外信息
    private String managerName;
    private String managerPhone;
    private String responsiblePerson;
    private int personnelCount;
    private int deviceCount;
    
    public ResponsibilityUnit(String id, String name, String type, String parentId) {
        this.id = id;
        this.name = name;
        this.type = type;
        this.parentId = parentId;
        this.children = new ArrayList<>();
    }
    
    public void addChild(ResponsibilityUnit child) {
        children.add(child);
    }
    
    // Getters and Setters
    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    
    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    
    public String getParentId() { return parentId; }
    public void setParentId(String parentId) { this.parentId = parentId; }
    
    public List<ResponsibilityUnit> getChildren() { return children; }
    public void setChildren(List<ResponsibilityUnit> children) { this.children = children; }
    
    public boolean isExpanded() { return expanded; }
    public void setExpanded(boolean expanded) { this.expanded = expanded; }
    
    public String getManagerName() { return managerName; }
    public void setManagerName(String managerName) { this.managerName = managerName; }
    
    public String getManagerPhone() { return managerPhone; }
    public void setManagerPhone(String managerPhone) { this.managerPhone = managerPhone; }
    
    public String getResponsiblePerson() { return responsiblePerson; }
    public void setResponsiblePerson(String responsiblePerson) { this.responsiblePerson = responsiblePerson; }
    
    public int getPersonnelCount() { return personnelCount; }
    public void setPersonnelCount(int personnelCount) { this.personnelCount = personnelCount; }
    
    public int getDeviceCount() { return deviceCount; }
    public void setDeviceCount(int deviceCount) { this.deviceCount = deviceCount; }
    
    /**
     * 获取类型显示名称
     */
    public String getTypeLabel() {
        switch (type) {
            case "company":
            case "branch":
                return "分公司";
            case "project":
                return "项目部";
            case "grid":
                return "网格";
            case "team":
                return "工队";
            case "safety_office":
                return "安监办";
            default: return type;
        }
    }
    
    /**
     * 获取层级深度
     */
    public int getLevel() {
        switch (type) {
            case "company":
            case "branch":
                return 0;
            case "project":
                return 1;
            case "safety_office":
                return 2;
            case "grid":
                return 3;
            case "team":
                return 4;
            default: return 0;
        }
    }
}
