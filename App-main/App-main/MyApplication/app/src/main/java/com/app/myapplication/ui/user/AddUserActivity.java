package com.app.myapplication.ui.user;

import android.os.Bundle;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.Spinner;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

import com.app.myapplication.R;

public class AddUserActivity extends AppCompatActivity {

    private Spinner spRole, spSupervisor;
    private EditText etUsername, etDept, etPhone, etPassword;
    private Button btnCancel, btnSave;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_add_user);

        spRole = findViewById(R.id.sp_role);
        spSupervisor = findViewById(R.id.sp_supervisor);
        etUsername = findViewById(R.id.et_username);
        etDept = findViewById(R.id.et_dept);
        etPhone = findViewById(R.id.et_phone);
        etPassword = findViewById(R.id.et_password);
        btnCancel = findViewById(R.id.btn_cancel);
        btnSave = findViewById(R.id.btn_save);

        String[] roles = new String[]{"HQ Manager", "Project Manager", "Safety Officer", "Worker"};
        spRole.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, roles));

        String[] supervisors = new String[]{"-- 请选择上级负责人 --", "总负责人(总部)", "项目负责人1(项目一部)"};
        spSupervisor.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_spinner_dropdown_item, supervisors));

        btnCancel.setOnClickListener(v -> finish());

        btnSave.setOnClickListener(v -> {
            String username = etUsername.getText().toString().trim();
            String dept = etDept.getText().toString().trim();
            String pwd = etPassword.getText().toString().trim();

            if (username.isEmpty() || dept.isEmpty() || pwd.isEmpty()) {
                Toast.makeText(this, "请填写完整的必要信息", Toast.LENGTH_SHORT).show();
                return;
            }

            Toast.makeText(this, "已保存(示例)，可在此处接入接口/回传数据", Toast.LENGTH_SHORT).show();
            finish();
        });
    }
}
