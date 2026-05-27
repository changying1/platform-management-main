package com.app.myapplication.data.model;

import java.util.List;

/**
 * 围栏数据模型 - 对齐后端字段
 */
public class FenceItem {
    public String id;
    public String name;
    public String company;
    public String project;
    public String type;            // 后端返回的字段 "Circle" | "Polygon"
    public String shape;           // "circle" | "polygon" (小写)
    public String behavior;        // "No Entry" | "No Exit"
    public String severity;        // "normal" | "risk" | "severe"
    public Schedule schedule;
    public List<Double> center;    // [lat, lng] 圆形用
    public Double radius;          // 圆形半径
    public List<List<Double>> points; // 多边形点数组 [[lat,lng],...]
    public Integer is_active;      // 0 | 1
    public String createdAt;
    public String updatedAt;

    // 内部类：生效时间段
    public static class Schedule {
        public String start;
        public String end;
    }
}
