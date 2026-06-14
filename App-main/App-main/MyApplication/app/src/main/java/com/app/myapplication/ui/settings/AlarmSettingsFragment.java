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
 * 告警设置 Fragment
 */
public class AlarmSettingsFragment extends Fragment {

    private SwitchMaterial switchAlarmPopup, switchAlarmSound;
    private SwitchMaterial switchAlarmSos, switchAlarmFence, switchAlarmLowBattery, switchAlarmOffline;
    private Spinner spinnerAlarmSoundType;
    private Slider sliderAlarmRetention;
    private TextView tvAlarmRetentionValue;
    private EditText etSafetyProductionDays;

    private SystemSettings settings;

    public static AlarmSettingsFragment newInstance(SystemSettings settings) {
        AlarmSettingsFragment fragment = new AlarmSettingsFragment();
        fragment.settings = settings;
        return fragment;
    }

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        return inflater.inflate(R.layout.fragment_settings_alarm, container, false);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);

        initViews(view);
        setupListeners();
        loadSettings();
    }

    private void loadSettings() {
        if (settings == null) return;
        updateSettings(settings);
    }

    private void initViews(View view) {
        switchAlarmPopup = view.findViewById(R.id.switchAlarmPopup);
        switchAlarmSound = view.findViewById(R.id.switchAlarmSound);
        switchAlarmSos = view.findViewById(R.id.switchAlarmSos);
        switchAlarmFence = view.findViewById(R.id.switchAlarmFence);
        switchAlarmLowBattery = view.findViewById(R.id.switchAlarmLowBattery);
        switchAlarmOffline = view.findViewById(R.id.switchAlarmOffline);
        spinnerAlarmSoundType = view.findViewById(R.id.spinnerAlarmSoundType);
        sliderAlarmRetention = view.findViewById(R.id.sliderAlarmRetention);
        tvAlarmRetentionValue = view.findViewById(R.id.tvAlarmRetentionValue);
        etSafetyProductionDays = view.findViewById(R.id.etSafetyProductionDays);

        // 设置声音类型选项
        String[] soundTypes = {"无", "标准", "紧急"};
        ArrayAdapter<String> adapter = new ArrayAdapter<>(requireContext(),
                android.R.layout.simple_spinner_item, soundTypes);
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinnerAlarmSoundType.setAdapter(adapter);
    }

    private void setupListeners() {
        sliderAlarmRetention.addOnChangeListener((slider, value, fromUser) -> {
            tvAlarmRetentionValue.setText((int) value + "天");
        });
    }

    public void updateSettings(SystemSettings settings) {
        this.settings = settings;

        if (switchAlarmPopup != null) {
            switchAlarmPopup.setChecked(settings.isAlarmPopup());
        }

        if (switchAlarmSound != null) {
            switchAlarmSound.setChecked(settings.isAlarmSound());
        }

        if (spinnerAlarmSoundType != null) {
            String[] types = {"none", "standard", "emergency"};
            int position = 1; // default standard
            for (int i = 0; i < types.length; i++) {
                if (types[i].equals(settings.getAlarmSoundType())) {
                    position = i;
                    break;
                }
            }
            spinnerAlarmSoundType.setSelection(position);
        }

        if (switchAlarmSos != null) {
            switchAlarmSos.setChecked(settings.isAlarmSosEnabled());
        }

        if (switchAlarmFence != null) {
            switchAlarmFence.setChecked(settings.isAlarmFenceEnabled());
        }

        if (switchAlarmLowBattery != null) {
            switchAlarmLowBattery.setChecked(settings.isAlarmLowBatteryEnabled());
        }

        if (switchAlarmOffline != null) {
            switchAlarmOffline.setChecked(settings.isAlarmOfflineEnabled());
        }

        if (sliderAlarmRetention != null) {
            int retentionDays = settings.getAlarmRetentionDays();
            // Ensure value is within slider range (7-365)
            if (retentionDays < 7) retentionDays = 7;
            if (retentionDays > 365) retentionDays = 365;
            sliderAlarmRetention.setValue(retentionDays);
            tvAlarmRetentionValue.setText(retentionDays + "天");
        }

        if (etSafetyProductionDays != null) {
            etSafetyProductionDays.setText(String.valueOf(settings.getSafetyProductionDays()));
        }
    }

    public void collectSettings(SystemSettings settings) {
        if (switchAlarmPopup != null) {
            settings.setAlarmPopup(switchAlarmPopup.isChecked());
        }

        if (switchAlarmSound != null) {
            settings.setAlarmSound(switchAlarmSound.isChecked());
        }

        if (spinnerAlarmSoundType != null) {
            String[] types = {"none", "standard", "emergency"};
            settings.setAlarmSoundType(types[spinnerAlarmSoundType.getSelectedItemPosition()]);
        }

        if (switchAlarmSos != null) {
            settings.setAlarmSosEnabled(switchAlarmSos.isChecked());
        }

        if (switchAlarmFence != null) {
            settings.setAlarmFenceEnabled(switchAlarmFence.isChecked());
        }

        if (switchAlarmLowBattery != null) {
            settings.setAlarmLowBatteryEnabled(switchAlarmLowBattery.isChecked());
        }

        if (switchAlarmOffline != null) {
            settings.setAlarmOfflineEnabled(switchAlarmOffline.isChecked());
        }

        if (sliderAlarmRetention != null) {
            settings.setAlarmRetentionDays((int) sliderAlarmRetention.getValue());
        }

        if (etSafetyProductionDays != null) {
            try {
                settings.setSafetyProductionDays(Integer.parseInt(etSafetyProductionDays.getText().toString().trim()));
            } catch (NumberFormatException e) {
                settings.setSafetyProductionDays(0);
            }
        }
    }
}
