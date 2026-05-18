package com.app.myapplication.ui.user;

import android.content.Intent;
import android.os.Bundle;
import android.util.Log;
import android.widget.Button;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;
import com.app.myapplication.R;
import com.app.myapplication.data.model.User;
import java.util.ArrayList;
import java.util.List;

public class UserManagementActivity extends AppCompatActivity {

    private RecyclerView recyclerView;
    private UserAdapter userAdapter;
    private List<User> userList;
    private TextView tvTotalCount;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_manage_structure);  // 引用你的布局文件

        // 初始化 RecyclerView 和 Total Count
        recyclerView = findViewById(R.id.rv_people_structure);
        tvTotalCount = findViewById(R.id.tv_total_count);


        Button btnAdd = findViewById(R.id.btn_base_url);
        btnAdd.setOnClickListener(v -> {
            Intent intent = new Intent(UserManagementActivity.this, AddUserActivity.class);
            startActivity(intent);
        });

        // 创建 User 数据列表
        userList = new ArrayList<>();

        // 模拟填充一些数据
        userList.add(new User("1", "总负责人", "总部", "13800000000", "HQ Manager", "2024-01-01", null));
        userList.add(new User("2", "项目负责人1", "项目一部", "13912345678", "Project Manager", "2024-03-15", "1"));
        userList.add(new User("3", "项目负责人2", "项目二部", "13987654321", "Project Manager", "2024-03-16", "1"));
        userList.add(new User("4", "安全员1", "项目一部", "13788889999", "Safety Officer", "2024-06-20", "2"));
        userList.add(new User("4", "安全员1", "项目一部", "13788889999", "Safety Officer", "2024-06-20", "2"));
        userList.add(new User("4", "安全员1", "项目一部", "13788889999", "Safety Officer", "2024-06-20", "2"));
        userList.add(new User("4", "安全员1", "项目一部", "13788889999", "Safety Officer", "2024-06-20", "2"));
        userList.add(new User("4", "安全员1", "项目一部", "13788889999", "Safety Officer", "2024-06-20", "2"));
        userList.add(new User("4", "安全员1", "项目一部", "13788889999", "Safety Officer", "2024-06-20", "2"));
        userList.add(new User("4", "安全员1", "项目一部", "13788889999", "Safety Officer", "2024-06-20", "2"));
        userList.add(new User("4", "安全员1", "项目一部", "13788889999", "Safety Officer", "2024-06-20", "2"));
        // 添加更多的用户数据...

        // 设置 RecyclerView 的 LayoutManager
        recyclerView.setLayoutManager(new LinearLayoutManager(this));

        // 初始化适配器并绑定数据
        userAdapter = new UserAdapter(userList);
        recyclerView.setAdapter(userAdapter);
        // 更新总人数显示
        tvTotalCount.setText("总计: " + userList.size() + " 人员");
    }
}
