package com.app.myapplication.data.model;

import java.util.List;

/**
 * 更新围栏请求体 - 对齐后端 POST /fence/ 格式
 */
public class FenceUpdateRequest {
    public String name;
    public Integer project_region_id;  // 可选，默认为 null
    public String shape;               // "circle" | "polygon"
    public String behavior;            // "No Entry" | "No Exit"
    public String coordinates_json;    // JSON字符串 [[lat,lng],...]
    public Double radius;              // 圆形半径
    public String effective_time;      // "HH:mm-HH:mm"
    public String remark;              // 备注
    public String alarm_type;          // "low" | "medium" | "high"
    public List<String> deviceIds;     // 绑定的设备ID列表
    public Integer is_active;          // 0 | 1
}
