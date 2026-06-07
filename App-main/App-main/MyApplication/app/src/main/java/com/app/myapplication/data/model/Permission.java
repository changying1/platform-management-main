package com.app.myapplication.data.model;

/**
 * 权限项
 */
public class Permission {
    
    private String code;
    private String name;
    private boolean checked = false;
    
    public Permission(String code, String name) {
        this.code = code;
        this.name = name;
    }
    
    // Getters and Setters
    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
    
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    
    public boolean isChecked() { return checked; }
    public void setChecked(boolean checked) { this.checked = checked; }
}
