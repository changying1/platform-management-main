package com.app.myapplication.data.model;

import java.util.List;

public class FenceItem {
    public Integer id;
    public String name;

    // "CIRCLE" | "POLYGON"
    public String shapeType;

    // 圆形
    public Double lat;
    public Double lng;
    public Double radiusMeters;

    // 多边形
    public List<double[]> points;

    // 规则/等级/启用（若后端支持）
    public String ruleType;   // FORBID_IN/FORBID_OUT/BOTH...
    public String level;      // HIGH/MID/LOW
    public Boolean enabled;

    // 绑定
    public Integer regionId;          // 可空
    public List<String> bindDeviceIds;// 可空
}
