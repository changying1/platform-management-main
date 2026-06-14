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

public class LogSettingsFragment extends Fragment {

    private SystemSettings settings;

    // Views
    private Slider sliderLogRetention, sliderLoginFailedAlert;
    private TextView tvLogRetentionValue, tvLoginFailedAlertValue;
    private Spinner spinnerLogLevel, spinnerLogEncoding;
    private SwitchMaterial switchLogAutoClean, switchLogOperation, switchLogLogin,
            switchLogAlarm, switchLogConfig, switchLogAudit, switchLogDiff,
            switchLogErrorReport, switchLogAutoCompress;

    public static LogSettingsFragment newInstance(SystemSettings settings) {
        LogSettingsFragment fragment = new LogSettingsFragment();
        fragment.settings = settings;
        return fragment;
    }

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        return inflater.inflate(R.layout.fragment_settings_log, container, false);
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
        sliderLogRetention = view.findViewById(R.id.sliderLogRetention);
        tvLogRetentionValue = view.findViewById(R.id.tvLogRetentionValue);
        spinnerLogLevel = view.findViewById(R.id.spinnerLogLevel);
        switchLogAutoClean = view.findViewById(R.id.switchLogAutoClean);

        switchLogOperation = view.findViewById(R.id.switchLogOperation);
        switchLogLogin = view.findViewById(R.id.switchLogLogin);
        switchLogAlarm = view.findViewById(R.id.switchLogAlarm);
        switchLogConfig = view.findViewById(R.id.switchLogConfig);

        switchLogAudit = view.findViewById(R.id.switchLogAudit);
        switchLogDiff = view.findViewById(R.id.switchLogDiff);
        spinnerLogEncoding = view.findViewById(R.id.spinnerLogEncoding);

        sliderLoginFailedAlert = view.findViewById(R.id.sliderLoginFailedAlert);
        tvLoginFailedAlertValue = view.findViewById(R.id.tvLoginFailedAlertValue);
        switchLogErrorReport = view.findViewById(R.id.switchLogErrorReport);
        switchLogAutoCompress = view.findViewById(R.id.switchLogAutoCompress);


    }

    private void setupSpinners() {
        // 日志级别
        String[] levels = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"};
        ArrayAdapter<String> levelAdapter = new ArrayAdapter<>(requireContext(),
                android.R.layout.simple_spinner_item, levels);
        levelAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinnerLogLevel.setAdapter(levelAdapter);

        // 编码
        String[] encodings = {"UTF-8", "GBK", "GB2312"};
        ArrayAdapter<String> encodingAdapter = new ArrayAdapter<>(requireContext(),
                android.R.layout.simple_spinner_item, encodings);
        encodingAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinnerLogEncoding.setAdapter(encodingAdapter);
    }

    private void setupSliders() {
        sliderLogRetention.addOnChangeListener((slider, value, fromUser) -> {
            tvLogRetentionValue.setText((int) value + "天");
        });

        sliderLoginFailedAlert.addOnChangeListener((slider, value, fromUser) -> {
            tvLoginFailedAlertValue.setText((int) value + "次");
        });
    }

    private void loadSettings() {
        if (settings == null) return;

        // 日志保留天数
        int logDays = settings.getLogRetentionDays();
        if (logDays < 30) logDays = 30;
        if (logDays > 365) logDays = 365;
        sliderLogRetention.setValue(logDays);
        tvLogRetentionValue.setText(logDays + "天");

        // 日志级别
        String level = settings.getLogLevel();
        if (level != null) {
            String[] levels = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"};
            for (int i = 0; i < levels.length; i++) {
                if (levels[i].equalsIgnoreCase(level)) {
                    spinnerLogLevel.setSelection(i);
                    break;
                }
            }
        }

        // 自动清理
        switchLogAutoClean.setChecked(settings.isLogAutoClean());

        // 日志类型
        switchLogOperation.setChecked(settings.isLogOperation());
        switchLogLogin.setChecked(settings.isLogLogin());
        switchLogAlarm.setChecked(settings.isLogAlarm());
        switchLogConfig.setChecked(settings.isLogConfig());

        // 审计日志
        switchLogAudit.setChecked(settings.isLogAudit());
        switchLogDiff.setChecked(settings.isLogDiff());

        // 编码
        String encoding = settings.getLogEncoding();
        if (encoding != null) {
            String[] encodings = {"UTF-8", "GBK", "GB2312"};
            for (int i = 0; i < encodings.length; i++) {
                if (encodings[i].equalsIgnoreCase(encoding)) {
                    spinnerLogEncoding.setSelection(i);
                    break;
                }
            }
        }

        // 安全设置
        int failedThreshold = settings.getLoginFailedAlertThreshold();
        if (failedThreshold < 1) failedThreshold = 1;
        if (failedThreshold > 10) failedThreshold = 10;
        sliderLoginFailedAlert.setValue(failedThreshold);
        tvLoginFailedAlertValue.setText(failedThreshold + "次");
        switchLogErrorReport.setChecked(settings.isLogErrorReport());
        switchLogAutoCompress.setChecked(settings.isLogAutoCompress());
    }

    public void collectSettings(SystemSettings settings) {
        settings.setLogRetentionDays((int) sliderLogRetention.getValue());
        settings.setLogLevel(spinnerLogLevel.getSelectedItem().toString());
        settings.setLogAutoClean(switchLogAutoClean.isChecked());

        settings.setLogOperation(switchLogOperation.isChecked());
        settings.setLogLogin(switchLogLogin.isChecked());
        settings.setLogAlarm(switchLogAlarm.isChecked());
        settings.setLogConfig(switchLogConfig.isChecked());

        settings.setLogAudit(switchLogAudit.isChecked());
        settings.setLogDiff(switchLogDiff.isChecked());
        settings.setLogEncoding(spinnerLogEncoding.getSelectedItem().toString());

        settings.setLoginFailedAlertThreshold((int) sliderLoginFailedAlert.getValue());
        settings.setLogErrorReport(switchLogErrorReport.isChecked());
        settings.setLogAutoCompress(switchLogAutoCompress.isChecked());
    }
}
