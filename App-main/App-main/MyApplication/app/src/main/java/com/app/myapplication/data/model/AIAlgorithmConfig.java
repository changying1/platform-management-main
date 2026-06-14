package com.app.myapplication.data.model;

import com.google.gson.annotations.SerializedName;

public class AIAlgorithmConfig {
    @SerializedName("id")
    private String id;

    @SerializedName("name")
    private String name;

    @SerializedName("category")
    private String category;

    @SerializedName("code")
    private String code;

    @SerializedName("level")
    private String level;

    @SerializedName("description")
    private String description;

    public AIAlgorithmConfig() {
    }

    public AIAlgorithmConfig(String id, String name, String category, String code, String level, String description) {
        this.id = id;
        this.name = name;
        this.category = category;
        this.code = code;
        this.level = level;
        this.description = description;
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getCategory() {
        return category;
    }

    public void setCategory(String category) {
        this.category = category;
    }

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }

    public String getLevel() {
        return level;
    }

    public void setLevel(String level) {
        this.level = level;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }
}
