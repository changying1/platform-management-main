package com.app.myapplication.ui.settings;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
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

public class AccountSettingsFragment extends Fragment {

    private SystemSettings settings;

    // Views
    private SwitchMaterial switchForcePasswordChange, switchPasswordComplexity;
    private TextInputEditText etPasswordExpireDays;
    private Slider sliderPasswordMinLength, sliderLoginAttempts,
            sliderLockoutDuration, sliderMaxSessions;
    private TextView tvPasswordMinLengthValue, tvLoginAttemptsValue,
            tvLockoutDurationValue, tvMaxSessionsValue;

    public static AccountSettingsFragment newInstance(SystemSettings settings) {
        AccountSettingsFragment fragment = new AccountSettingsFragment();
        fragment.settings = settings;
        return fragment;
    }

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        return inflater.inflate(R.layout.fragment_settings_account, container, false);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);

        initViews(view);
        setupSliders();
        loadSettings();
    }

    private void initViews(View view) {
        switchForcePasswordChange = view.findViewById(R.id.switchForcePasswordChange);
        sliderPasswordMinLength = view.findViewById(R.id.sliderPasswordMinLength);
        tvPasswordMinLengthValue = view.findViewById(R.id.tvPasswordMinLengthValue);
        switchPasswordComplexity = view.findViewById(R.id.switchPasswordComplexity);
        etPasswordExpireDays = view.findViewById(R.id.etPasswordExpireDays);

        sliderLoginAttempts = view.findViewById(R.id.sliderLoginAttempts);
        tvLoginAttemptsValue = view.findViewById(R.id.tvLoginAttemptsValue);
        sliderLockoutDuration = view.findViewById(R.id.sliderLockoutDuration);
        tvLockoutDurationValue = view.findViewById(R.id.tvLockoutDurationValue);
        sliderMaxSessions = view.findViewById(R.id.sliderMaxSessions);
        tvMaxSessionsValue = view.findViewById(R.id.tvMaxSessionsValue);

        view.findViewById(R.id.btnViewPermissions).setOnClickListener(v ->
                Toast.makeText(requireContext(), "请在Web端查看权限说明", Toast.LENGTH_SHORT).show());
    }

    private void setupSliders() {
        sliderPasswordMinLength.addOnChangeListener((slider, value, fromUser) -> {
            tvPasswordMinLengthValue.setText((int) value + "位");
        });

        sliderLoginAttempts.addOnChangeListener((slider, value, fromUser) -> {
            tvLoginAttemptsValue.setText((int) value + "次");
        });

        sliderLockoutDuration.addOnChangeListener((slider, value, fromUser) -> {
            tvLockoutDurationValue.setText((int) value + "分钟");
        });

        sliderMaxSessions.addOnChangeListener((slider, value, fromUser) -> {
            tvMaxSessionsValue.setText((int) value + "个");
        });
    }

    private void loadSettings() {
        if (settings == null) return;

        // 密码策略
        switchForcePasswordChange.setChecked(settings.isForcePasswordChange());
        int minLength = settings.getPasswordMinLength();
        if (minLength < 6) minLength = 6;
        if (minLength > 16) minLength = 16;
        sliderPasswordMinLength.setValue(minLength);
        tvPasswordMinLengthValue.setText(minLength + "位");
        switchPasswordComplexity.setChecked(settings.isPasswordComplexity());
        etPasswordExpireDays.setText(String.valueOf(settings.getPasswordExpireDays()));

        // 登录安全
        int loginAttempts = settings.getMaxLoginAttempts();
        if (loginAttempts < 3) loginAttempts = 3;
        if (loginAttempts > 10) loginAttempts = 10;
        sliderLoginAttempts.setValue(loginAttempts);
        tvLoginAttemptsValue.setText(loginAttempts + "次");

        int lockoutDuration = settings.getLockoutDuration();
        if (lockoutDuration < 5) lockoutDuration = 5;
        if (lockoutDuration > 60) lockoutDuration = 60;
        sliderLockoutDuration.setValue(lockoutDuration);
        tvLockoutDurationValue.setText(lockoutDuration + "分钟");

        int maxSessions = settings.getMaxConcurrentSessions();
        if (maxSessions < 1) maxSessions = 1;
        if (maxSessions > 10) maxSessions = 10;
        sliderMaxSessions.setValue(maxSessions);
        tvMaxSessionsValue.setText(maxSessions + "个");
    }

    public void collectSettings(SystemSettings settings) {
        // 密码策略
        settings.setForcePasswordChange(switchForcePasswordChange.isChecked());
        settings.setPasswordMinLength((int) sliderPasswordMinLength.getValue());
        settings.setPasswordComplexity(switchPasswordComplexity.isChecked());
        String expireDays = etPasswordExpireDays.getText() != null ? etPasswordExpireDays.getText().toString() : "0";
        settings.setPasswordExpireDays(Integer.parseInt(expireDays.isEmpty() ? "0" : expireDays));

        // 登录安全
        settings.setMaxLoginAttempts((int) sliderLoginAttempts.getValue());
        settings.setLockoutDuration((int) sliderLockoutDuration.getValue());
        settings.setMaxConcurrentSessions((int) sliderMaxSessions.getValue());
    }
}
