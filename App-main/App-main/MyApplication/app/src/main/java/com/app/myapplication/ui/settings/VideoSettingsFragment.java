package com.app.myapplication.ui.settings;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.EditText;
import android.widget.Spinner;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;

import com.app.myapplication.R;
import com.app.myapplication.data.model.SystemSettings;
import com.google.android.material.slider.Slider;
import com.google.android.material.switchmaterial.SwitchMaterial;

/**
 * 视频设置 Fragment
 */
public class VideoSettingsFragment extends Fragment {

    private Slider sliderVideoRetention, sliderVideoSegment;
    private TextView tvVideoRetentionValue, tvVideoSegmentValue;
    private Spinner spinnerVideoQuality, spinnerStorageType;
    private Slider sliderAlarmVideoRetention, sliderAlarmSurround, sliderScreenshotRetention;
    private TextView tvAlarmVideoRetentionValue, tvAlarmSurroundValue, tvScreenshotRetentionValue;
    private EditText etStorageMaxSize;
    private Slider sliderWarningThreshold;
    private TextView tvWarningThresholdValue;
    private SwitchMaterial switchAutoCleanup;
    private Spinner spinnerCleanupStrategy;

    private SystemSettings settings;

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        return inflater.inflate(R.layout.fragment_settings_video, container, false);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);

        initViews(view);
        setupListeners();
    }

    private void initViews(View view) {
        sliderVideoRetention = view.findViewById(R.id.sliderVideoRetention);
        tvVideoRetentionValue = view.findViewById(R.id.tvVideoRetentionValue);
        sliderVideoSegment = view.findViewById(R.id.sliderVideoSegment);
        tvVideoSegmentValue = view.findViewById(R.id.tvVideoSegmentValue);
        spinnerVideoQuality = view.findViewById(R.id.spinnerVideoQuality);
        spinnerStorageType = view.findViewById(R.id.spinnerStorageType);

        sliderAlarmVideoRetention = view.findViewById(R.id.sliderAlarmVideoRetention);
        tvAlarmVideoRetentionValue = view.findViewById(R.id.tvAlarmVideoRetentionValue);
        sliderAlarmSurround = view.findViewById(R.id.sliderAlarmSurround);
        tvAlarmSurroundValue = view.findViewById(R.id.tvAlarmSurroundValue);
        sliderScreenshotRetention = view.findViewById(R.id.sliderScreenshotRetention);
        tvScreenshotRetentionValue = view.findViewById(R.id.tvScreenshotRetentionValue);

        etStorageMaxSize = view.findViewById(R.id.etStorageMaxSize);
        sliderWarningThreshold = view.findViewById(R.id.sliderWarningThreshold);
        tvWarningThresholdValue = view.findViewById(R.id.tvWarningThresholdValue);
        switchAutoCleanup = view.findViewById(R.id.switchAutoCleanup);
        spinnerCleanupStrategy = view.findViewById(R.id.spinnerCleanupStrategy);

        // 设置视频质量选项
        String[] qualities = {"高清 (H.264, 4Mbps)", "标清 (H.264, 2Mbps)", "流畅 (H.265, 1Mbps)"};
        ArrayAdapter<String> qualityAdapter = new ArrayAdapter<>(requireContext(),
                android.R.layout.simple_spinner_item, qualities);
        qualityAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinnerVideoQuality.setAdapter(qualityAdapter);

        // 设置存储方式选项
        String[] storageTypes = {"本地存储", "云存储", "混合存储"};
        ArrayAdapter<String> storageAdapter = new ArrayAdapter<>(requireContext(),
                android.R.layout.simple_spinner_item, storageTypes);
        storageAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinnerStorageType.setAdapter(storageAdapter);

        // 设置清理策略选项
        String[] strategies = {"按时间", "按空间", "时间和空间"};
        ArrayAdapter<String> strategyAdapter = new ArrayAdapter<>(requireContext(),
                android.R.layout.simple_spinner_item, strategies);
        strategyAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinnerCleanupStrategy.setAdapter(strategyAdapter);
    }

    private void setupListeners() {
        sliderVideoRetention.addOnChangeListener((slider, value, fromUser) -> {
            tvVideoRetentionValue.setText((int) value + "天");
        });

        sliderVideoSegment.addOnChangeListener((slider, value, fromUser) -> {
            tvVideoSegmentValue.setText((int) value + "分钟");
        });

        sliderAlarmVideoRetention.addOnChangeListener((slider, value, fromUser) -> {
            tvAlarmVideoRetentionValue.setText((int) value + "天");
        });

        sliderAlarmSurround.addOnChangeListener((slider, value, fromUser) -> {
            tvAlarmSurroundValue.setText(value + "分钟");
        });

        sliderScreenshotRetention.addOnChangeListener((slider, value, fromUser) -> {
            tvScreenshotRetentionValue.setText((int) value + "天");
        });

        sliderWarningThreshold.addOnChangeListener((slider, value, fromUser) -> {
            tvWarningThresholdValue.setText((int) value + "%");
        });
    }

    public void updateSettings(SystemSettings settings) {
        this.settings = settings;

        if (sliderVideoRetention != null) {
            sliderVideoRetention.setValue(settings.getVideoRetentionDays());
            tvVideoRetentionValue.setText(settings.getVideoRetentionDays() + "天");
        }

        if (sliderVideoSegment != null) {
            sliderVideoSegment.setValue(settings.getVideoSegmentMinutes());
            tvVideoSegmentValue.setText(settings.getVideoSegmentMinutes() + "分钟");
        }

        if (spinnerVideoQuality != null) {
            String[] qualities = {"high", "medium", "low"};
            int position = 0;
            for (int i = 0; i < qualities.length; i++) {
                if (qualities[i].equals(settings.getVideoQuality())) {
                    position = i;
                    break;
                }
            }
            spinnerVideoQuality.setSelection(position);
        }

        if (spinnerStorageType != null) {
            String[] types = {"local", "cloud", "hybrid"};
            int position = 0;
            for (int i = 0; i < types.length; i++) {
                if (types[i].equals(settings.getVideoStorageType())) {
                    position = i;
                    break;
                }
            }
            spinnerStorageType.setSelection(position);
        }

        if (sliderAlarmVideoRetention != null) {
            sliderAlarmVideoRetention.setValue(settings.getAlarmVideoRetentionDays());
            tvAlarmVideoRetentionValue.setText(settings.getAlarmVideoRetentionDays() + "天");
        }

        if (sliderAlarmSurround != null) {
            sliderAlarmSurround.setValue((float) settings.getAlarmVideoSurroundMinutes());
            tvAlarmSurroundValue.setText(settings.getAlarmVideoSurroundMinutes() + "分钟");
        }

        if (sliderScreenshotRetention != null) {
            sliderScreenshotRetention.setValue(settings.getAlarmScreenshotRetentionDays());
            tvScreenshotRetentionValue.setText(settings.getAlarmScreenshotRetentionDays() + "天");
        }

        if (etStorageMaxSize != null) {
            etStorageMaxSize.setText(String.valueOf(settings.getStorageMaxSizeGB()));
        }

        if (sliderWarningThreshold != null) {
            sliderWarningThreshold.setValue(settings.getStorageWarningThreshold());
            tvWarningThresholdValue.setText(settings.getStorageWarningThreshold() + "%");
        }

        if (switchAutoCleanup != null) {
            switchAutoCleanup.setChecked(settings.isStorageAutoCleanup());
        }

        if (spinnerCleanupStrategy != null) {
            String[] strategies = {"age", "space", "both"};
            int position = 2;
            for (int i = 0; i < strategies.length; i++) {
                if (strategies[i].equals(settings.getStorageCleanupStrategy())) {
                    position = i;
                    break;
                }
            }
            spinnerCleanupStrategy.setSelection(position);
        }
    }

    public void collectSettings(SystemSettings settings) {
        if (sliderVideoRetention != null) {
            settings.setVideoRetentionDays((int) sliderVideoRetention.getValue());
        }

        if (sliderVideoSegment != null) {
            settings.setVideoSegmentMinutes((int) sliderVideoSegment.getValue());
        }

        if (spinnerVideoQuality != null) {
            String[] qualities = {"high", "medium", "low"};
            settings.setVideoQuality(qualities[spinnerVideoQuality.getSelectedItemPosition()]);
        }

        if (spinnerStorageType != null) {
            String[] types = {"local", "cloud", "hybrid"};
            settings.setVideoStorageType(types[spinnerStorageType.getSelectedItemPosition()]);
        }

        if (sliderAlarmVideoRetention != null) {
            settings.setAlarmVideoRetentionDays((int) sliderAlarmVideoRetention.getValue());
        }

        if (sliderAlarmSurround != null) {
            settings.setAlarmVideoSurroundMinutes(sliderAlarmSurround.getValue());
        }

        if (sliderScreenshotRetention != null) {
            settings.setAlarmScreenshotRetentionDays((int) sliderScreenshotRetention.getValue());
        }

        if (etStorageMaxSize != null) {
            try {
                settings.setStorageMaxSizeGB(Integer.parseInt(etStorageMaxSize.getText().toString().trim()));
            } catch (NumberFormatException e) {
                settings.setStorageMaxSizeGB(500);
            }
        }

        if (sliderWarningThreshold != null) {
            settings.setStorageWarningThreshold((int) sliderWarningThreshold.getValue());
        }

        if (switchAutoCleanup != null) {
            settings.setStorageAutoCleanup(switchAutoCleanup.isChecked());
        }

        if (spinnerCleanupStrategy != null) {
            String[] strategies = {"age", "space", "both"};
            settings.setStorageCleanupStrategy(strategies[spinnerCleanupStrategy.getSelectedItemPosition()]);
        }
    }
}
