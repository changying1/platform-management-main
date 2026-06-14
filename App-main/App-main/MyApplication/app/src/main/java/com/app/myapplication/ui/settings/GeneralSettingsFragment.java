package com.app.myapplication.ui.settings;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.EditText;
import android.widget.RadioButton;
import android.widget.RadioGroup;
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
 * 通用设置 Fragment
 */
public class GeneralSettingsFragment extends Fragment {

    private EditText etSystemName;
    private RadioGroup rgTheme;
    private RadioButton rbLight, rbDark;
    private Spinner spinnerLanguage, spinnerPageSize;
    private Slider sliderAutoLogout;
    private TextView tvAutoLogoutValue;
    private SwitchMaterial switchConfirmDelete;

    private SystemSettings settings;

    public static GeneralSettingsFragment newInstance(SystemSettings settings) {
        GeneralSettingsFragment fragment = new GeneralSettingsFragment();
        fragment.settings = settings;
        return fragment;
    }

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        return inflater.inflate(R.layout.fragment_settings_general, container, false);
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
        etSystemName = view.findViewById(R.id.etSystemName);
        rgTheme = view.findViewById(R.id.rgTheme);
        rbLight = view.findViewById(R.id.rbLight);
        rbDark = view.findViewById(R.id.rbDark);
        spinnerLanguage = view.findViewById(R.id.spinnerLanguage);
        spinnerPageSize = view.findViewById(R.id.spinnerPageSize);
        sliderAutoLogout = view.findViewById(R.id.sliderAutoLogout);
        tvAutoLogoutValue = view.findViewById(R.id.tvAutoLogoutValue);
        switchConfirmDelete = view.findViewById(R.id.switchConfirmDelete);

        // 设置语言选项
        String[] languages = {"中文", "English"};
        ArrayAdapter<String> languageAdapter = new ArrayAdapter<>(requireContext(),
                android.R.layout.simple_spinner_item, languages);
        languageAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinnerLanguage.setAdapter(languageAdapter);

        // 设置分页大小选项
        String[] pageSizes = {"10", "20", "50", "100"};
        ArrayAdapter<String> pageSizeAdapter = new ArrayAdapter<>(requireContext(),
                android.R.layout.simple_spinner_item, pageSizes);
        pageSizeAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinnerPageSize.setAdapter(pageSizeAdapter);
    }

    private void setupListeners() {
        sliderAutoLogout.addOnChangeListener((slider, value, fromUser) -> {
            tvAutoLogoutValue.setText((int) value + "分钟");
        });
    }

    public void updateSettings(SystemSettings settings) {
        this.settings = settings;

        if (etSystemName != null) {
            etSystemName.setText(settings.getSystemName());
        }

        if (rgTheme != null) {
            if ("light".equals(settings.getTheme())) {
                rbLight.setChecked(true);
            } else {
                rbDark.setChecked(true);
            }
        }

        if (spinnerLanguage != null) {
            spinnerLanguage.setSelection("en".equals(settings.getLanguage()) ? 1 : 0);
        }

        if (spinnerPageSize != null) {
            int[] sizes = {10, 20, 50, 100};
            int position = 1; // default 20
            for (int i = 0; i < sizes.length; i++) {
                if (sizes[i] == settings.getTablePageSize()) {
                    position = i;
                    break;
                }
            }
            spinnerPageSize.setSelection(position);
        }

        if (sliderAutoLogout != null) {
            int minutes = settings.getAutoLogoutMinutes();
            if (minutes < 5) minutes = 5;
            if (minutes > 120) minutes = 120;
            sliderAutoLogout.setValue(minutes);
            tvAutoLogoutValue.setText(minutes + "分钟");
        }

        if (switchConfirmDelete != null) {
            switchConfirmDelete.setChecked(settings.isConfirmBeforeDelete());
        }
    }

    public void collectSettings(SystemSettings settings) {
        if (etSystemName != null) {
            settings.setSystemName(etSystemName.getText().toString().trim());
        }

        if (rgTheme != null) {
            settings.setTheme(rbLight.isChecked() ? "light" : "dark");
        }

        if (spinnerLanguage != null) {
            settings.setLanguage(spinnerLanguage.getSelectedItemPosition() == 0 ? "zh" : "en");
        }

        if (spinnerPageSize != null) {
            int[] sizes = {10, 20, 50, 100};
            settings.setTablePageSize(sizes[spinnerPageSize.getSelectedItemPosition()]);
        }

        if (sliderAutoLogout != null) {
            settings.setAutoLogoutMinutes((int) sliderAutoLogout.getValue());
        }

        if (switchConfirmDelete != null) {
            settings.setConfirmBeforeDelete(switchConfirmDelete.isChecked());
        }
    }
}
