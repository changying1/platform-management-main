package com.app.myapplication.data.model;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import java.util.ArrayList;
import java.util.List;

public class UiFence {
    public int id;
    public String name;
    public String shapeType; // CIRCLE / POLYGON
    public Double lat;
    public Double lng;
    public Double radiusMeters;
    public List<double[]> points = new ArrayList<>();

    public String ruleType; // FORBID_IN / FORBID_OUT / BOTH (可空)
    public String level;    // HIGH/MID/LOW (可空)
    public Boolean enabled; // 可空
    public Integer regionId;// 可空

    // 容错：从 JsonObject 解析
    public static UiFence fromJson(JsonObject o) {
        UiFence f = new UiFence();
        f.id = optInt(o, "id", 0);
        f.name = optStr(o, "name", optStr(o, "fence_name", "未命名围栏"));
        f.shapeType = optStr(o, "shapeType", optStr(o, "shape_type", "CIRCLE"));

        // 圆字段（容错）
        f.lat = optDoubleNullable(o, "lat", optDoubleNullable(o, "center_lat", null));
        f.lng = optDoubleNullable(o, "lng", optDoubleNullable(o, "center_lng", null));
        f.radiusMeters = optDoubleNullable(o, "radiusMeters", optDoubleNullable(o, "radius_meters", null));

        // 多边形 points（容错）
        JsonArray pts = optArr(o, "points");
        if (pts == null) pts = optArr(o, "polygon");
        if (pts != null) {
            for (JsonElement e : pts) {
                if (!e.isJsonArray()) continue;
                JsonArray p = e.getAsJsonArray();
                if (p.size() < 2) continue;
                double a = p.get(0).getAsDouble();
                double b = p.get(1).getAsDouble();
                // 默认认为 [lat,lng]
                f.points.add(new double[]{a, b});
            }
        }

        f.ruleType = optStr(o, "ruleType", optStr(o, "rule_type", null));
        f.level = optStr(o, "level", optStr(o, "alarm_level", null));
        f.enabled = optBoolNullable(o, "enabled", optBoolNullable(o, "is_enabled", null));
        f.regionId = optIntNullable(o, "regionId", optIntNullable(o, "region_id", null));
        return f;
    }

    // 构造创建围栏的 body（按通用字段名；你后端字段不同再微调）
    public JsonObject toCreateBody() {
        JsonObject b = new JsonObject();
        b.addProperty("name", name);
        b.addProperty("shapeType", shapeType);

        if ("CIRCLE".equalsIgnoreCase(shapeType)) {
            if (lat != null) b.addProperty("lat", lat);
            if (lng != null) b.addProperty("lng", lng);
            if (radiusMeters != null) b.addProperty("radiusMeters", radiusMeters);
        } else {
            JsonArray arr = new JsonArray();
            for (double[] p : points) {
                JsonArray one = new JsonArray();
                one.add(p[0]);
                one.add(p[1]);
                arr.add(one);
            }
            b.add("points", arr);
        }

        if (ruleType != null) b.addProperty("ruleType", ruleType);
        if (level != null) b.addProperty("level", level);
        if (enabled != null) b.addProperty("enabled", enabled);
        if (regionId != null) b.addProperty("regionId", regionId);

        return b;
    }

    // ---- helpers ----
    private static String optStr(JsonObject o, String k, String def) {
        return (o != null && o.has(k) && !o.get(k).isJsonNull()) ? o.get(k).getAsString() : def;
    }
    private static int optInt(JsonObject o, String k, int def) {
        return (o != null && o.has(k) && !o.get(k).isJsonNull()) ? o.get(k).getAsInt() : def;
    }
    private static Integer optIntNullable(JsonObject o, String k, Integer def) {
        return (o != null && o.has(k) && !o.get(k).isJsonNull()) ? o.get(k).getAsInt() : def;
    }
    private static Double optDoubleNullable(JsonObject o, String k, Double def) {
        return (o != null && o.has(k) && !o.get(k).isJsonNull()) ? o.get(k).getAsDouble() : def;
    }
    private static Boolean optBoolNullable(JsonObject o, String k, Boolean def) {
        return (o != null && o.has(k) && !o.get(k).isJsonNull()) ? o.get(k).getAsBoolean() : def;
    }
    private static JsonArray optArr(JsonObject o, String k) {
        return (o != null && o.has(k) && o.get(k).isJsonArray()) ? o.get(k).getAsJsonArray() : null;
    }
}
