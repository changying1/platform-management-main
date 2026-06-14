package com.app.myapplication.ui.settings;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;

import com.app.myapplication.R;
import com.app.myapplication.data.model.SystemSettings;
import com.google.android.material.slider.Slider;
import com.google.android.material.switchmaterial.SwitchMaterial;
import com.google.android.material.textfield.TextInputEditText;

public class AISettingsFragment extends Fragment {

    private SystemSettings settings;

    // Views
    private Spinner spinnerAiModel, spinnerAiKb;
    private TextInputEditText etAiApiUrl, etAiApiKey, etAiSystemPrompt;
    private Slider sliderAiTemperature, sliderAiMaxTokens, sliderAiContextRounds;
    private TextView tvAiTemperatureValue, tvAiMaxTokensValue, tvAiContextRoundsValue;
    private SwitchMaterial switchAiEnableRAG;

    public static AISettingsFragment newInstance(SystemSettings settings) {
        AISettingsFragment fragment = new AISettingsFragment();
        fragment.settings = settings;
        return fragment;
    }

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        return inflater.inflate(R.layout.fragment_settings_ai, container, false);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);

        initViews(view);
        setupSpinners();
        setupSliders();
        loadSettings();
    }

    private void initViews(View view) {
        spinnerAiModel = view.findViewById(R.id.spinnerAiModel);
        etAiApiUrl = view.findViewById(R.id.etAiApiUrl);
        etAiApiKey = view.findViewById(R.id.etAiApiKey);
        sliderAiTemperature = view.findViewById(R.id.sliderAiTemperature);
        tvAiTemperatureValue = view.findViewById(R.id.tvAiTemperatureValue);
        sliderAiMaxTokens = view.findViewById(R.id.sliderAiMaxTokens);
        tvAiMaxTokensValue = view.findViewById(R.id.tvAiMaxTokensValue);

        switchAiEnableRAG = view.findViewById(R.id.switchAiEnableRAG);
        spinnerAiKb = view.findViewById(R.id.spinnerAiKb);

        sliderAiContextRounds = view.findViewById(R.id.sliderAiContextRounds);
        tvAiContextRoundsValue = view.findViewById(R.id.tvAiContextRoundsValue);
        etAiSystemPrompt = view.findViewById(R.id.etAiSystemPrompt);

        view.findViewById(R.id.btnKbManager).setOnClickListener(v -> {
            Toast.makeText(requireContext(), "请在Web端管理知识库", Toast.LENGTH_SHORT).show();
        });

        view.findViewById(R.id.btnKbCreator).setOnClickListener(v -> {
            Toast.makeText(requireContext(), "请在Web端创建知识库", Toast.LENGTH_SHORT).show();
        });
    }

    private void setupSpinners() {
        // AI模型
        String[] models = {"DeepSeek-R1-Distill-Qwen-7B-F16"};
        ArrayAdapter<String> modelAdapter = new ArrayAdapter<>(requireContext(),
                android.R.layout.simple_spinner_item, models);
        modelAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinnerAiModel.setAdapter(modelAdapter);

        // 知识库
        String[] kbs = {"default (默认知识库)"};
        ArrayAdapter<String> kbAdapter = new ArrayAdapter<>(requireContext(),
                android.R.layout.simple_spinner_item, kbs);
        kbAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinnerAiKb.setAdapter(kbAdapter);
    }

    private void setupSliders() {
        sliderAiTemperature.addOnChangeListener((slider, value, fromUser) -> {
            tvAiTemperatureValue.setText(String.format("%.1f", value));
        });

        sliderAiMaxTokens.addOnChangeListener((slider, value, fromUser) -> {
            tvAiMaxTokensValue.setText(String.valueOf((int) value));
        });

        sliderAiContextRounds.addOnChangeListener((slider, value, fromUser) -> {
            tvAiContextRoundsValue.setText((int) value + "轮");
        });
    }

    private void loadSettings() {
        if (settings == null) return;

        // LLM配置
        etAiApiUrl.setText(settings.getAiApiUrl());
        etAiApiKey.setText(settings.getAiApiKey());

        float temperature = (float) settings.getAiTemperature();
        if (temperature < 0.0f) temperature = 0.0f;
        if (temperature > 2.0f) temperature = 2.0f;
        sliderAiTemperature.setValue(temperature);
        tvAiTemperatureValue.setText(String.format("%.1f", temperature));

        int maxTokens = settings.getAiMaxTokens();
        if (maxTokens < 512) maxTokens = 512;
        if (maxTokens > 8192) maxTokens = 8192;
        sliderAiMaxTokens.setValue(maxTokens);
        tvAiMaxTokensValue.setText(String.valueOf(maxTokens));

        // RAG配置
        switchAiEnableRAG.setChecked(settings.isAiEnableRAG());

        // 对话上下文
        int contextRounds = settings.getAiContextRounds();
        if (contextRounds < 1) contextRounds = 1;
        if (contextRounds > 10) contextRounds = 10;
        sliderAiContextRounds.setValue(contextRounds);
        tvAiContextRoundsValue.setText(contextRounds + "轮");
        etAiSystemPrompt.setText(settings.getAiSystemPrompt());
    }

    public void collectSettings(SystemSettings settings) {
        // LLM配置
        settings.setAiModelName(spinnerAiModel.getSelectedItem().toString());
        settings.setAiApiUrl(etAiApiUrl.getText() != null ? etAiApiUrl.getText().toString() : "");
        settings.setAiApiKey(etAiApiKey.getText() != null ? etAiApiKey.getText().toString() : "");
        settings.setAiTemperature(sliderAiTemperature.getValue());
        settings.setAiMaxTokens((int) sliderAiMaxTokens.getValue());

        // RAG配置
        settings.setAiEnableRAG(switchAiEnableRAG.isChecked());
        settings.setAiKbName("default");

        // 对话上下文
        settings.setAiContextRounds((int) sliderAiContextRounds.getValue());
        settings.setAiSystemPrompt(etAiSystemPrompt.getText() != null ? etAiSystemPrompt.getText().toString() : "");
    }
}
