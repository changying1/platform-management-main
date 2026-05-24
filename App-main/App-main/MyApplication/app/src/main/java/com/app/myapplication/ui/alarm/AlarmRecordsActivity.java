package com.app.myapplication.ui.alarm;

import android.os.Bundle;
import android.text.TextUtils;
import android.util.Log;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.EditText;
import android.widget.Spinner;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;
import androidx.lifecycle.ViewModelProvider;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;
import androidx.appcompat.widget.AppCompatEditText;
import com.app.myapplication.R;

public class AlarmRecordsActivity extends AppCompatActivity {

    private RecyclerView recyclerView;
    private AlarmAdapter alarmAdapter;
    private AlarmViewModel alarmViewModel;
    private AppCompatEditText etSearch;
    private Spinner spinnerStatus, spinnerLevel;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_alarm_records);

        // 初始化 RecyclerView
        recyclerView = findViewById(R.id.recyclerView);
        recyclerView.setLayoutManager(new LinearLayoutManager(this));

        // 获取 ViewModel
        alarmViewModel = new ViewModelProvider(this).get(AlarmViewModel.class);

        // 初始化适配器并设置给 RecyclerView
        alarmAdapter = new AlarmAdapter();
        recyclerView.setAdapter(alarmAdapter);
        alarmAdapter.setOnAlarmActionListener(new AlarmAdapter.OnAlarmActionListener() {
            @Override
            public void onResolve(long alarmId, String severity) {
                alarmViewModel.resolveAlarm(getApplicationContext(), alarmId, severity);
            }

            @Override
            public void onDelete(long alarmId) {
                alarmViewModel.deleteAlarm(getApplicationContext(), alarmId);
            }

            @Override
            public void onLocalSeverityChanged() {
                // 重新应用一次当前筛选条件，让“本地改级别”立即影响列表
                filterData();
            }
        });
        // 初始化筛选器和搜索框
        spinnerStatus = findViewById(R.id.spinnerStatus);
        spinnerLevel = findViewById(R.id.spinnerLevel);
        etSearch = findViewById(R.id.etSearch);

        // 设置筛选器选项
        setupSpinner();

        // 搜索框监听
        etSearch.addTextChangedListener(new android.text.TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence charSequence, int start, int count, int after) {}

            @Override
            public void onTextChanged(CharSequence charSequence, int start, int before, int count) {
                filterData();
            }

            @Override
            public void afterTextChanged(android.text.Editable editable) {}
        });

        // 观察数据变化并更新 UI
        alarmViewModel.getFilteredAlarms().observe(this, list -> {
            alarmAdapter.submitList(list);
        });

        // 观察统计数据变化并更新 UI
        alarmViewModel.getAlarmStats().observe(this, stats -> {
            updateStatsUI(stats); // 更新统计数据UI
        });
    }

    @Override
    protected void onResume() {
        super.onResume();
        // 启动轮询
        alarmViewModel.startPolling(getApplicationContext());
    }

    @Override
    protected void onPause() {
        super.onPause();
        // 停止轮询
        alarmViewModel.stopPolling();
    }

    private void updateStatsUI(AlarmStats stats) {
        // 更新界面上的统计信息
        TextView tvTotalAlarms = findViewById(R.id.tvTotalAlarms);
        tvTotalAlarms.setText("日报警: " + stats.getTotalAlarms());

        TextView tvPendingAlarms = findViewById(R.id.tvPendingAlarms);
        tvPendingAlarms.setText("待处理: " + stats.getPendingAlarms());

        TextView tvProcessedAlarms = findViewById(R.id.tvProcessedAlarms);
        tvProcessedAlarms.setText("已处置: " + stats.getProcessedAlarms());

        TextView tvCriticalAlarms = findViewById(R.id.tvCriticalAlarms);
        tvCriticalAlarms.setText("高风险: " + stats.getCriticalAlarms());
    }

    private void setupSpinner() {
        // 设置报警状态筛选项
        ArrayAdapter<CharSequence> statusAdapter = ArrayAdapter.createFromResource(this,
                R.array.alarm_status, android.R.layout.simple_spinner_item);
        statusAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinnerStatus.setAdapter(statusAdapter);

        // 设置报警级别筛选项
        ArrayAdapter<CharSequence> levelAdapter = ArrayAdapter.createFromResource(this,
                R.array.alarm_level, android.R.layout.simple_spinner_item);
        levelAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinnerLevel.setAdapter(levelAdapter);

        // 筛选器监听
        spinnerStatus.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override
            public void onItemSelected(AdapterView<?> parentView, android.view.View selectedItemView, int position, long id) {
                filterData();
            }

            @Override
            public void onNothingSelected(AdapterView<?> parentView) {}
        });

        spinnerLevel.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override
            public void onItemSelected(AdapterView<?> parentView, android.view.View selectedItemView, int position, long id) {
                filterData();
            }

            @Override
            public void onNothingSelected(AdapterView<?> parentView) {}
        });
    }

    // 筛选数据
    // 确保所有的if, for等语句都有对应的括号

    private void filterData() {
        // 获取用户输入和筛选条件
        String query = etSearch.getText().toString().toLowerCase().trim();
        String selectedStatus = spinnerStatus.getSelectedItem().toString();
        String selectedLevel = spinnerLevel.getSelectedItem().toString();
        Log.d("query", "query: " + query);
        Log.d("selectedStatus", "selectedStatus: " + selectedStatus);
        Log.d("selectedLevel", "selectedLevel: " + selectedLevel);

        // 将中文筛选项转换为后端值
        String statusFilter = convertStatusToCode(selectedStatus);
        String levelFilter = convertLevelToCode(selectedLevel);

        Log.d("statusFilter", "statusFilter: " + statusFilter);
        Log.d("levelFilter", "levelFilter: " + levelFilter);

        // 触发更新
        alarmViewModel.filterData(query, statusFilter, levelFilter);
    }

    /**
     * 将中文状态转换为代码值
     */
    private String convertStatusToCode(String chineseStatus) {
        switch (chineseStatus) {
            case "待处理":
                return "pending";
            case "已处置":
                return "resolved";
            case "所有状态":
            default:
                return "all";
        }
    }

    /**
     * 将中文级别转换为代码值
     */
    private String convertLevelToCode(String chineseLevel) {
        switch (chineseLevel) {
            case "高危":
                return "high";
            case "警告":
                return "medium";
            case "提示":
                return "low";
            case "所有级别":
            default:
                return "all";
        }
    }

}


