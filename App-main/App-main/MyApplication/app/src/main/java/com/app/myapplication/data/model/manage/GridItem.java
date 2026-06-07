package com.app.myapplication.data.model.manage;

import com.google.gson.annotations.SerializedName;

public class GridItem {

    @SerializedName("id")
    private String id;

    @SerializedName("grid_id")
    private String gridId;

    @SerializedName("name")
    private String name;

    @SerializedName("level")
    private String level;

    @SerializedName("description")
    private String description;

    @SerializedName("bounds_json")
    private String boundsJson;

    @SerializedName("parent_id")
    private String parentId;

    @SerializedName("project_id")
    private String projectId;

    @SerializedName("created_at")
    private String createdAt;

    @SerializedName("updated_at")
    private String updatedAt;

    public GridItem() {}

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getGridId() { return gridId; }
    public void setGridId(String gridId) { this.gridId = gridId; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getLevel() { return level; }
    public void setLevel(String level) { this.level = level; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getBoundsJson() { return boundsJson; }
    public void setBoundsJson(String boundsJson) { this.boundsJson = boundsJson; }

    public String getParentId() { return parentId; }
    public void setParentId(String parentId) { this.parentId = parentId; }

    public String getProjectId() { return projectId; }
    public void setProjectId(String projectId) { this.projectId = projectId; }

    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }

    public String getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(String updatedAt) { this.updatedAt = updatedAt; }
}
