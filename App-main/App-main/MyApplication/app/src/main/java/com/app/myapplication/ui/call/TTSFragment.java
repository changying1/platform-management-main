package com.app.myapplication.ui.call;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;

public class TTSFragment extends Fragment {
    public static TTSFragment newInstance() {
        return new TTSFragment();
    }

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        TextView textView = new TextView(requireContext());
        textView.setText("App 端仅使用实时语音通话，定位设备文本播报由 Web 端处理。");
        textView.setTextSize(16);
        textView.setPadding(32, 32, 32, 32);
        return textView;
    }
}
