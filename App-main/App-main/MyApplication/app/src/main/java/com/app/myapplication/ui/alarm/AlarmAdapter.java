package com.app.myapplication.ui.alarm;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.Spinner;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.app.myapplication.R;
import com.app.myapplication.data.model.Alarm;

import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public class AlarmAdapter extends RecyclerView.Adapter<AlarmAdapter.AlarmViewHolder> {

    private List<Alarm> alarmList;
    private ArrayAdapter<String> levelAdapter;
    private OnAlarmActionListener onAlarmActionListener;

    // ✅ 本地临时保存用户在 Spinner 里选的级别（不提交后端）
    // key = alarmId, value = "high"/"medium"/"low"
    private final Map<Integer, String> localSeverity = new HashMap<>();

    // Spinner 显示的中文选项
    private static final String[] LEVEL_CN = new String[]{"高危", "警告", "提示"};

    public void submitList(List<Alarm> list) {
        this.alarmList = list;
        notifyDataSetChanged();
    }

    public void setOnAlarmActionListener(OnAlarmActionListener listener) {
        this.onAlarmActionListener = listener;
    }

    @NonNull
    @Override
    public AlarmViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_alarm, parent, false);
        return new AlarmViewHolder(view);
    }

    private String extractYMD(String ts) {
        try {
            if (ts == null) return "00000000";
            if (ts.contains("T")) {
                return ts.split("T")[0].replace("-", "");
            } else if (ts.length() >= 10) {
                return ts.substring(0, 10).replace("-", "");
            }
        } catch (Exception ignored) {}
        return "00000000";
    }

    private String buildDisplayId(int rawId, String timestamp) {
        String ymd = extractYMD(timestamp);
        return "ALM-" + ymd + "-" + String.format(Locale.US, "%03d", rawId);
    }

    // 兼容：status 可能是英文 pending/resolved，也可能已经被你 ViewModel 翻译成中文
    private boolean isPendingStatus(String s) {
        if (s == null) return false;
        s = s.trim();
        return "pending".equalsIgnoreCase(s) || "待处理".equals(s);
    }

    // 兼容：severity 可能是 high/medium/low，也可能是中文 高危/警告/提示
    private String severityAnyToCN(String s) {
        if (s == null) return "警告";
        s = s.trim();
        if ("high".equalsIgnoreCase(s) || "高危".equals(s) || "高".equals(s)) return "高危";
        if ("low".equalsIgnoreCase(s) || "提示".equals(s) || "低".equals(s)) return "提示";
        // medium / 警告 / 中 等都归为警告
        return "警告";
    }

    private String cnToSeverityRaw(String cn) {
        if ("高危".equals(cn)) return "high";
        if ("提示".equals(cn)) return "low";
        return "medium"; // 警告
    }

    private String severityAnyToRaw(String s) {
        if (s == null) return "medium";
        s = s.trim();
        if ("high".equalsIgnoreCase(s) || "高危".equals(s) || "高".equals(s)) return "high";
        if ("low".equalsIgnoreCase(s) || "提示".equals(s) || "低".equals(s)) return "low";
        return "medium";
    }

    private int cnLevelIndex(String cn) {
        if ("高危".equals(cn)) return 0;
        if ("警告".equals(cn)) return 1;
        return 2; // 提示
    }

    @Override
    public void onBindViewHolder(@NonNull AlarmViewHolder holder, int position) {
        Alarm alarm = alarmList.get(position);
        if (alarm == null) return;

        // ===== 基本字段 =====
        String displayId = buildDisplayId(alarm.getId(), alarm.getTimestamp());
        holder.tvAlarmId.setText("报警编号: " + displayId);
        holder.tvAlarmType.setText("报警类型: " + (alarm.getAlarmType() == null ? "" : alarm.getAlarmType()));
        holder.tvDevice.setText("人员/设备: " + (alarm.getDeviceId() == null ? "" : alarm.getDeviceId()));
        holder.tvTime.setText("报警时间: " + (alarm.getTimestamp() == null ? "" : alarm.getTimestamp()));
        holder.tvLocation.setText("位置: " + (alarm.getLocation() == null ? "" : alarm.getLocation()));
        holder.tvStatus.setText("状态: " + (alarm.getStatus() == null ? "" : alarm.getStatus()));

        boolean isPending = isPendingStatus(alarm.getStatus());

        // ===== Spinner Adapter 只初始化一次（避免复用混乱）=====
        if (levelAdapter == null) {
            levelAdapter = new ArrayAdapter<>(
                    holder.itemView.getContext(),
                    android.R.layout.simple_spinner_item,
                    LEVEL_CN
            );
            levelAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        }
        holder.spinnerLevel.setAdapter(levelAdapter);

        // ===== Spinner 初始值：优先本地缓存，其次 alarm.getSeverity() =====
        String rawSev = localSeverity.containsKey(alarm.getId())
                ? localSeverity.get(alarm.getId())
                : severityAnyToRaw(alarm.getSeverity());

        String sevCN = severityAnyToCN(rawSev);

        // 复用防抖：先移除旧监听，再 setSelection
        holder.spinnerLevel.setOnItemSelectedListener(null);
        holder.spinnerLevel.setSelection(cnLevelIndex(sevCN), false);

        // pending 才能改
        holder.spinnerLevel.setEnabled(isPending);

        // ✅ Spinner 改动：只改前端
        holder.spinnerLevel.setOnItemSelectedListener(new android.widget.AdapterView.OnItemSelectedListener() {
            @Override
            public void onItemSelected(android.widget.AdapterView<?> parent, View view, int pos, long id) {
                if (!isPending) return;

                String selectedCN = (String) parent.getItemAtPosition(pos);
                String selectedRaw = cnToSeverityRaw(selectedCN);

                // 1) 只存本地 raw（给“处置按钮提交后端”用）
                localSeverity.put(alarm.getId(), selectedRaw);

                // 2) **把 Alarm 对象的 severity 改成中文**
                //    这样 ViewModel 的筛选（对 alarmData 中对象比较）才能筛到“前端改过的级别”
                alarm.setSeverity(selectedCN);

                // 如果你希望“当前已经开启了顶部级别筛选时”立即刷新列表，
                // 可以在 Activity 里收到 onResolve/onDelete 外再触发一次 filterData()。
                if (onAlarmActionListener != null) {
                    onAlarmActionListener.onLocalSeverityChanged();
                }
            }

            @Override
            public void onNothingSelected(android.widget.AdapterView<?> parent) {}
        });

        // ===== 处置按钮：点击才提交后端（status=resolved + severity=raw）=====
        holder.btnResolve.setVisibility(isPending ? View.VISIBLE : View.GONE);
        holder.btnResolve.setOnClickListener(v -> {
            if (onAlarmActionListener == null) return;

            String finalRaw = localSeverity.containsKey(alarm.getId())
                    ? localSeverity.get(alarm.getId())
                    : severityAnyToRaw(alarm.getSeverity()); // 兼容 alarm.severity 已经被改成中文

            onAlarmActionListener.onResolve(alarm.getId(), finalRaw);
        });

        // ===== 删除按钮 =====
        holder.btnDelete.setOnClickListener(v -> {
            if (onAlarmActionListener != null) {
                onAlarmActionListener.onDelete(alarm.getId());
            }
        });
    }

    @Override
    public int getItemCount() {
        return alarmList == null ? 0 : alarmList.size();
    }

    public static class AlarmViewHolder extends RecyclerView.ViewHolder {
        TextView tvAlarmId, tvAlarmType, tvDevice, tvTime, tvLocation, tvStatus;
        Spinner spinnerLevel;
        Button btnResolve, btnDelete;

        public AlarmViewHolder(@NonNull View itemView) {
            super(itemView);
            tvAlarmId = itemView.findViewById(R.id.tvAlarmId);
            tvAlarmType = itemView.findViewById(R.id.tvAlarmType);
            tvDevice = itemView.findViewById(R.id.tvDevice);
            tvTime = itemView.findViewById(R.id.tvTime);
            tvLocation = itemView.findViewById(R.id.tvLocation);
            tvStatus = itemView.findViewById(R.id.tvStatus);
            spinnerLevel = itemView.findViewById(R.id.spinnerLevel);
            btnResolve = itemView.findViewById(R.id.btnResolve);
            btnDelete = itemView.findViewById(R.id.btnDelete);
        }
    }

    public interface OnAlarmActionListener {
        void onResolve(int alarmId, String severity); // severity: high/medium/low
        void onDelete(int alarmId);

        // ✅ 新增：Spinner 改了级别（只改前端）后，通知外部可重新触发 filterData
        // 不想用也可以空实现
        void onLocalSeverityChanged();
    }
}
