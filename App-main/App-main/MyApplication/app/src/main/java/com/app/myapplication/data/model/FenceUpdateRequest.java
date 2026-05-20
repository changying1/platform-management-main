package com.app.myapplication.data.model;

import java.util.List;

/**
 * 更新围栏请求体 - 对齐后端字段
 */
public class FenceUpdateRequest {
    public String name;
    public String company;
    public String project;
    public String shape;
    public String behavior;
    public String severity;
    public FenceCreateRequest.Schedule schedule;
    public String startTime;
    public String endTime;
    public List<Double> center;
    public Double radius;
    public List<List<Double>> points;
    public Integer is_active;
    public List<String> deviceIds;
}
