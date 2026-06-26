package com.app.myapplication.ui.management;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;
import androidx.fragment.app.Fragment;
import androidx.viewpager2.widget.ViewPager2;

import com.app.myapplication.R;
import com.app.myapplication.data.local.SessionManager;
import com.app.myapplication.ui.management.adapter.ManagementPagerAdapter;
import com.app.myapplication.ui.management.fragment.GridManagementFragment;
import com.app.myapplication.ui.management.fragment.PermissionManagementFragment;
import com.app.myapplication.ui.management.fragment.PersonManagementFragment;
import com.app.myapplication.ui.management.fragment.ProjectManagementFragment;
import com.app.myapplication.ui.management.fragment.ResponsibilityManagementFragment;
import com.app.myapplication.ui.management.fragment.TeamManagementFragment;
import com.google.android.material.tabs.TabLayout;
import com.google.android.material.tabs.TabLayoutMediator;

import java.util.ArrayList;
import java.util.List;

/**
 * 管理中心 - 对应 Web 端 ManagementPanel
 * 包含：责任管理、项目管理、网格管理、工队管理、人员管理、权限管理
 */
public class ManagementActivity extends AppCompatActivity {
    public static final String EXTRA_INITIAL_TAB = "initial_tab";
    public static final String TAB_PERSON = "person";
    private static final boolean SHOW_EXTENDED_MANAGEMENT_TABS = true;

    private TabLayout tabLayout;
    private ViewPager2 viewPager;
    private ManagementPagerAdapter pagerAdapter;
    private SessionManager sessionManager;

    // Tab 定义 - 与 Web 端对齐
    private final List<ManagementTab> tabs = new ArrayList<>();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_management);

        sessionManager = new SessionManager(this);

        initViews();
        setupTabs();
        setupViewPager();
    }

    private void initViews() {
        tabLayout = findViewById(R.id.tab_layout);
        viewPager = findViewById(R.id.view_pager);

        // 返回按钮
        findViewById(R.id.btn_back).setOnClickListener(v -> finish());
    }

    private void setupTabs() {
        // 设备管理在主界面独立入口；扩展组织/权限 Tab 暂时隐藏，代码保留便于后续恢复。
        // 权限控制由后端 API 控制，不在前端限制

        if (SHOW_EXTENDED_MANAGEMENT_TABS) {
            tabs.add(new ManagementTab("responsibility", "责任管理", R.drawable.ic_responsibility));
            tabs.add(new ManagementTab("project", "项目管理", R.drawable.ic_project));
            tabs.add(new ManagementTab("grid", "网格管理", R.drawable.ic_grid));
            tabs.add(new ManagementTab("team", "工队管理", R.drawable.ic_team));
            tabs.add(new ManagementTab("permission", "权限管理", R.drawable.ic_permission));
        }
        tabs.add(new ManagementTab("person", "人员管理", R.drawable.ic_person));
    }

    private void setupViewPager() {
        List<Fragment> fragments = new ArrayList<>();
        
        for (ManagementTab tab : tabs) {
            switch (tab.id) {
                case "responsibility":
                    fragments.add(new ResponsibilityManagementFragment());
                    break;
                case "project":
                    fragments.add(new ProjectManagementFragment());
                    break;
                case "grid":
                    fragments.add(new GridManagementFragment());
                    break;
                case "team":
                    fragments.add(new TeamManagementFragment());
                    break;
                case "person":
                    fragments.add(new PersonManagementFragment());
                    break;
                case "permission":
                    fragments.add(new PermissionManagementFragment());
                    break;
                default:
                    fragments.add(new Fragment());
            }
        }

        pagerAdapter = new ManagementPagerAdapter(this, fragments);
        viewPager.setAdapter(pagerAdapter);
        viewPager.setOffscreenPageLimit(tabs.size());

        // 关联 TabLayout 和 ViewPager2
        new TabLayoutMediator(tabLayout, viewPager, (tab, position) -> {
            ManagementTab managementTab = tabs.get(position);
            View customView = LayoutInflater.from(this).inflate(R.layout.item_management_tab, null);
            
            ImageView icon = customView.findViewById(R.id.tab_icon);
            TextView label = customView.findViewById(R.id.tab_label);
            
            icon.setImageResource(managementTab.iconRes);
            label.setText(managementTab.label);
            
            tab.setCustomView(customView);
        }).attach();

        // Tab 选中效果
        tabLayout.addOnTabSelectedListener(new TabLayout.OnTabSelectedListener() {
            @Override
            public void onTabSelected(TabLayout.Tab tab) {
                updateTabStyle(tab, true);
            }

            @Override
            public void onTabUnselected(TabLayout.Tab tab) {
                updateTabStyle(tab, false);
            }

            @Override
            public void onTabReselected(TabLayout.Tab tab) {}
        });

        int initialIndex = findTabIndex(getIntent().getStringExtra(EXTRA_INITIAL_TAB));
        if (initialIndex >= 0) {
            viewPager.setCurrentItem(initialIndex, false);
        }
    }

    private int findTabIndex(String tabId) {
        if (tabId == null || tabId.isEmpty()) return -1;
        for (int i = 0; i < tabs.size(); i++) {
            if (tabId.equals(tabs.get(i).id)) return i;
        }
        return -1;
    }

    private void updateTabStyle(TabLayout.Tab tab, boolean selected) {
        View customView = tab.getCustomView();
        if (customView != null) {
            LinearLayout container = customView.findViewById(R.id.tab_container);
            if (selected) {
                container.setBackgroundResource(R.drawable.bg_tab_selected);
            } else {
                container.setBackgroundResource(R.drawable.bg_tab_normal);
            }
        }
    }

    /**
     * 检查是否有权限使用某个 Tab - 与 Web 端 canUseManagementTab 对齐
     */
    private boolean canUseManagementTab(String level, String tab) {
        boolean isHq = "headquarters_admin".equals(level) || level == null || level.isEmpty();
        if (isHq) return true;

        switch (tab) {
            case "responsibility":
                return "branch_admin".equals(level) || "project_safety_admin".equals(level);
            case "permission":
                return "branch_admin".equals(level);
            case "project":
                return "branch_admin".equals(level);
            case "grid":
                return "branch_admin".equals(level) || "project_safety_admin".equals(level);
            case "team":
                return !"team_admin".equals(level);
            default:
                return true;
        }
    }

    private boolean hasPermission(List<String> permissions, String code) {
        return permissions != null && permissions.contains(code);
    }

    public static class ManagementTab {
        public final String id;
        public final String label;
        public final int iconRes;

        public ManagementTab(String id, String label, int iconRes) {
            this.id = id;
            this.label = label;
            this.iconRes = iconRes;
        }
    }
}
