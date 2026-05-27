package com.app.myapplication.data.model;

import java.util.List;

/**
 * 项目区域数据模型 - 对齐后端字段
 */
public class ProjectRegion {
    public String id;
    public String name;
    public String company;
    public String project;
    public List<List<Double>> points; // [[lat,lng],[lat,lng],...]
}
