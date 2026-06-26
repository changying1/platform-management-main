package com.app.myapplication.ui.alarm;

import android.app.DatePickerDialog;
import android.app.TimePickerDialog;
import android.graphics.Typeface;
import android.os.Bundle;
import android.text.Editable;
import android.text.TextUtils;
import android.text.TextWatcher;
import android.view.View;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.widget.AppCompatEditText;
import androidx.lifecycle.ViewModelProvider;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.app.myapplication.R;
import com.app.myapplication.data.local.SessionManager;
import com.app.myapplication.data.model.Alarm;
import com.google.android.material.bottomsheet.BottomSheetDialog;
import com.google.android.material.button.MaterialButtonToggleGroup;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.Comparator;
import java.util.Date;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

public class AlarmRecordsActivity extends AppCompatActivity {
    private RecyclerView recyclerView;
    private AlarmAdapter alarmAdapter;
    private AlarmViewModel alarmViewModel;
    private AppCompatEditText etSearch;
    private TextView tvActiveFilters;
    private final AlarmWebSocketClient alarmWebSocketClient = new AlarmWebSocketClient();
    private final List<Alarm> allAlarms = new ArrayList<>();

    private String sourceFilter = "all";
    private String statusFilter = "all";
    private String severityFilter = "all";
    private String companyFilter = "all";
    private String projectFilter = "all";
    private String gridFilter = "all";
    private String teamFilter = "all";
    private String sortFilter = "time_desc";
    private Long startMillis;
    private Long endMillis;
    private boolean canHandle;
    private SessionManager sessionManager;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_alarm_records);

        sessionManager = new SessionManager(this);
        canHandle = sessionManager.hasPermission("alarm.handle");
        bindViews();
        initList();
        initFilters();

        alarmViewModel = new ViewModelProvider(this).get(AlarmViewModel.class);
        alarmViewModel.getAlarmData().observe(this, alarms -> {
            allAlarms.clear();
            if (alarms != null) allAlarms.addAll(alarms);
            applyFilters();
        });
        alarmViewModel.getAlarmStats().observe(this, this::updateStatsUI);
    }

    private void bindViews() {
        recyclerView = findViewById(R.id.recyclerView);
        etSearch = findViewById(R.id.etSearch);
        tvActiveFilters = findViewById(R.id.tvActiveFilters);
        findViewById(R.id.btnFilter).setOnClickListener(v -> showFilterSheet());
    }

    private void initList() {
        recyclerView.setLayoutManager(new LinearLayoutManager(this));
        alarmAdapter = new AlarmAdapter();
        alarmAdapter.setCanHandle(canHandle);
        alarmAdapter.setOnAlarmActionListener(new AlarmAdapter.OnAlarmActionListener() {
            @Override public void onDetails(Alarm alarm) { showAlarmDetails(alarm); }
            @Override public void onHandle(Alarm alarm) { showProcessDialog(alarm); }
        });
        recyclerView.setAdapter(alarmAdapter);
    }

    private void initFilters() {
        MaterialButtonToggleGroup tabs = findViewById(R.id.sourceTabs);
        tabs.addOnButtonCheckedListener((group, checkedId, isChecked) -> {
            if (!isChecked) return;
            sourceFilter = checkedId == R.id.btnSourceFence ? "fence"
                    : checkedId == R.id.btnSourceVideo ? "video" : "all";
            applyFilters();
        });
        etSearch.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) { applyFilters(); }
            @Override public void afterTextChanged(Editable s) {}
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        alarmViewModel.startPolling(getApplicationContext());
        alarmWebSocketClient.connect(getApplicationContext(), (type, description) ->
                alarmViewModel.fetchAlarms(getApplicationContext()));
    }

    @Override
    protected void onPause() {
        super.onPause();
        alarmViewModel.stopPolling();
        alarmWebSocketClient.close();
    }

    private void applyFilters() {
        String query = normalize(etSearch == null || etSearch.getText() == null
                ? "" : etSearch.getText().toString());
        List<Alarm> result = new ArrayList<>();
        for (Alarm alarm : allAlarms) {
            if (AlarmViewModel.isOfflineAlarm(alarm)) continue;
            if (!"all".equals(sourceFilter) && !sourceFilter.equals(AlarmAdapter.sourceType(alarm))) continue;
            if (!"all".equals(statusFilter) && !statusFilter.equals(safe(alarm.getDisplayStatus(), "pending"))) continue;
            if (!"all".equals(severityFilter) && !severityFilter.equals(normalizeSeverity(alarm.getDisplaySeverity()))) continue;
            if (!matchesOrg(companyFilter, company(alarm))) continue;
            if (!matchesOrg(projectFilter, project(alarm))) continue;
            if (!matchesOrg(gridFilter, grid(alarm))) continue;
            if (!matchesOrg(teamFilter, team(alarm))) continue;
            long timestamp = parseTime(alarm.getTimestamp());
            if (startMillis != null && timestamp < startMillis) continue;
            if (endMillis != null && timestamp > endMillis) continue;
            if (!query.isEmpty() && !matchesSearch(alarm, query)) continue;
            result.add(alarm);
        }
        sort(result);
        alarmAdapter.submitList(result);
        updateActiveFilters(result.size());
    }

    private boolean matchesSearch(Alarm alarm, String query) {
        String haystack = normalize(TextUtils.join(" ", new String[]{
                AlarmAdapter.buildDisplayId(alarm), AlarmAdapter.displayType(alarm),
                alarm.getDescription(), alarm.getDeviceName(), alarm.getDeviceId(),
                alarm.getPersonName(), alarm.getPersonnelId(), alarm.getLocation(),
                company(alarm), project(alarm), grid(alarm), team(alarm),
                alarm.getDisplayStatus(), alarm.getDisplaySeverity()
        }));
        for (String term : query.split("\\s+")) {
            if (!haystack.contains(term)) return false;
        }
        return true;
    }

    private void sort(List<Alarm> alarms) {
        Comparator<Alarm> comparator;
        switch (sortFilter) {
            case "level_desc":
                comparator = Comparator.comparingInt(a -> severityRank(a.getDisplaySeverity()));
                break;
            case "status_desc":
                comparator = Comparator.comparingInt(a -> statusRank(a.getDisplayStatus()));
                break;
            case "type_asc":
                comparator = Comparator.comparing(AlarmAdapter::displayType, String.CASE_INSENSITIVE_ORDER);
                Collections.sort(alarms, comparator);
                return;
            case "time_asc":
                comparator = Comparator.comparingLong(a -> parseTime(a.getTimestamp()));
                Collections.sort(alarms, comparator);
                return;
            default:
                comparator = Comparator.comparingLong(a -> parseTime(a.getTimestamp()));
                break;
        }
        Collections.sort(alarms, comparator.reversed());
    }

    private void showFilterSheet() {
        BottomSheetDialog dialog = new BottomSheetDialog(this);
        LinearLayout root = verticalLayout(16);
        TextView title = label("筛选告警", 20, true);
        root.addView(title);

        Spinner status = spinner(root, "状态", new String[]{"全部状态", "待处理", "已处理", "已忽略"},
                indexOf(new String[]{"all", "pending", "resolved", "ignored"}, statusFilter));
        Spinner level = spinner(root, "级别", new String[]{"全部级别", "严重", "一般", "提示"},
                indexOf(new String[]{"all", "high", "medium", "low"}, severityFilter));
        Spinner company = spinner(root, "分公司", withAll("所有分公司", orgValues(0, null, null, null)),
                optionIndex(withAll("所有分公司", orgValues(0, null, null, null)), companyFilter));
        Spinner project = spinner(root, "项目", withAll("所有项目", orgValues(1, companyFilter, null, null)),
                optionIndex(withAll("所有项目", orgValues(1, companyFilter, null, null)), projectFilter));
        Spinner grid = spinner(root, "网格", withAll("所有网格", orgValues(2, companyFilter, projectFilter, null)),
                optionIndex(withAll("所有网格", orgValues(2, companyFilter, projectFilter, null)), gridFilter));
        Spinner team = spinner(root, "工队", withAll("所有工队", orgValues(3, companyFilter, projectFilter, gridFilter)),
                optionIndex(withAll("所有工队", orgValues(3, companyFilter, projectFilter, gridFilter)), teamFilter));
        setupOrganizationCascade(company, project, grid, team);
        Spinner sort = spinner(root, "排序", new String[]{"时间从新到旧", "时间从旧到新", "等级从高到低", "状态优先", "类型名称"},
                indexOf(new String[]{"time_desc", "time_asc", "level_desc", "status_desc", "type_asc"}, sortFilter));

        LinearLayout dates = new LinearLayout(this);
        dates.setOrientation(LinearLayout.HORIZONTAL);
        Button start = new Button(this);
        Button end = new Button(this);
        start.setText(startMillis == null ? "开始时间" : shortTime(startMillis));
        end.setText(endMillis == null ? "结束时间" : shortTime(endMillis));
        dates.addView(start, weighted());
        dates.addView(end, weighted());
        root.addView(dates);
        final Long[] pickedStart = {startMillis};
        final Long[] pickedEnd = {endMillis};
        start.setOnClickListener(v -> pickDateTime(pickedStart[0], value -> {
            pickedStart[0] = value;
            start.setText(shortTime(value));
        }));
        end.setOnClickListener(v -> pickDateTime(pickedEnd[0], value -> {
            pickedEnd[0] = value;
            end.setText(shortTime(value));
        }));

        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        Button clear = new Button(this);
        clear.setText("清除");
        Button apply = new Button(this);
        apply.setText("应用筛选");
        actions.addView(clear, weighted());
        actions.addView(apply, weighted());
        root.addView(actions);
        clear.setOnClickListener(v -> {
            statusFilter = severityFilter = companyFilter = projectFilter = gridFilter = teamFilter = "all";
            sortFilter = "time_desc";
            startMillis = endMillis = null;
            dialog.dismiss();
            applyFilters();
        });
        apply.setOnClickListener(v -> {
            statusFilter = codeAt(status, new String[]{"all", "pending", "resolved", "ignored"});
            severityFilter = codeAt(level, new String[]{"all", "high", "medium", "low"});
            companyFilter = selectedOrg(company, "所有分公司");
            projectFilter = selectedOrg(project, "所有项目");
            gridFilter = selectedOrg(grid, "所有网格");
            teamFilter = selectedOrg(team, "所有工队");
            sortFilter = codeAt(sort, new String[]{"time_desc", "time_asc", "level_desc", "status_desc", "type_asc"});
            startMillis = pickedStart[0];
            endMillis = pickedEnd[0];
            dialog.dismiss();
            applyFilters();
        });

        ScrollView scroll = new ScrollView(this);
        scroll.addView(root);
        dialog.setContentView(scroll);
        dialog.show();
    }

    private void showAlarmDetails(Alarm alarm) {
        LinearLayout content = verticalLayout(12);
        detail(content, "告警编号", AlarmAdapter.buildDisplayId(alarm));
        detail(content, "类型", AlarmAdapter.displayType(alarm));
        detail(content, "情况描述", safe(AlarmAdapter.cleanDisplayDescription(alarm.getDescription()), "-"));
        detail(content, "等级", severityText(alarm.getDisplaySeverity()));
        detail(content, "状态", statusText(alarm.getDisplayStatus()));
        detail(content, "告警对象", safe(alarm.getPersonName(), "-"));
        detail(content, "人员 ID", safe(alarm.getPersonnelId(), "-"));
        detail(content, "设备", safe(alarm.getDeviceName(), "-"));
        detail(content, "设备 ID", safe(alarm.getDeviceId(), "-"));
        detail(content, "地点", safe(alarm.getLocation(), "-"));
        detail(content, "分公司", company(alarm));
        detail(content, "项目", project(alarm));
        detail(content, "网格", grid(alarm));
        detail(content, "工队", team(alarm));
        detail(content, "告警时间", AlarmAdapter.formatTime(alarm.getTimestamp()));
        detail(content, "处置时间", AlarmAdapter.formatTime(alarm.getHandledAt()));
        detail(content, "处理人", safe(alarm.getHandler(), "-"));
        detail(content, "处置备注", safe(alarm.getRemark(), "-"));
        detail(content, "录像状态", safe(alarm.getRecordingStatus(), "-"));
        detail(content, "录像错误", safe(alarm.getRecordingError(), "-"));
        ScrollView scroll = new ScrollView(this);
        scroll.addView(content);
        AlertDialog.Builder builder = new AlertDialog.Builder(this)
                .setTitle("告警详情")
                .setView(scroll)
                .setPositiveButton("关闭", null);
        if (canHandle && "pending".equals(alarm.getDisplayStatus())) {
            builder.setNeutralButton("处置", (d, w) -> showProcessDialog(alarm));
        }
        builder.show();
    }

    private void showProcessDialog(Alarm alarm) {
        LinearLayout root = verticalLayout(12);
        Spinner action = spinner(root, "处置结果", new String[]{"标记为已处理", "标记为已忽略"}, 0);
        Spinner severity = spinner(root, "告警级别", new String[]{"严重", "一般", "提示"},
                indexOf(new String[]{"high", "medium", "low"}, normalizeSeverity(alarm.getDisplaySeverity())));
        EditText remark = new EditText(this);
        remark.setHint("处置备注（可选）");
        remark.setMinLines(3);
        root.addView(remark);
        new AlertDialog.Builder(this)
                .setTitle(AlarmAdapter.buildDisplayId(alarm))
                .setView(root)
                .setNegativeButton("取消", null)
                .setPositiveButton("提交", (dialog, which) -> {
                    String status = action.getSelectedItemPosition() == 0 ? "resolved" : "ignored";
                    String level = new String[]{"high", "medium", "low"}[severity.getSelectedItemPosition()];
                    alarmViewModel.updateAlarmStatus(
                            getApplicationContext(),
                            alarm.getId(),
                            status,
                            level,
                            sessionManager.getUsername(),
                            remark.getText().toString().trim()
                    );
                })
                .show();
    }

    private void updateStatsUI(AlarmStats stats) {
        if (stats == null) return;
        ((TextView) findViewById(R.id.tvTotalAlarms)).setText("总数 " + stats.getTotalAlarms());
        ((TextView) findViewById(R.id.tvPendingAlarms)).setText("待处理 " + stats.getPendingAlarms());
        ((TextView) findViewById(R.id.tvProcessedAlarms)).setText("围栏 " + stats.getFenceAlarms());
        ((TextView) findViewById(R.id.tvCriticalAlarms)).setText("视频 " + stats.getVideoAlarms());
    }

    private List<String> orgValues(int level, String company, String project, String grid) {
        Set<String> values = new LinkedHashSet<>();
        for (Alarm alarm : allAlarms) {
            if (level > 0 && !matchesOrg(company, company(alarm))) continue;
            if (level > 1 && !matchesOrg(project, project(alarm))) continue;
            if (level > 2 && !matchesOrg(grid, grid(alarm))) continue;
            String value = level == 0 ? company(alarm) : level == 1 ? project(alarm)
                    : level == 2 ? grid(alarm) : team(alarm);
            if (!value.startsWith("未分配")) values.add(value);
        }
        return new ArrayList<>(values);
    }

    private void setupOrganizationCascade(Spinner company, Spinner project, Spinner grid, Spinner team) {
        company.post(() -> {
            company.setOnItemSelectedListener(new SimpleItemSelectedListener() {
                @Override public void selected() {
                    String selectedCompany = selectedOrg(company, "所有分公司");
                    replaceOptions(project, withAll("所有项目", orgValues(1, selectedCompany, null, null)));
                    replaceOptions(grid, withAll("所有网格", orgValues(2, selectedCompany, "all", null)));
                    replaceOptions(team, withAll("所有工队", orgValues(3, selectedCompany, "all", "all")));
                }
            });
            project.setOnItemSelectedListener(new SimpleItemSelectedListener() {
                @Override public void selected() {
                    String selectedCompany = selectedOrg(company, "所有分公司");
                    String selectedProject = selectedOrg(project, "所有项目");
                    replaceOptions(grid, withAll("所有网格", orgValues(2, selectedCompany, selectedProject, null)));
                    replaceOptions(team, withAll("所有工队", orgValues(3, selectedCompany, selectedProject, "all")));
                }
            });
            grid.setOnItemSelectedListener(new SimpleItemSelectedListener() {
                @Override public void selected() {
                    replaceOptions(team, withAll("所有工队", orgValues(
                            3,
                            selectedOrg(company, "所有分公司"),
                            selectedOrg(project, "所有项目"),
                            selectedOrg(grid, "所有网格")
                    )));
                }
            });
        });
    }

    private void replaceOptions(Spinner spinner, String[] options) {
        spinner.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, options));
        spinner.setSelection(0);
    }

    private void updateActiveFilters(int resultCount) {
        List<String> parts = new ArrayList<>();
        parts.add(statusFilter.equals("all") ? "全部状态" : statusText(statusFilter));
        parts.add(severityFilter.equals("all") ? "全部级别" : severityText(severityFilter));
        if (!"all".equals(companyFilter)) parts.add(companyFilter);
        if (!"all".equals(projectFilter)) parts.add(projectFilter);
        if (!"all".equals(gridFilter)) parts.add(gridFilter);
        if (!"all".equals(teamFilter)) parts.add(teamFilter);
        if (startMillis != null || endMillis != null) parts.add("已限定时间");
        parts.add("结果 " + resultCount);
        tvActiveFilters.setText(TextUtils.join(" · ", parts));
    }

    private void pickDateTime(Long initial, DateValueCallback callback) {
        Calendar calendar = Calendar.getInstance();
        if (initial != null) calendar.setTimeInMillis(initial);
        new DatePickerDialog(this, (view, year, month, day) -> {
            calendar.set(year, month, day);
            new TimePickerDialog(this, (timeView, hour, minute) -> {
                calendar.set(Calendar.HOUR_OF_DAY, hour);
                calendar.set(Calendar.MINUTE, minute);
                calendar.set(Calendar.SECOND, 0);
                callback.onValue(calendar.getTimeInMillis());
            }, calendar.get(Calendar.HOUR_OF_DAY), calendar.get(Calendar.MINUTE), true).show();
        }, calendar.get(Calendar.YEAR), calendar.get(Calendar.MONTH), calendar.get(Calendar.DAY_OF_MONTH)).show();
    }

    private LinearLayout verticalLayout(int paddingDp) {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        int padding = dp(paddingDp);
        layout.setPadding(padding, padding, padding, padding);
        return layout;
    }

    private TextView label(String text, int size, boolean bold) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextSize(size);
        if (bold) view.setTypeface(Typeface.DEFAULT_BOLD);
        return view;
    }

    private Spinner spinner(LinearLayout root, String label, String[] values, int selected) {
        root.addView(label(label, 13, true));
        Spinner spinner = new Spinner(this);
        spinner.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, values));
        spinner.setSelection(Math.max(0, Math.min(selected, values.length - 1)));
        root.addView(spinner);
        return spinner;
    }

    private void detail(LinearLayout root, String key, String value) {
        TextView view = label(key + "：" + safe(value, "-"), 14, false);
        view.setPadding(0, dp(4), 0, dp(4));
        root.addView(view);
    }

    private LinearLayout.LayoutParams weighted() {
        return new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
    }

    private String[] withAll(String all, List<String> values) {
        List<String> result = new ArrayList<>();
        result.add(all);
        result.addAll(values);
        return result.toArray(new String[0]);
    }

    private int optionIndex(String[] values, String selected) {
        if ("all".equals(selected)) return 0;
        for (int i = 1; i < values.length; i++) if (values[i].equals(selected)) return i;
        return 0;
    }

    private String selectedOrg(Spinner spinner, String allLabel) {
        String selected = String.valueOf(spinner.getSelectedItem());
        return allLabel.equals(selected) ? "all" : selected;
    }

    private String codeAt(Spinner spinner, String[] codes) {
        return codes[Math.max(0, Math.min(spinner.getSelectedItemPosition(), codes.length - 1))];
    }

    private int indexOf(String[] values, String value) {
        for (int i = 0; i < values.length; i++) if (values[i].equals(value)) return i;
        return 0;
    }

    private String shortTime(long millis) {
        return new SimpleDateFormat("MM-dd HH:mm", Locale.CHINA).format(new Date(millis));
    }

    private static long parseTime(String raw) {
        if (TextUtils.isEmpty(raw)) return 0;
        String normalized = raw.replace("Z", "").replace("+00:00", "");
        String[] patterns = {"yyyy-MM-dd'T'HH:mm:ss.SSSSSS", "yyyy-MM-dd'T'HH:mm:ss", "yyyy-MM-dd HH:mm:ss"};
        for (String pattern : patterns) {
            try {
                Date date = new SimpleDateFormat(pattern, Locale.US).parse(normalized);
                if (date != null) return date.getTime();
            } catch (Exception ignored) {}
        }
        return 0;
    }

    private static int severityRank(String value) {
        String level = normalizeSeverity(value);
        return "high".equals(level) ? 3 : "medium".equals(level) ? 2 : 1;
    }

    private static int statusRank(String value) {
        return "pending".equals(value) ? 3 : "resolved".equals(value) ? 2 : 1;
    }

    private static String normalizeSeverity(String value) {
        value = safe(value, "low").toLowerCase(Locale.ROOT);
        if (value.equals("high") || value.equals("severe") || value.equals("critical")) return "high";
        if (value.equals("medium") || value.equals("warning")) return "medium";
        return "low";
    }

    private static String severityText(String value) {
        value = normalizeSeverity(value);
        return "high".equals(value) ? "严重" : "medium".equals(value) ? "一般" : "提示";
    }

    private static String statusText(String value) {
        return "resolved".equals(value) ? "已处理" : "ignored".equals(value) ? "已忽略" : "待处理";
    }

    private static String company(Alarm a) { return safe(a.getBranchName(), "未分配分公司"); }
    private static String project(Alarm a) {
        return safe(a.getProjectName(), a.getProjectId() == null ? "未分配项目" : "项目 " + a.getProjectId());
    }
    private static String grid(Alarm a) { return safe(a.getGridName(), "未分配网格"); }
    private static String team(Alarm a) { return safe(a.getTeamName(), "未分配工队"); }
    private static boolean matchesOrg(String filter, String value) {
        return filter == null || "all".equals(filter) || filter.equals(value);
    }
    private static String normalize(String value) { return safe(value, "").toLowerCase(Locale.ROOT).trim(); }
    private static String safe(String value, String fallback) {
        return TextUtils.isEmpty(value) || "null".equalsIgnoreCase(value.trim()) ? fallback : value.trim();
    }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    private interface DateValueCallback { void onValue(long value); }

    private abstract static class SimpleItemSelectedListener implements AdapterView.OnItemSelectedListener {
        public abstract void selected();
        @Override public void onItemSelected(AdapterView<?> parent, View view, int position, long id) { selected(); }
        @Override public void onNothingSelected(AdapterView<?> parent) {}
    }
}
