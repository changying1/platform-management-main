package com.app.myapplication.data.model;

/**
 * 工队 - 对应 Web 端 Team
 */
public class Team {
    
    private String teamId;
    private String name;
    private String company;
    private String project;
    private String color;
    private int fenceCount;
    
    public Team(String teamId, String name, String company, String project, 
                String color, int fenceCount) {
        this.teamId = teamId;
        this.name = name;
        this.company = company;
        this.project = project;
        this.color = color;
        this.fenceCount = fenceCount;
    }
    
    // Getters and Setters
    public String getTeamId() { return teamId; }
    public void setTeamId(String teamId) { this.teamId = teamId; }
    
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    
    public String getCompany() { return company; }
    public void setCompany(String company) { this.company = company; }
    
    public String getProject() { return project; }
    public void setProject(String project) { this.project = project; }
    
    public String getColor() { return color; }
    public void setColor(String color) { this.color = color; }
    
    public int getFenceCount() { return fenceCount; }
    public void setFenceCount(int fenceCount) { this.fenceCount = fenceCount; }
    
    /**
     * 获取颜色值（整数）
     */
    public int getColorValue() {
        try {
            return android.graphics.Color.parseColor(color);
        } catch (Exception e) {
            return 0xFF06b6d4; // 默认青色
        }
    }
}
