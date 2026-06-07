package com.app.myapplication.ui.management.fragment;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.RadioGroup;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;
import androidx.viewpager2.widget.ViewPager2;

import com.app.myapplication.R;
import com.app.myapplication.ui.management.adapter.DevicePagerAdapter;
import com.google.android.material.tabs.TabLayout;
import com.google.android.material.tabs.TabLayoutMediator;

import java.util.ArrayList;
import java.util.List;

/**
 * 设备管理 - 包含摄像头管理和定位设备管理两个子页面
 * 对应 Web 端 DeviceManagement (camera + location)
 */
public class CameraManagementFragment extends Fragment {

    private TabLayout tabLayout;
    private ViewPager2 viewPager;
    private DevicePagerAdapter pagerAdapter;

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        View view = inflater.inflate(R.layout.fragment_device_management, container, false);
        
        initViews(view);
        setupViewPager();
        
        return view;
    }

    private void initViews(View view) {
        tabLayout = view.findViewById(R.id.tab_layout);
        viewPager = view.findViewById(R.id.view_pager);
        
        TextView tvTitle = view.findViewById(R.id.tv_title);
        tvTitle.setText("设备管理");
    }

    private void setupViewPager() {
        List<Fragment> fragments = new ArrayList<>();
        fragments.add(new CameraListFragment());
        fragments.add(new LocationDeviceListFragment());
        
        pagerAdapter = new DevicePagerAdapter(requireActivity(), fragments);
        viewPager.setAdapter(pagerAdapter);
        
        String[] titles = {"摄像头管理", "定位装置管理"};
        new TabLayoutMediator(tabLayout, viewPager, (tab, position) -> {
            tab.setText(titles[position]);
        }).attach();
    }
}
