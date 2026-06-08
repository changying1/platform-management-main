package com.app.myapplication.ui.settings;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
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
 * 围栏设置 Fragment
 */
public class FenceSettingsFragment extends Fragment {

    private Slider sliderDetectionInterval, sliderDefaultRadius;
    private TextView tvDetectionIntervalValue, tvDefaultRadiusValue;
    private Spinner spinnerDefaultBehavior, spinnerDefaultSeverity;
    private Slider sliderAlarmSilence;
    private TextView tvAlarmSilenceValue;
    private Slider sliderTrackRetention, sliderTrackInterval;
    private TextView tvTrackRetentionValue, tvTrackIntervalValue;
    private SwitchMaterial switchStationaryReminder;
    private Slider sliderStationaryMinutes;
    private TextView tvStationaryMinutesValue;

    private SystemSettings settings;

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        return inflater.inflate(R.layout.fragment_settings_fence, container, false);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);

        initViews(view);
        setupListeners();
    }

    private void initViews(View view) {
        sliderDetectionInterval = view.findViewById(R.id.sliderDetectionInterval);
        tvDetectionIntervalValue = view.findViewById(R.id.tvDetectionIntervalValue);
        sliderDefaultRadius = view.findViewById(R.id.sliderDefaultRadius);
        tvDefaultRadiusValue = view.findViewById(R.id.tvDefaultRadiusValue);
        spinnerDefaultBehavior = view.findViewById(R.id.spinnerDefaultBehavior);
        spinnerDefaultSeverity = view.findViewById(R.id.spinnerDefaultSeverity);
        sliderAlarmSilence = view.findViewById(R.id.sliderAlarmSilence);
        tvAlarmSilenceValue = view.findViewById(R.id.tvAlarmSilenceValue);

        sliderTrackRetention = view.findViewById(R.id.sliderTrackRetention);
        tvTrackRetentionValue = view.findViewById(R.id.tvTrackRetentionValue);
        sliderTrackInterval = view.findViewById(R.id.sliderTrackInterval);
        tvTrackIntervalValue = view.findViewById(R.id.tvTrackIntervalValue);

        switchStationaryReminder = view.findViewById(R.id.switchStationaryReminder);
        sliderStationaryMinutes = view.findViewById(R.id.sliderStationaryMinutes);
        tvStationaryMinutesValue = view.findViewById(R.id.tvStationaryMinutesValue);

        // 设置默认行为选项
        String[] behaviors = {"禁入", "禁出"};
        ArrayAdapter<String> behaviorAdapter = new ArrayAdapter<>(requireContext(),
                android.R.layout.simple_spinner_item, behaviors);
        behaviorAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinnerDefaultBehavior.setAdapter(behaviorAdapter);

        // 设置默认严重级别选项
        String[] severities = {"普通", "风险", "严重"};
        ArrayAdapter<String> severityAdapter = new ArrayAdapter<>(requireContext(),
                android.R.layout.simple_spinner_item, severities);
        severityAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinnerDefaultSeverity.setAdapter(severityAdapter);
    }

    private void setupListeners() {
        sliderDetectionInterval.addOnChangeListener((slider, value, fromUser) -> {
            tvDetectionIntervalValue.setText((int) value + "秒");
        });

        sliderDefaultRadius.addOnChangeListener((slider, value, fromUser) -> {
            tvDefaultRadiusValue.setText((int) value + "米");
        });

        sliderAlarmSilence.addOnChangeListener((slider, value, fromUser) -> {
            tvAlarmSilenceValue.setText((int) value + "分钟");
        });

        sliderTrackRetention.addOnChangeListener((slider, value, fromUser) -> {
            tvTrackRetentionValue.setText((int) value + "天");
        });

        sliderTrackInterval.addOnChangeListener((slider, value, fromUser) -> {
            tvTrackIntervalValue.setText((int) value + "秒");
        });

        sliderStationaryMinutes.addOnChangeListener((slider, value, fromUser) -> {
            tvStationaryMinutesValue.setText((int) value + "分钟");
        });
    }

    public void updateSettings(SystemSettings settings) {
        this.settings = settings;

        if (sliderDetectionInterval != null) {
            sliderDetectionInterval.setValue(settings.getFenceDetectionInterval());
            tvDetectionIntervalValue.setText(settings.getFenceDetectionInterval() + "秒");
        }

        if (sliderDefaultRadius != null) {
            sliderDefaultRadius.setValue(settings.getFenceDefaultRadius());
            tvDefaultRadiusValue.setText(settings.getFenceDefaultRadius() + "米");
        }

        if (spinnerDefaultBehavior != null) {
            String behavior = settings.getFenceDefaultBehavior();
            spinnerDefaultBehavior.setSelection("No Exit".equals(behavior) ? 1 : 0);
        }

        if (spinnerDefaultSeverity != null) {
            String[] severities = {"normal", "risk", "severe"};
            int position = 0;
            for (int i = 0; i < severities.length; i++) {
                if (severities[i].equals(settings.getFenceDefaultSeverity())) {
                    position = i;
                    break;
                }
            }
            spinnerDefaultSeverity.setSelection(position);
        }

        if (sliderAlarmSilence != null) {
            sliderAlarmSilence.setValue(settings.getFenceAlarmSilenceMinutes());
            tvAlarmSilenceValue.setText(settings.getFenceAlarmSilenceMinutes() + "分钟");
        }

        if (sliderTrackRetention != null) {
            sliderTrackRetention.setValue(settings.getTrackRetentionDays());
            tvTrackRetentionValue.setText(settings.getTrackRetentionDays() + "天");
        }

        if (sliderTrackInterval != null) {
            sliderTrackInterval.setValue(settings.getTrackRecordInterval());
            tvTrackIntervalValue.setText(settings.getTrackRecordInterval() + "秒");
        }

        if (switchStationaryReminder != null) {
            switchStationaryReminder.setChecked(settings.isStationaryReminderEnabled());
        }

        if (sliderStationaryMinutes != null) {
            sliderStationaryMinutes.setValue(settings.getStationaryReminderMinutes());
            tvStationaryMinutesValue.setText(settings.getStationaryReminderMinutes() + "分钟");
        }
    }

    public void collectSettings(SystemSettings settings) {
        if (sliderDetectionInterval != null) {
            settings.setFenceDetectionInterval((int) sliderDetectionInterval.getValue());
        }

        if (sliderDefaultRadius != null) {
            settings.setFenceDefaultRadius((int) sliderDefaultRadius.getValue());
        }

        if (spinnerDefaultBehavior != null) {
            settings.setFenceDefaultBehavior(spinnerDefaultBehavior.getSelectedItemPosition() == 0 ? "No Entry" : "No Exit");
        }

        if (spinnerDefaultSeverity != null) {
            String[] severities = {"normal", "risk", "severe"};
            settings.setFenceDefaultSeverity(severities[spinnerDefaultSeverity.getSelectedItemPosition()]);
        }

        if (sliderAlarmSilence != null) {
            settings.setFenceAlarmSilenceMinutes((int) sliderAlarmSilence.getValue());
        }

        if (sliderTrackRetention != null) {
            settings.setTrackRetentionDays((int) sliderTrackRetention.getValue());
        }

        if (sliderTrackInterval != null) {
            settings.setTrackRecordInterval((int) sliderTrackInterval.getValue());
        }

        if (switchStationaryReminder != null) {
            settings.setStationaryReminderEnabled(switchStationaryReminder.isChecked());
        }

        if (sliderStationaryMinutes != null) {
            settings.setStationaryReminderMinutes((int) sliderStationaryMinutes.getValue());
        }
    }
}
