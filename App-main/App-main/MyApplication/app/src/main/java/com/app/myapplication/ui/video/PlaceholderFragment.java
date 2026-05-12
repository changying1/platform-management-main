package com.app.myapplication.ui.video;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;

import com.app.myapplication.R;

public class PlaceholderFragment extends Fragment {
    private static final String ARG_TITLE = "title";

    public static PlaceholderFragment newInstance(String title) {
        Bundle b = new Bundle();
        b.putString(ARG_TITLE, title);
        PlaceholderFragment f = new PlaceholderFragment();
        f.setArguments(b);
        return f;
    }

    @Override public View onCreateView(@NonNull LayoutInflater inflater, ViewGroup container, Bundle savedInstanceState) {
        View v = inflater.inflate(R.layout.fragment_placeholder, container, false);
        TextView tv = v.findViewById(android.R.id.text1);
        return v;
    }
}
