package com.app.myapplication.data.local;

import android.content.Context;
import android.content.SharedPreferences;

import com.app.myapplication.data.model.FenceItem;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;

/**
 * 围栏本地存储 - 对齐后端新字段
 */
public class FenceLocalStore {

    private static final String SP_NAME = "fence_store";
    private static final String KEY_FENCES = "fences_json";
    private static final String KEY_LOCAL_ID_SEQ = "local_id_seq";

    private final SharedPreferences sp;

    public FenceLocalStore(Context ctx) {
        sp = ctx.getApplicationContext().getSharedPreferences(SP_NAME, Context.MODE_PRIVATE);
    }

    /** 读取全部围栏 */
    public List<FenceItem> getAll() {
        String raw = sp.getString(KEY_FENCES, "[]");
        List<FenceItem> list = new ArrayList<>();
        try {
            JSONArray arr = new JSONArray(raw);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.getJSONObject(i);
                FenceItem f = parseFenceItem(o);
                if (f != null) list.add(f);
            }
        } catch (JSONException e) {
            // 若损坏则返回空
        }
        return list;
    }

    /** 按 id 查询（String） */
    public FenceItem getById(String id) {
        if (id == null) return null;
        List<FenceItem> all = getAll();
        for (FenceItem f : all) {
            if (f != null && f.id != null && id.equals(f.id)) return f;
        }
        return null;
    }

    /**
     * 保存或更新（Upsert）
     */
    public FenceItem upsert(FenceItem fence) {
        if (fence == null) return null;

        if (fence.id == null) {
            fence.id = nextLocalTempId();
        }

        List<FenceItem> all = getAll();
        boolean replaced = false;
        for (int i = 0; i < all.size(); i++) {
            FenceItem old = all.get(i);
            if (old != null && old.id != null && fence.id.equals(old.id)) {
                all.set(i, fence);
                replaced = true;
                break;
            }
        }
        if (!replaced) all.add(0, fence);

        saveAll(all);
        return fence;
    }

    /** 删除（String id） */
    public boolean delete(String id) {
        if (id == null) return false;
        List<FenceItem> all = getAll();
        Iterator<FenceItem> it = all.iterator();
        boolean removed = false;

        while (it.hasNext()) {
            FenceItem f = it.next();
            if (f != null && f.id != null && id.equals(f.id)) {
                it.remove();
                removed = true;
                break;
            }
        }

        if (removed) saveAll(all);
        return removed;
    }

    /** 覆盖保存全部 */
    public void saveAll(List<FenceItem> all) {
        JSONArray arr = new JSONArray();
        if (all != null) {
            for (FenceItem f : all) {
                try {
                    if (f != null) arr.put(serializeFenceItem(f));
                } catch (Exception ignore) {
                }
            }
        }
        sp.edit().putString(KEY_FENCES, arr.toString()).apply();
    }

    /** 清空本地缓存 */
    public void clear() {
        sp.edit().remove(KEY_FENCES).apply();
    }

    // -------------------------
    // Local temp id generator
    // -------------------------
    private String nextLocalTempId() {
        int seq = sp.getInt(KEY_LOCAL_ID_SEQ, 0);
        seq += 1;
        sp.edit().putInt(KEY_LOCAL_ID_SEQ, seq).apply();
        return "local_" + seq;
    }

    // -------------------------
    // JSON <-> FenceItem
    // -------------------------
    private FenceItem parseFenceItem(JSONObject o) {
        if (o == null) return null;

        FenceItem f = new FenceItem();

        // id
        if (o.has("id") && !o.isNull("id")) f.id = o.optString("id");

        f.name = o.optString("name", null);
        f.company = o.optString("company", null);
        f.project = o.optString("project", null);
        f.shape = o.optString("shape", "circle");
        f.behavior = o.optString("behavior", "No Entry");
        f.severity = o.optString("severity", "normal");

        // schedule
        JSONObject sched = o.optJSONObject("schedule");
        if (sched != null) {
            f.schedule = new FenceItem.Schedule();
            f.schedule.start = sched.optString("start", "00:00");
            f.schedule.end = sched.optString("end", "23:59");
        }

        // center [lat, lng]
        JSONArray centerArr = o.optJSONArray("center");
        if (centerArr != null && centerArr.length() >= 2) {
            f.center = new ArrayList<>();
            f.center.add(centerArr.optDouble(0));
            f.center.add(centerArr.optDouble(1));
        }

        // radius
        if (o.has("radius") && !o.isNull("radius")) f.radius = o.optDouble("radius");

        // points [[lat,lng],...]
        JSONArray pts = o.optJSONArray("points");
        if (pts != null) {
            f.points = new ArrayList<>();
            for (int i = 0; i < pts.length(); i++) {
                JSONArray p = pts.optJSONArray(i);
                if (p == null || p.length() < 2) continue;
                List<Double> point = new ArrayList<>();
                point.add(p.optDouble(0));
                point.add(p.optDouble(1));
                f.points.add(point);
            }
        }

        // is_active
        if (o.has("is_active") && !o.isNull("is_active")) f.is_active = o.optInt("is_active", 1);

        f.createdAt = o.optString("createdAt", null);
        f.updatedAt = o.optString("updatedAt", null);

        return f;
    }

    private JSONObject serializeFenceItem(FenceItem f) throws JSONException {
        JSONObject o = new JSONObject();

        if (f.id != null) o.put("id", f.id);
        if (f.name != null) o.put("name", f.name);
        if (f.company != null) o.put("company", f.company);
        if (f.project != null) o.put("project", f.project);
        if (f.shape != null) o.put("shape", f.shape);
        if (f.behavior != null) o.put("behavior", f.behavior);
        if (f.severity != null) o.put("severity", f.severity);

        // schedule
        if (f.schedule != null) {
            JSONObject sched = new JSONObject();
            sched.put("start", f.schedule.start != null ? f.schedule.start : "00:00");
            sched.put("end", f.schedule.end != null ? f.schedule.end : "23:59");
            o.put("schedule", sched);
        }

        // center
        if (f.center != null && f.center.size() >= 2) {
            JSONArray centerArr = new JSONArray();
            centerArr.put(f.center.get(0));
            centerArr.put(f.center.get(1));
            o.put("center", centerArr);
        }

        if (f.radius != null) o.put("radius", f.radius);

        // points
        if (f.points != null) {
            JSONArray pts = new JSONArray();
            for (List<Double> p : f.points) {
                if (p == null || p.size() < 2) continue;
                JSONArray point = new JSONArray();
                point.put(p.get(0));
                point.put(p.get(1));
                pts.put(point);
            }
            o.put("points", pts);
        }

        if (f.is_active != null) o.put("is_active", f.is_active);
        if (f.createdAt != null) o.put("createdAt", f.createdAt);
        if (f.updatedAt != null) o.put("updatedAt", f.updatedAt);

        return o;
    }
}
