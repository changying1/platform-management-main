package com.app.myapplication.ui.settings;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;

import com.app.myapplication.R;
import com.app.myapplication.data.model.SystemSettings;
import com.google.android.material.checkbox.MaterialCheckBox;
import com.google.android.material.switchmaterial.SwitchMaterial;
import com.google.android.material.textfield.TextInputEditText;

public class NotificationSettingsFragment extends Fragment {

    private SystemSettings settings;

    // Views
    private SwitchMaterial switchSmsNotification, switchCallNotification;
    private LinearLayout layoutSmsConfig, layoutCallConfig;
    private TextInputEditText etSmsApiUrl, etSmsApiKey, etSmsSign, etSmsTemplateId,
            etCallApiUrl, etCallApiKey;
    private MaterialCheckBox cbSevereSms, cbSevereCall, cbMediumSms, cbMediumCall,
            cbLowSms, cbLowCall;

    public static NotificationSettingsFragment newInstance(SystemSettings settings) {
        NotificationSettingsFragment fragment = new NotificationSettingsFragment();
        fragment.settings = settings;
        return fragment;
    }

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        return inflater.inflate(R.layout.fragment_settings_notification, container, false);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);

        initViews(view);
        setupListeners();
        loadSettings();
    }

    private void initViews(View view) {
        // 短信通知
        switchSmsNotification = view.findViewById(R.id.switchSmsNotification);
        layoutSmsConfig = view.findViewById(R.id.layoutSmsConfig);
        etSmsApiUrl = view.findViewById(R.id.etSmsApiUrl);
        etSmsApiKey = view.findViewById(R.id.etSmsApiKey);
        etSmsSign = view.findViewById(R.id.etSmsSign);
        etSmsTemplateId = view.findViewById(R.id.etSmsTemplateId);

        // 电话通知
        switchCallNotification = view.findViewById(R.id.switchCallNotification);
        layoutCallConfig = view.findViewById(R.id.layoutCallConfig);
        etCallApiUrl = view.findViewById(R.id.etCallApiUrl);
        etCallApiKey = view.findViewById(R.id.etCallApiKey);

        // 告警级别
        cbSevereSms = view.findViewById(R.id.cbSevereSms);
        cbSevereCall = view.findViewById(R.id.cbSevereCall);
        cbMediumSms = view.findViewById(R.id.cbMediumSms);
        cbMediumCall = view.findViewById(R.id.cbMediumCall);
        cbLowSms = view.findViewById(R.id.cbLowSms);
        cbLowCall = view.findViewById(R.id.cbLowCall);

        view.findViewById(R.id.btnViewRecipients).setOnClickListener(v ->
                Toast.makeText(requireContext(), "请在Web端配置通知接收人", Toast.LENGTH_SHORT).show());
    }

    private void setupListeners() {
        switchSmsNotification.setOnCheckedChangeListener((buttonView, isChecked) -> {
            layoutSmsConfig.setVisibility(isChecked ? View.VISIBLE : View.GONE);
        });

        switchCallNotification.setOnCheckedChangeListener((buttonView, isChecked) -> {
            layoutCallConfig.setVisibility(isChecked ? View.VISIBLE : View.GONE);
        });
    }

    private void loadSettings() {
        if (settings == null) return;

        // 短信通知
        switchSmsNotification.setChecked(settings.isSmsNotificationEnabled());
        layoutSmsConfig.setVisibility(settings.isSmsNotificationEnabled() ? View.VISIBLE : View.GONE);
        etSmsApiUrl.setText(settings.getSmsApiUrl());
        etSmsApiKey.setText(settings.getSmsApiKey());
        etSmsSign.setText(settings.getSmsSign());
        etSmsTemplateId.setText(settings.getSmsTemplateId());

        // 电话通知
        switchCallNotification.setChecked(settings.isCallNotificationEnabled());
        layoutCallConfig.setVisibility(settings.isCallNotificationEnabled() ? View.VISIBLE : View.GONE);
        etCallApiUrl.setText(settings.getCallApiUrl());
        etCallApiKey.setText(settings.getCallApiKey());

        // 告警级别通知
        cbSevereSms.setChecked(settings.isSevereSmsEnabled());
        cbSevereCall.setChecked(settings.isSevereCallEnabled());
        cbMediumSms.setChecked(settings.isMediumSmsEnabled());
        cbMediumCall.setChecked(settings.isMediumCallEnabled());
        cbLowSms.setChecked(settings.isLowSmsEnabled());
        cbLowCall.setChecked(settings.isLowCallEnabled());
    }

    public void collectSettings(SystemSettings settings) {
        // 短信通知
        settings.setSmsNotificationEnabled(switchSmsNotification.isChecked());
        settings.setSmsApiUrl(etSmsApiUrl.getText() != null ? etSmsApiUrl.getText().toString() : "");
        settings.setSmsApiKey(etSmsApiKey.getText() != null ? etSmsApiKey.getText().toString() : "");
        settings.setSmsSign(etSmsSign.getText() != null ? etSmsSign.getText().toString() : "");
        settings.setSmsTemplateId(etSmsTemplateId.getText() != null ? etSmsTemplateId.getText().toString() : "");

        // 电话通知
        settings.setCallNotificationEnabled(switchCallNotification.isChecked());
        settings.setCallApiUrl(etCallApiUrl.getText() != null ? etCallApiUrl.getText().toString() : "");
        settings.setCallApiKey(etCallApiKey.getText() != null ? etCallApiKey.getText().toString() : "");

        // 告警级别通知
        settings.setSevereSmsEnabled(cbSevereSms.isChecked());
        settings.setSevereCallEnabled(cbSevereCall.isChecked());
        settings.setMediumSmsEnabled(cbMediumSms.isChecked());
        settings.setMediumCallEnabled(cbMediumCall.isChecked());
        settings.setLowSmsEnabled(cbLowSms.isChecked());
        settings.setLowCallEnabled(cbLowCall.isChecked());
    }
}
