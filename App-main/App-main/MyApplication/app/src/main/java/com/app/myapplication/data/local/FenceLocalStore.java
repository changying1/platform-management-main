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

public class FenceLocalStore {

    private static final String SP_NAME = "fence_store";
    private static final String KEY_FENCES = "fences_json";
    private static final String KEY_LOCAL_ID_SEQ = "local_id_seq"; // 用于生成本地临时 id（负数）

    private final SharedPreferences sp;

    public FenceLocalStore(Context ctx) {
        sp = ctx.getApplicationContext().getSharedPreferences(SP_NAME, Context.MODE_PRIVATE);
    }

    /** 读取全部围栏（本地缓存/草稿用） */
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
            // 若损坏则返回空，避免崩
        }
        return list;
    }

    /** 按 id 查询（Integer） */
    public FenceItem getById(Integer id) {
        if (id == null) return null;
        List<FenceItem> all = getAll();
        for (FenceItem f : all) {
            if (f != null && f.id != null && id.equals(f.id)) return f;
        }
        return null;
    }

    /**
     * 保存或更新（Upsert）
     * - 如果 fence.id == null：生成一个本地临时负数 id，避免与后端正数 id 冲突
     * - 如果 fence.id != null：按 id 覆盖更新
     */
    public FenceItem upsert(FenceItem fence) {
        if (fence == null) return null;

        if (fence.id == null) {
            fence.id = nextLocalTempId(); // 本地草稿 id（负数）
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

    /** 删除（Integer id） */
    public boolean delete(Integer id) {
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

    /** 清空本地缓存（可选） */
    public void clear() {
        sp.edit().remove(KEY_FENCES).apply();
    }

    // -------------------------
    // Local temp id generator
    // -------------------------
    private Integer nextLocalTempId() {
        // 从 -1, -2, -3 ... 递减
        int seq = sp.getInt(KEY_LOCAL_ID_SEQ, 0);
        seq += 1;
        sp.edit().putInt(KEY_LOCAL_ID_SEQ, seq).apply();
        return -seq;
    }

    // -------------------------
    // JSON <-> FenceItem (Store internal)
    // -------------------------
    private FenceItem parseFenceItem(JSONObject o) {
        if (o == null) return null;

        FenceItem f = new FenceItem();

        // id
        if (o.has("id") && !o.isNull("id")) f.id = o.optInt("id");

        f.name = o.optString("name", null);
        f.shapeType = o.optString("shapeType", "CIRCLE");

        // circle fields
        if (o.has("lat") && !o.isNull("lat")) f.lat = o.optDouble("lat");
        if (o.has("lng") && !o.isNull("lng")) f.lng = o.optDouble("lng");
        if (o.has("radiusMeters") && !o.isNull("radiusMeters")) f.radiusMeters = o.optDouble("radiusMeters");

        // polygon points: [[lat,lng],[lat,lng],...]
        JSONArray pts = o.optJSONArray("points");
        if (pts != null) {
            List<double[]> list = new ArrayList<>();
            for (int i = 0; i < pts.length(); i++) {
                JSONArray p = pts.optJSONArray(i);
                if (p == null || p.length() < 2) continue;
                list.add(new double[]{p.optDouble(0), p.optDouble(1)});
            }
            f.points = list;
        }

        // rule/level/enabled
        f.ruleType = o.optString("ruleType", null);
        f.level = o.optString("level", null);
        if (o.has("enabled") && !o.isNull("enabled")) f.enabled = o.optBoolean("enabled");

        // bindings
        if (o.has("regionId") && !o.isNull("regionId")) f.regionId = o.optInt("regionId");

        JSONArray devs = o.optJSONArray("bindDeviceIds");
        if (devs != null) {
            List<String> ids = new ArrayList<>();
            for (int i = 0; i < devs.length(); i++) {
                String d = devs.optString(i, null);
                if (d != null) ids.add(d);
            }
            f.bindDeviceIds = ids;
        }

        return f;
    }

    private JSONObject serializeFenceItem(FenceItem f) throws JSONException {
        JSONObject o = new JSONObject();

        if (f.id != null) o.put("id", f.id);
        if (f.name != null) o.put("name", f.name);
        if (f.shapeType != null) o.put("shapeType", f.shapeType);

        if (f.lat != null) o.put("lat", f.lat);
        if (f.lng != null) o.put("lng", f.lng);
        if (f.radiusMeters != null) o.put("radiusMeters", f.radiusMeters);

        if (f.points != null) {
            JSONArray pts = new JSONArray();
            for (double[] p : f.points) {
                if (p == null || p.length < 2) continue;
                JSONArray one = new JSONArray();
                one.put(p[0]);
                one.put(p[1]);
                pts.put(one);
            }
            o.put("points", pts);
        }

        if (f.ruleType != null) o.put("ruleType", f.ruleType);
        if (f.level != null) o.put("level", f.level);
        if (f.enabled != null) o.put("enabled", f.enabled);

        if (f.regionId != null) o.put("regionId", f.regionId);

        if (f.bindDeviceIds != null) {
            JSONArray arr = new JSONArray();
            for (String d : f.bindDeviceIds) arr.put(d);
            o.put("bindDeviceIds", arr);
        }

        return o;
    }
}
