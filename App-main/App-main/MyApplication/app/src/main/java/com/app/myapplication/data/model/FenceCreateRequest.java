package com.app.myapplication.data.model;

import java.util.List;

public class FenceCreateRequest {
    public String name;
    public String company;
    public String project;
    public Integer project_region_id;
    public String shape;
    public String behavior;
    public String severity;
    public String coordinates_json;
    public List<Double> center;
    public Double radius;
    public List<List<Double>> points;
    public Schedule schedule;
    public String effective_time;
    public String remark;
    public String alarm_type;
    public List<String> deviceIds;

    public static class Schedule {
        public String start;
        public String end;

        public Schedule() {
        }

        public Schedule(String start, String end) {
            this.start = start;
            this.end = end;
        }
    }
}
