package com.app.myapplication.data.model;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import java.util.ArrayList;
import java.util.List;

public class UiRegion {
    public int id;
    public String name;
    public List<double[]> points = new ArrayList<>();

    public static UiRegion fromJson(JsonObject o) {
        UiRegion r = new UiRegion();
        r.id = optInt(o, "id", 0);
        r.name = optStr(o, "name", optStr(o, "region_name", "未命名区域"));

        JsonArray pts = optArr(o, "points");
        if (pts == null) pts = optArr(o, "polygon");
        if (pts != null) {
            for (JsonElement e : pts) {
                if (!e.isJsonArray()) continue;
                JsonArray p = e.getAsJsonArray();
                if (p.size() < 2) continue;
                double a = p.get(0).getAsDouble();
                double b = p.get(1).getAsDouble();
                r.points.add(new double[]{a, b});
            }
        }
        return r;
    }

    public JsonObject toCreateBody() {
        JsonObject b = new JsonObject();
        b.addProperty("name", name);

        JsonArray arr = new JsonArray();
        for (double[] p : points) {
            JsonArray one = new JsonArray();
            one.add(p[0]);
            one.add(p[1]);
            arr.add(one);
        }
        b.add("points", arr);
        return b;
    }

    private static String optStr(JsonObject o, String k, String def) {
        return (o != null && o.has(k) && !o.get(k).isJsonNull()) ? o.get(k).getAsString() : def;
    }
    private static int optInt(JsonObject o, String k, int def) {
        return (o != null && o.has(k) && !o.get(k).isJsonNull()) ? o.get(k).getAsInt() : def;
    }
    private static JsonArray optArr(JsonObject o, String k) {
        return (o != null && o.has(k) && o.get(k).isJsonArray()) ? o.get(k).getAsJsonArray() : null;
    }
}
