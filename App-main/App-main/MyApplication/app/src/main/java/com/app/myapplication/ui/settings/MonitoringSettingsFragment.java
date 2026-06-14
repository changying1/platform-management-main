package com.app.myapplication.ui.settings;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.LinearLayout;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.cardview.widget.CardView;
import androidx.fragment.app.Fragment;

import com.app.myapplication.R;
import com.app.myapplication.data.model.AIAlgorithmConfig;
import com.app.myapplication.data.model.SystemSettings;
import com.google.android.material.textfield.TextInputEditText;

import java.util.ArrayList;
import java.util.List;

public class MonitoringSettingsFragment extends Fragment {

    private SystemSettings settings;
    private TextInputEditText etAlgoSearch;
    private Spinner spinnerAlgoCategory, spinnerAlgoLevel;
    private LinearLayout containerAlgorithms;
    private List<AIAlgorithmConfig> algorithmList = new ArrayList<>();
    private List<AIAlgorithmConfig> displayedList = new ArrayList<>();

    public static MonitoringSettingsFragment newInstance(SystemSettings settings) {
        MonitoringSettingsFragment fragment = new MonitoringSettingsFragment();
        fragment.settings = settings;
        return fragment;
    }

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        return inflater.inflate(R.layout.fragment_settings_monitoring, container, false);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);

        initViews(view);
        setupSpinners();
        loadAlgorithms();
        renderAlgorithmList();

        view.findViewById(R.id.btnConfigureDevices).setOnClickListener(v -> {
            Toast.makeText(requireContext(), "请在Web端配置监控设备", Toast.LENGTH_SHORT).show();
        });
    }

    private void initViews(View view) {
        etAlgoSearch = view.findViewById(R.id.etAlgoSearch);
        spinnerAlgoCategory = view.findViewById(R.id.spinnerAlgoCategory);
        spinnerAlgoLevel = view.findViewById(R.id.spinnerAlgoLevel);
        containerAlgorithms = view.findViewById(R.id.containerAlgorithms);
    }

    private void setupSpinners() {
        // 分类选项
        String[] categories = {"全部分类", "安全防护", "作业行为", "人员安全", "人员管理", "消防安全", "区域管理", "动火作业", "临边防护", "起重作业", "设备安全"};
        ArrayAdapter<String> categoryAdapter = new ArrayAdapter<>(requireContext(),
                android.R.layout.simple_spinner_item, categories);
        categoryAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinnerAlgoCategory.setAdapter(categoryAdapter);

        // 级别选项
        String[] levels = {"全部级别", "高危", "警告", "提示"};
        ArrayAdapter<String> levelAdapter = new ArrayAdapter<>(requireContext(),
                android.R.layout.simple_spinner_item, levels);
        levelAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinnerAlgoLevel.setAdapter(levelAdapter);

        spinnerAlgoCategory.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override
            public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                filterAlgorithms();
            }
            @Override
            public void onNothingSelected(AdapterView<?> parent) {}
        });

        spinnerAlgoLevel.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override
            public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                filterAlgorithms();
            }
            @Override
            public void onNothingSelected(AdapterView<?> parent) {}
        });
    }

    private void loadAlgorithms() {
        // 从settings加载AI算法配置
        if (settings != null && settings.getAiAlarmLevelConfigs() != null) {
            algorithmList.clear();
            algorithmList.addAll(settings.getAiAlarmLevelConfigs());
        } else {
            // 默认算法列表
            algorithmList.add(new AIAlgorithmConfig("1", "未佩戴安全帽", "安全防护", "helmet_missing", "high", "检测人员是否正确佩戴安全帽"));
            algorithmList.add(new AIAlgorithmConfig("2", "未系安全带", "安全防护", "safety_harness_missing", "high", "高空作业人员安全带佩戴检测"));
            algorithmList.add(new AIAlgorithmConfig("3", "吸烟检测", "作业行为", "smoking", "high", "禁烟区域吸烟行为检测"));
            algorithmList.add(new AIAlgorithmConfig("4", "人员倒地", "人员安全", "person_fall", "high", "人员摔倒、倒地异常检测"));
            algorithmList.add(new AIAlgorithmConfig("5", "陌生人员闯入", "人员管理", "unauthorized_person", "high", "未授权人员进入管控区域"));
            algorithmList.add(new AIAlgorithmConfig("6", "明火检测", "消防安全", "fire_detected", "high", "明火、烟雾、火焰检测"));
            algorithmList.add(new AIAlgorithmConfig("7", "禁入区无安全帽", "区域管理", "no_helmet_area", "medium", "危险区域未佩戴安全帽"));
            algorithmList.add(new AIAlgorithmConfig("8", "人员聚集", "人员管理", "crowd_detection", "medium", "人员过度聚集检测"));
            algorithmList.add(new AIAlgorithmConfig("9", "反光衣缺失", "安全防护", "reflective_vest_missing", "high", "施工现场反光衣佩戴检测"));
            algorithmList.add(new AIAlgorithmConfig("10", "电气焊作业", "动火作业", "welding_detection", "high", "违规电气焊作业检测"));
            algorithmList.add(new AIAlgorithmConfig("11", "洞口防护缺失", "临边防护", "hole_protection", "high", "洞口、临边防护设施缺失"));
            algorithmList.add(new AIAlgorithmConfig("12", "起重半径违规", "起重作业", "lifting_radius", "high", "人员进入起重作业危险半径"));
            algorithmList.add(new AIAlgorithmConfig("13", "动火监护缺失", "动火作业", "hotwork_supervisor", "high", "动火作业无现场监护"));
            algorithmList.add(new AIAlgorithmConfig("14", "特种设备操作", "设备安全", "special_equipment", "high", "无证操作特种设备"));
            algorithmList.add(new AIAlgorithmConfig("15", "安全帽颜色合规", "安全防护", "helmet_color", "low", "不同岗位安全帽颜色规范检查"));
        }
        displayedList = new ArrayList<>(algorithmList);
    }

    private void filterAlgorithms() {
        String category = spinnerAlgoCategory.getSelectedItem().toString();
        String level = spinnerAlgoLevel.getSelectedItem().toString();
        String search = etAlgoSearch.getText() != null ? etAlgoSearch.getText().toString() : "";

        displayedList.clear();
        for (AIAlgorithmConfig config : algorithmList) {
            boolean matchCategory = category.equals("全部分类") || category.equals(config.getCategory());
            boolean matchLevel = level.equals("全部级别") || level.equals(getLevelName(config.getLevel()));
            boolean matchSearch = search.isEmpty() || config.getName().contains(search);

            if (matchCategory && matchLevel && matchSearch) {
                displayedList.add(config);
            }
        }
        renderAlgorithmList();
    }

    private void renderAlgorithmList() {
        containerAlgorithms.removeAllViews();
        LayoutInflater inflater = LayoutInflater.from(requireContext());

        for (int i = 0; i < displayedList.size(); i++) {
            AIAlgorithmConfig config = displayedList.get(i);
            View itemView = createAlgorithmItemView(inflater, config);
            containerAlgorithms.addView(itemView);
        }
    }

    private View createAlgorithmItemView(LayoutInflater inflater, AIAlgorithmConfig config) {
        CardView cardView = new CardView(requireContext());
        cardView.setLayoutParams(new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT));
        cardView.setCardElevation(4f);
        cardView.setRadius(8f);
        CardView.LayoutParams cardParams = new CardView.LayoutParams(
                CardView.LayoutParams.MATCH_PARENT,
                CardView.LayoutParams.WRAP_CONTENT);
        cardParams.setMargins(0, 0, 0, 16);
        cardView.setLayoutParams(cardParams);
        cardView.setContentPadding(24, 24, 24, 24);

        LinearLayout mainLayout = new LinearLayout(requireContext());
        mainLayout.setOrientation(LinearLayout.HORIZONTAL);
        mainLayout.setLayoutParams(new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT));

        // 级别指示器
        View levelIndicator = new View(requireContext());
        LinearLayout.LayoutParams indicatorParams = new LinearLayout.LayoutParams(8, LinearLayout.LayoutParams.MATCH_PARENT);
        indicatorParams.setMargins(0, 0, 24, 0);
        levelIndicator.setLayoutParams(indicatorParams);

        int color;
        switch (config.getLevel()) {
            case "high":
                color = 0xFFD32F2F;
                break;
            case "medium":
                color = 0xFFF57C00;
                break;
            default:
                color = 0xFF388E3C;
        }
        levelIndicator.setBackgroundColor(color);
        mainLayout.addView(levelIndicator);

        // 内容区域
        LinearLayout contentLayout = new LinearLayout(requireContext());
        contentLayout.setOrientation(LinearLayout.VERTICAL);
        contentLayout.setLayoutParams(new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

        // 名称和分类行
        LinearLayout headerLayout = new LinearLayout(requireContext());
        headerLayout.setOrientation(LinearLayout.HORIZONTAL);
        headerLayout.setLayoutParams(new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT));

        TextView tvName = new TextView(requireContext());
        tvName.setText(config.getName());
        tvName.setTextSize(16);
        tvName.setTextColor(0xFF333333);
        tvName.setTypeface(null, android.graphics.Typeface.BOLD);
        tvName.setLayoutParams(new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        headerLayout.addView(tvName);

        TextView tvCategory = new TextView(requireContext());
        tvCategory.setText(config.getCategory());
        tvCategory.setTextSize(12);
        tvCategory.setTextColor(0xFF666666);
        tvCategory.setBackgroundColor(0xFFF5F5F5);
        tvCategory.setPadding(16, 8, 16, 8);
        headerLayout.addView(tvCategory);

        contentLayout.addView(headerLayout);

        // 描述
        TextView tvDescription = new TextView(requireContext());
        tvDescription.setText(config.getDescription());
        tvDescription.setTextSize(14);
        tvDescription.setTextColor(0xFF888888);
        tvDescription.setPadding(0, 8, 0, 16);
        contentLayout.addView(tvDescription);

        // 级别选择行
        LinearLayout levelLayout = new LinearLayout(requireContext());
        levelLayout.setOrientation(LinearLayout.HORIZONTAL);
        levelLayout.setLayoutParams(new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT));
        levelLayout.setGravity(android.view.Gravity.CENTER_VERTICAL);

        TextView tvLevelLabel = new TextView(requireContext());
        tvLevelLabel.setText("告警级别:");
        tvLevelLabel.setTextSize(14);
        tvLevelLabel.setTextColor(0xFF666666);
        levelLayout.addView(tvLevelLabel);

        Spinner spinnerLevel = new Spinner(requireContext());
        LinearLayout.LayoutParams spinnerParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        spinnerParams.setMargins(16, 0, 0, 0);
        spinnerLevel.setLayoutParams(spinnerParams);

        String[] levels = {"高危", "警告", "提示"};
        ArrayAdapter<String> adapter = new ArrayAdapter<>(requireContext(),
                android.R.layout.simple_spinner_item, levels);
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinnerLevel.setAdapter(adapter);

        String currentLevel = config.getLevel();
        int levelIndex = 0;
        if ("medium".equals(currentLevel)) levelIndex = 1;
        else if ("low".equals(currentLevel)) levelIndex = 2;
        spinnerLevel.setSelection(levelIndex);

        spinnerLevel.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override
            public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                String newLevel = "high";
                if (position == 1) newLevel = "medium";
                else if (position == 2) newLevel = "low";
                config.setLevel(newLevel);

                // 更新指示器颜色
                int newColor;
                switch (newLevel) {
                    case "high":
                        newColor = 0xFFD32F2F;
                        break;
                    case "medium":
                        newColor = 0xFFF57C00;
                        break;
                    default:
                        newColor = 0xFF388E3C;
                }
                levelIndicator.setBackgroundColor(newColor);
            }

            @Override
            public void onNothingSelected(AdapterView<?> parent) {}
        });

        levelLayout.addView(spinnerLevel);
        contentLayout.addView(levelLayout);

        mainLayout.addView(contentLayout);
        cardView.addView(mainLayout);

        return cardView;
    }

    private String getLevelName(String level) {
        switch (level) {
            case "high": return "高危";
            case "medium": return "警告";
            case "low": return "提示";
            default: return level;
        }
    }

    public void collectSettings(SystemSettings settings) {
        // 收集AI算法配置
        settings.setAiAlarmLevelConfigs(algorithmList);
    }
}
