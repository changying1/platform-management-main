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

public class BackupSettingsFragment extends Fragment {

    private SystemSettings settings;

    // Views
    private SwitchMaterial switchAutoBackup;
    private Spinner spinnerBackupFrequency;
    private TextInputEditText etBackupTime;
    private Slider sliderBackupRetention;
    private TextView tvBackupRetentionValue;

    public static BackupSettingsFragment newInstance(SystemSettings settings) {
        BackupSettingsFragment fragment = new BackupSettingsFragment();
        fragment.settings = settings;
        return fragment;
    }

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        return inflater.inflate(R.layout.fragment_settings_backup, container, false);
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
        switchAutoBackup = view.findViewById(R.id.switchAutoBackup);
        spinnerBackupFrequency = view.findViewById(R.id.spinnerBackupFrequency);
        etBackupTime = view.findViewById(R.id.etBackupTime);
        sliderBackupRetention = view.findViewById(R.id.sliderBackupRetention);
        tvBackupRetentionValue = view.findViewById(R.id.tvBackupRetentionValue);

        view.findViewById(R.id.btnManualBackup).setOnClickListener(v -> {
            Toast.makeText(requireContext(), "请在Web端执行手动备份", Toast.LENGTH_SHORT).show();
        });

        view.findViewById(R.id.btnViewBackups).setOnClickListener(v -> {
            Toast.makeText(requireContext(), "请在Web端查看备份文件", Toast.LENGTH_SHORT).show();
        });

        view.findViewById(R.id.btnViewStoragePaths).setOnClickListener(v -> {
            Toast.makeText(requireContext(), "请在Web端配置存储路径", Toast.LENGTH_SHORT).show();
        });
    }

    private void setupSpinners() {
        String[] frequencies = {"每天", "每周", "每月"};
        ArrayAdapter<String> adapter = new ArrayAdapter<>(requireContext(),
                android.R.layout.simple_spinner_item, frequencies);
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinnerBackupFrequency.setAdapter(adapter);
    }

    private void setupSliders() {
        sliderBackupRetention.addOnChangeListener((slider, value, fromUser) -> {
            tvBackupRetentionValue.setText((int) value + "个");
        });
    }

    private void loadSettings() {
        if (settings == null) return;

        // 自动备份
        switchAutoBackup.setChecked(settings.isAutoBackupEnabled());

        // 备份频率
        String frequency = settings.getBackupFrequency();
        if (frequency != null) {
            String[] frequencies = {"daily", "weekly", "monthly"};
            for (int i = 0; i < frequencies.length; i++) {
                if (frequencies[i].equals(frequency)) {
                    spinnerBackupFrequency.setSelection(i);
                    break;
                }
            }
        }

        // 备份时间
        etBackupTime.setText(settings.getBackupTime());

        // 备份保留数量
        int retentionCount = settings.getBackupRetentionCount();
        if (retentionCount < 1) retentionCount = 1;
        if (retentionCount > 30) retentionCount = 30;
        sliderBackupRetention.setValue(retentionCount);
        tvBackupRetentionValue.setText(retentionCount + "个");
    }

    public void collectSettings(SystemSettings settings) {
        settings.setAutoBackupEnabled(switchAutoBackup.isChecked());

        String[] frequencies = {"daily", "weekly", "monthly"};
        int selectedPosition = spinnerBackupFrequency.getSelectedItemPosition();
        settings.setBackupFrequency(frequencies[selectedPosition]);

        settings.setBackupTime(etBackupTime.getText() != null ? etBackupTime.getText().toString() : "02:00");
        settings.setBackupRetentionCount((int) sliderBackupRetention.getValue());
    }
}
