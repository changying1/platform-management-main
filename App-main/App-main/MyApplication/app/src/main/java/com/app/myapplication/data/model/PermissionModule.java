package com.app.myapplication.data.model;

import java.util.List;

/**
 * 权限模块
 */
public class PermissionModule {
    
    private String code;
    private String name;
    private String color;
    private List<Permission> permissions;
    private boolean expanded = true;
    
    public PermissionModule(String code, String name, String color, List<Permission> permissions) {
        this.code = code;
        this.name = name;
        this.color = color;
        this.permissions = permissions;
    }
    
    // Getters and Setters
    public String getId() { return code; }
    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
    
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    
    public String getColor() { return color; }
    public void setColor(String color) { this.color = color; }
    
    public List<Permission> getPermissions() { return permissions; }
    public void setPermissions(List<Permission> permissions) { this.permissions = permissions; }
    
    public boolean isExpanded() { return expanded; }
    public void setExpanded(boolean expanded) { this.expanded = expanded; }
    
    /**
     * 获取颜色值
     */
    public int getColorValue() {
        switch (color) {
            case "cyan": return 0xFF06b6d4;
            case "purple": return 0xFF8b5cf6;
            case "blue": return 0xFF3b82f6;
            case "green": return 0xFF10b981;
            case "orange": return 0xFFf59e0b;
            case "red": return 0xFFef4444;
            case "gray": return 0xFF6b7280;
            default: return 0xFF3b82f6;
        }
    }
}
