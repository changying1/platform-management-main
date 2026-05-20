package com.app.myapplication.data.model;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import java.util.ArrayList;
import java.util.List;

/**
 * UI围栏模型 - 对齐后端字段
 */
public class UiFence {
    public String id;
    public String name;
    public String company;
    public String project;
    public String shape;           // "circle" | "polygon" (小写)
    public String behavior;        // "No Entry" | "No Exit"
    public String severity;        // "normal" | "risk" | "severe"
    public List<Double> center;    // [lat, lng] 圆形用
    public Double radius;          // 圆形半径
    public List<List<Double>> points; // 多边形点数组 [[lat,lng],...]
    public Integer is_active;      // 0 | 1
    public String createdAt;
    public String updatedAt;

    // 本地字段（用于编辑）
    public String effectiveTime;   // 生效时间，如 "00:00-23:59"
    public String remark;
    public List<String> deviceIds;

    // 从后端JSON解析
    public static UiFence fromJson(JsonObject o) {
        UiFence f = new UiFence();
        f.id = optStr(o, "id", "");
        f.name = optStr(o, "name", "未命名围栏");
        f.company = optStr(o, "company", "");
        f.project = optStr(o, "project", "");
        f.shape = optStr(o, "shape", "circle");
        f.behavior = optStr(o, "behavior", "No Entry");
        f.severity = optStr(o, "severity", "normal");
        f.is_active = optIntNullable(o, "is_active", 1);
        f.createdAt = optStr(o, "createdAt", "");
        f.updatedAt = optStr(o, "updatedAt", "");

        // 解析 schedule
        if (o.has("schedule") && !o.get("schedule").isJsonNull()) {
            JsonObject sched = o.getAsJsonObject("schedule");
            String start = optStr(sched, "start", "00:00");
            String end = optStr(sched, "end", "23:59");
            f.effectiveTime = start + "-" + end;
        } else {
            f.effectiveTime = "00:00-23:59";
        }

        // 解析 center (圆形)
        JsonArray centerArr = optArr(o, "center");
        if (centerArr != null && centerArr.size() >= 2) {
            f.center = new ArrayList<>();
            f.center.add(centerArr.get(0).getAsDouble());
            f.center.add(centerArr.get(1).getAsDouble());
        }

        // 解析 radius
        f.radius = optDoubleNullable(o, "radius", null);

        // 解析 points (多边形)
        JsonArray pts = optArr(o, "points");
        if (pts != null) {
            f.points = new ArrayList<>();
            for (JsonElement e : pts) {
                if (!e.isJsonArray()) continue;
                JsonArray p = e.getAsJsonArray();
                if (p.size() < 2) continue;
                List<Double> point = new ArrayList<>();
                point.add(p.get(0).getAsDouble());
                point.add(p.get(1).getAsDouble());
                f.points.add(point);
            }
        }

        return f;
    }

    // 构造创建请求体
    public FenceCreateRequest toCreateRequest() {
        FenceCreateRequest req = new FenceCreateRequest();
        req.name = this.name;
        req.company = this.company != null ? this.company : "";
        req.project = this.project != null ? this.project : "";
        req.shape = this.shape != null ? this.shape : "circle";
        req.behavior = this.behavior != null ? this.behavior : "No Entry";
        req.severity = this.severity != null ? this.severity : "normal";
        req.center = this.center;
        req.radius = this.radius;
        req.points = this.points;
        req.deviceIds = this.deviceIds;

        // 解析 effectiveTime 到 schedule
        if (this.effectiveTime != null && this.effectiveTime.contains("-")) {
            String[] parts = this.effectiveTime.split("-");
            if (parts.length == 2) {
                req.schedule = new FenceCreateRequest.Schedule(parts[0], parts[1]);
            }
        }
        if (req.schedule == null) {
            req.schedule = new FenceCreateRequest.Schedule("00:00", "23:59");
        }

        return req;
    }

    // 构造更新请求体
    public FenceUpdateRequest toUpdateRequest() {
        FenceUpdateRequest req = new FenceUpdateRequest();
        req.name = this.name;
        req.company = this.company;
        req.project = this.project;
        req.shape = this.shape;
        req.behavior = this.behavior;
        req.severity = this.severity;
        req.center = this.center;
        req.radius = this.radius;
        req.points = this.points;
        req.is_active = this.is_active;
        req.deviceIds = this.deviceIds;

        if (this.effectiveTime != null && this.effectiveTime.contains("-")) {
            String[] parts = this.effectiveTime.split("-");
            if (parts.length == 2) {
                req.schedule = new FenceCreateRequest.Schedule(parts[0], parts[1]);
            }
        }

        return req;
    }

    // 获取最佳中心点（用于地图聚焦）
    public com.amap.api.maps.model.LatLng getBestCenterLatLng() {
        if ("circle".equalsIgnoreCase(shape) && center != null && center.size() >= 2) {
            return new com.amap.api.maps.model.LatLng(center.get(0), center.get(1));
        }
        if (points != null && !points.isEmpty()) {
            double sumLat = 0, sumLng = 0;
            for (List<Double> p : points) {
                if (p.size() >= 2) {
                    sumLat += p.get(0);
                    sumLng += p.get(1);
                }
            }
            return new com.amap.api.maps.model.LatLng(sumLat / points.size(), sumLng / points.size());
        }
        return null;
    }

    // ---- helpers ----
    private static String optStr(JsonObject o, String k, String def) {
        return (o != null && o.has(k) && !o.get(k).isJsonNull()) ? o.get(k).getAsString() : def;
    }
    private static Integer optIntNullable(JsonObject o, String k, Integer def) {
        return (o != null && o.has(k) && !o.get(k).isJsonNull()) ? o.get(k).getAsInt() : def;
    }
    private static Double optDoubleNullable(JsonObject o, String k, Double def) {
        return (o != null && o.has(k) && !o.get(k).isJsonNull()) ? o.get(k).getAsDouble() : def;
    }
    private static JsonArray optArr(JsonObject o, String k) {
        return (o != null && o.has(k) && o.get(k).isJsonArray()) ? o.get(k).getAsJsonArray() : null;
    }
}
