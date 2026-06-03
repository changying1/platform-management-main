package com.app.myapplication.data.model.manage;

import com.google.gson.annotations.SerializedName;

import java.util.List;

public class ResponsibilityUnit {

    @SerializedName("id")
    private String id;

    @SerializedName("unit_id")
    private String unitId;

    @SerializedName("name")
    private String name;

    @SerializedName("type")
    private String type;

    @SerializedName("parent_id")
    private String parentId;

    @SerializedName("level")
    private int level;

    @SerializedName("is_under_construction")
    private boolean isUnderConstruction;

    @SerializedName("sort_order")
    private int sortOrder;

    @SerializedName("created_at")
    private String createdAt;

    @SerializedName("updated_at")
    private String updatedAt;

    @SerializedName("children")
    private List<ResponsibilityUnit> children;

    public ResponsibilityUnit() {}

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getUnitId() { return unitId; }
    public void setUnitId(String unitId) { this.unitId = unitId; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public String getParentId() { return parentId; }
    public void setParentId(String parentId) { this.parentId = parentId; }

    public int getLevel() { return level; }
    public void setLevel(int level) { this.level = level; }

    public boolean isUnderConstruction() { return isUnderConstruction; }
    public void setUnderConstruction(boolean underConstruction) { isUnderConstruction = underConstruction; }

    public int getSortOrder() { return sortOrder; }
    public void setSortOrder(int sortOrder) { this.sortOrder = sortOrder; }

    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }

    public String getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(String updatedAt) { this.updatedAt = updatedAt; }

    public List<ResponsibilityUnit> getChildren() { return children; }
    public void setChildren(List<ResponsibilityUnit> children) { this.children = children; }

    public String getTypeDisplayName() {
        if (type == null) return "未知";
        switch (type) {
            case "division": return "分部";
            case "workshop": return "工区";
            case "site": return "工点";
            case "subproject": return "分部工程";
            default: return type;
        }
    }
}
