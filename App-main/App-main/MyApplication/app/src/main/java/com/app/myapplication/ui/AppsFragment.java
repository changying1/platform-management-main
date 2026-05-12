package com.app.myapplication.ui;

import android.content.Intent;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;
import androidx.recyclerview.widget.GridLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.app.myapplication.R;
import com.app.myapplication.ui.track.TrackPlaybackActivity;
import com.app.myapplication.ui.call.GroupCallActivity;
import com.app.myapplication.ui.user.UserManagementActivity;
import com.app.myapplication.ui.video.VideoCenterActivity;
import com.app.myapplication.ui.alarm.AlarmRecordsActivity;
import com.app.myapplication.ui.fence.FenceCenterActivity;
import com.app.myapplication.ui.playback.PlaybackCenterActivity;
import androidx.viewpager2.widget.ViewPager2;
import com.google.android.material.tabs.TabLayout;
import com.google.android.material.tabs.TabLayoutMediator;
import com.app.myapplication.ui.adapter.BannerAdapter;
import com.app.myapplication.ui.adapter.NewsAdapter;

import java.util.ArrayList;
import java.util.List;

//把 Apps 页面变成两列网格，并在点击“视频中心”时跳到 VideoCenterActivity。

public class AppsFragment extends Fragment {

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater,
                             @Nullable ViewGroup container,
                             @Nullable Bundle savedInstanceState) {

        View root = inflater.inflate(R.layout.fragment_apps, container, false);

        ViewPager2 bannerPager = root.findViewById(R.id.bannerPager);
        TabLayout bannerIndicator = root.findViewById(R.id.bannerIndicator);

        List<BannerAdapter.BannerItem> banners = new ArrayList<>();
        banners.add(new BannerAdapter.BannerItem(
                R.drawable.banner_1,
                "视频中心",
                "实时预览 · 多路切换 · 云端回放"
        ));
        banners.add(new BannerAdapter.BannerItem(
                R.drawable.banner_2,
                "轨迹回放",
                "历史轨迹 · 关键点回放 · 速度分析"
        ));
        banners.add(new BannerAdapter.BannerItem(
                R.drawable.banner_3,
                "电子围栏",
                "进出提醒 · 告警联动 · 实时推送"
        ));

        BannerAdapter bannerAdapter = new BannerAdapter(banners);
        bannerPager.setAdapter(bannerAdapter);

// 指示器绑定
        new TabLayoutMediator(bannerIndicator, bannerPager, (tab, position) -> {
        }).attach();




        RecyclerView rvQuick = root.findViewById(R.id.rv_quick);
        rvQuick.setLayoutManager(new androidx.recyclerview.widget.GridLayoutManager(requireContext(), 3));
        rvQuick.setOverScrollMode(View.OVER_SCROLL_NEVER);

        int spacingPx = (int) (8 * getResources().getDisplayMetrics().density);
        rvQuick.addItemDecoration(new GridSpacingItemDecoration(3, spacingPx, true));

        List<com.app.myapplication.ui.adapter.QuickActionsAdapter.Item> quick = new ArrayList<>();
        quick.add(new com.app.myapplication.ui.adapter.QuickActionsAdapter.Item("视频", android.R.drawable.ic_menu_slideshow));
        quick.add(new com.app.myapplication.ui.adapter.QuickActionsAdapter.Item("回放", R.drawable.ic_path_loop));
        quick.add(new com.app.myapplication.ui.adapter.QuickActionsAdapter.Item("围栏", R.drawable.fence));
        quick.add(new com.app.myapplication.ui.adapter.QuickActionsAdapter.Item("报警", R.drawable.ic_alarm));
        quick.add(new com.app.myapplication.ui.adapter.QuickActionsAdapter.Item("语音", android.R.drawable.ic_btn_speak_now));
        quick.add(new com.app.myapplication.ui.adapter.QuickActionsAdapter.Item("管理", R.drawable.ic_administrator));

        com.app.myapplication.ui.adapter.QuickActionsAdapter quickAdapter =
                new com.app.myapplication.ui.adapter.QuickActionsAdapter(quick, item -> {
                    switch (item.title) {
                        case "视频":
                            startActivity(new Intent(requireContext(), VideoCenterActivity.class));
                            break;
                        case "回放":
                            startActivity(new Intent(requireContext(), PlaybackCenterActivity.class));
                            break;
                        case "围栏":
                            startActivity(new Intent(requireContext(), FenceCenterActivity.class));
                            break;
                        case "报警":
                            startActivity(new Intent(requireContext(), AlarmRecordsActivity.class));
                            break;
                        case "语音":
                            startActivity(new Intent(requireContext(), GroupCallActivity.class));
                            break;
                        case "管理":
                            startActivity(new Intent(requireContext(), UserManagementActivity.class));
                            break;
                    }
                });

        rvQuick.setAdapter(quickAdapter);




        RecyclerView rvNews = root.findViewById(R.id.rv_news);
        rvNews.setLayoutManager(new androidx.recyclerview.widget.LinearLayoutManager(requireContext()));

        List<NewsAdapter.NewsItem> news = new ArrayList<>();
        news.add(new NewsAdapter.NewsItem("公告","系统升级维护通知",
                "本周六 00:00-02:00 升级，回放可能短暂不可用。","10:20",
                android.graphics.Color.parseColor("#2563EB")));

        news.add(new NewsAdapter.NewsItem("维护","视频回放服务优化",
                "回放加载速度提升，弱网下更流畅。","昨天",
                android.graphics.Color.parseColor("#7B61FF")));

        news.add(new NewsAdapter.NewsItem("紧急","报警推送异常已恢复",
                "已修复推送延迟问题，建议更新至最新版本。","09:05",
                android.graphics.Color.parseColor("#FF4D4F")));


        com.app.myapplication.ui.adapter.NewsAdapter newsAdapter =
                new com.app.myapplication.ui.adapter.NewsAdapter(news, item -> {
                    // TODO: 点击跳转新闻详情页（后续你要我可以给你 NewsDetailActivity）
                    android.widget.Toast.makeText(requireContext(), item.title, android.widget.Toast.LENGTH_SHORT).show();
                });

        rvNews.setAdapter(newsAdapter);


//        RecyclerView rvApps = root.findViewById(R.id.rv_apps);
//        // ✅ 防崩：如果找不到 rv_apps，说明你当前加载的 fragment_apps.xml 里没有这个控件
//        if (rvApps == null) {
//            android.widget.Toast.makeText(requireContext(),
//                    "错误：找不到 rv_apps，请检查 fragment_apps.xml 的 RecyclerView id 是否为 rv_apps",
//                    android.widget.Toast.LENGTH_LONG).show();
//            return root;
//        }
//
//    // ✅ 必须设置 LayoutManager，否则 RecyclerView 不会显示任何 item
//        rvApps.setLayoutManager(new GridLayoutManager(requireContext(), 2));
//
//        // 两列网格：一行两个入口,给网格加间距（8dp），视觉更居中
//        int spacingPx = (int) (8 * getResources().getDisplayMetrics().density);
//        rvApps.addItemDecoration(new GridSpacingItemDecoration(2, spacingPx, true));
//
//
//        // 入口数据：后面你可以继续加“地图中心/设备管理/告警中心”等
//        List<AppEntry> entries = new ArrayList<>();
//        entries.add(new AppEntry(
//                "视频中心",
//                "视频中心",
//                android.R.drawable.ic_menu_slideshow,
//                R.drawable.bg_app_card_gradient
//                // ...你的 target/action
//        ));
//
//        entries.add(new AppEntry(
//                "轨迹回放",
//                "轨迹回放",
//                R.drawable.ic_path_loop,
//                R.drawable.bg_app_card_path
//                // ...你的 target/action
//        ));
//
//        entries.add(new AppEntry(
//                "电子围栏",
//                "电子围栏",
//                R.drawable.fence,
//                R.drawable.fence_color
//                // ...你的 target/action
//        ));
//
//        entries.add(new AppEntry(
//                "报警记录",
//                "报警记录",
//                R.drawable.ic_alarm,  // 新的图标
//                R.drawable.bg_alarm_button
//        ));
//
//        entries.add(new AppEntry(
//                "管理员设置",
//                "管理员设置",
//                R.drawable.ic_administrator,
//                R.drawable.bg_app_card_path
//                // ...你的 target/action
//        ));
//// 创建适配器，确保点击项时执行跳转
//        AppsEntryAdapter adapter = new AppsEntryAdapter(entries, entry -> {
//            // 跳转到不同页面
//            if ("视频中心".equals(entry.title)) {
//                startActivity(new Intent(requireContext(), VideoCenterActivity.class));
//            } else if ("轨迹回放".equals(entry.title)) {
//                startActivity(new Intent(requireContext(), TrackPlaybackActivity.class));
//            } else if ("电子围栏".equals(entry.title)) {
//                startActivity(new Intent(requireContext(), FenceCenterActivity.class));
//            } else if ("报警记录".equals(entry.title)) {
//                startActivity(new Intent(requireContext(), AlarmRecordsActivity.class)); // 跳转到报警记录页面
//            } else if ("管理员设置".equals(entry.title)) {
//                startActivity(new Intent(requireContext(), UserManagementActivity.class)); // 跳转到管理员设置页面
//            }
//        });
//
//        rvApps.setAdapter(adapter);

        return root;
    }

    /** 应用入口数据结构（简单版） */
    public static class AppEntry {
        public String title;
        public String subtitle;
        public int iconRes;

        public int bgRes;
        public AppEntry(String title, String subtitle, int iconRes, int bgRes /*...其他字段*/) {
            this.title = title;
            this.subtitle = subtitle;
            this.iconRes = iconRes;
            this.bgRes = bgRes;
        }
    }
}