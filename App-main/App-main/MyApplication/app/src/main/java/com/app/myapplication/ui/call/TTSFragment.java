package com.app.myapplication.ui.call;

import android.os.Bundle;
import android.text.Editable;
import android.text.TextUtils;
import android.text.TextWatcher;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ProgressBar;
import android.widget.RadioGroup;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.app.myapplication.R;
import com.app.myapplication.data.api.ApiClient;
import com.app.myapplication.data.api.CallApi;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class TTSFragment extends Fragment {

    private RadioGroup rgMode;
    private EditText etText;
    private TextView tvStats;
    private Button btnSend;
    private ProgressBar progressBar;
    private RecyclerView rvDevices;
    private DeviceAdapter adapter;

    private List<Map<String, Object>> allDevices = new ArrayList<>();
    private List<String> selectedPhones = new ArrayList<>();
    private boolean isBroadcast = true;
    private boolean isSending = false;

    public static TTSFragment newInstance() {
        return new TTSFragment();
    }

    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, ViewGroup container, Bundle savedInstanceState) {
        return inflater.inflate(R.layout.fragment_tts, container, false);
    }

    @Override
    public void onViewCreated(@NonNull View v, @Nullable Bundle savedInstanceState) {
        rgMode = v.findViewById(R.id.rg_mode);
        etText = v.findViewById(R.id.et_tts_text);
        tvStats = v.findViewById(R.id.tv_stats);
        btnSend = v.findViewById(R.id.btn_send);
        progressBar = v.findViewById(R.id.progress_bar);
        rvDevices = v.findViewById(R.id.rv_devices);

        rvDevices.setLayoutManager(new LinearLayoutManager(requireContext()));
        adapter = new DeviceAdapter();
        rvDevices.setAdapter(adapter);

        rgMode.setOnCheckedChangeListener((group, checkedId) -> {
            isBroadcast = checkedId == R.id.rb_broadcast;
            updateStats();
        });

        etText.addTextChangedListener(new TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            @Override
            public void onTextChanged(CharSequence s, int start, int before, int count) {}
            @Override
            public void afterTextChanged(Editable s) {
                updateStats();
            }
        });

        btnSend.setOnClickListener(view -> sendTTS());

        loadDevices();
    }

    private void loadDevices() {
        CallApi api = ApiClient.get(requireContext()).create(CallApi.class);
        api.getJT808Devices(0, 100).enqueue(new Callback<List<Map<String, Object>>>() {
            @Override
            public void onResponse(Call<List<Map<String, Object>>> call, Response<List<Map<String, Object>>> response) {
                if (response.isSuccessful() && response.body() != null) {
                    allDevices.clear();
                    allDevices.addAll(response.body());
                    adapter.setData(allDevices, selectedPhones);
                }
            }

            @Override
            public void onFailure(Call<List<Map<String, Object>>> call, Throwable t) {
                Toast.makeText(requireContext(), "加载设备失败: " + t.getMessage(), Toast.LENGTH_SHORT).show();
            }
        });
    }

    private void updateStats() {
        int onlineCount = 0;
        for (Map<String, Object> device : allDevices) {
            Object online = device.get("is_online");
            if (online != null && Boolean.parseBoolean(online.toString())) {
                onlineCount++;
            }
        }
        int targetCount = selectedPhones.size();
        int textLength = etText.getText().toString().length();
        tvStats.setText(String.format("在线设备: %d | 目标设备: %d | 字数: %d", onlineCount, targetCount, textLength));
    }

    private void sendTTS() {
        if (isSending) return;

        String text = etText.getText().toString().trim();
        if (TextUtils.isEmpty(text)) {
            Toast.makeText(requireContext(), "请输入播报内容", Toast.LENGTH_SHORT).show();
            return;
        }

        isSending = true;
        progressBar.setVisibility(View.VISIBLE);
        btnSend.setEnabled(false);

        CallApi api = ApiClient.get(requireContext()).create(CallApi.class);
        Map<String, Object> body = new HashMap<>();
        body.put("text", text);
        body.put("broadcast", isBroadcast);
        body.put("phones", isBroadcast ? null : selectedPhones);

        api.sendTTS(body).enqueue(new Callback<Map<String, Object>>() {
            @Override
            public void onResponse(Call<Map<String, Object>> call, Response<Map<String, Object>> response) {
                isSending = false;
                progressBar.setVisibility(View.GONE);
                btnSend.setEnabled(true);
                if (response.isSuccessful() && response.body() != null) {
                    Toast.makeText(requireContext(), "发送成功", Toast.LENGTH_SHORT).show();
                    etText.setText("");
                } else {
                    Toast.makeText(requireContext(), "发送失败", Toast.LENGTH_SHORT).show();
                }
            }

            @Override
            public void onFailure(Call<Map<String, Object>> call, Throwable t) {
                isSending = false;
                progressBar.setVisibility(View.GONE);
                btnSend.setEnabled(true);
                Toast.makeText(requireContext(), "网络错误: " + t.getMessage(), Toast.LENGTH_SHORT).show();
            }
        });
    }

    public class DeviceAdapter extends RecyclerView.Adapter<DeviceAdapter.VH> {
        private List<Map<String, Object>> list = new ArrayList<>();
        private List<String> selected = new ArrayList<>();

        void setData(List<Map<String, Object>> list, List<String> selected) {
            this.list = list;
            this.selected = selected;
            notifyDataSetChanged();
        }

        @NonNull
        @Override
        public VH onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            View v = LayoutInflater.from(parent.getContext()).inflate(android.R.layout.simple_list_item_multiple_choice, parent, false);
            return new VH(v);
        }

        @Override
        public void onBindViewHolder(@NonNull VH holder, int position) {
            Map<String, Object> device = list.get(position);
            holder.bind(device);
        }

        @Override
        public int getItemCount() {
            return list.size();
        }

        class VH extends RecyclerView.ViewHolder {
            android.widget.CheckBox cb;
            TextView tvName, tvStatus;

            VH(@NonNull View itemView) {
                super(itemView);
                cb = itemView.findViewById(android.R.id.text1);
                tvName = itemView.findViewById(android.R.id.text1);
                tvStatus = new TextView(itemView.getContext());
            }

            void bind(Map<String, Object> device) {
                Object name = device.get("name");
                Object phone = device.get("phone");
                Object online = device.get("is_online");

                tvName.setText(name != null ? name.toString() : "未命名");
                tvStatus.setText(Boolean.parseBoolean(online != null ? online.toString() : "false") ? "在线" : "离线");
                tvStatus.setTextColor(getResources().getColor(
                        Boolean.parseBoolean(online != null ? online.toString() : "false") ? 0xFF009688 : android.R.color.darker_gray));

                String phoneStr = phone != null ? phone.toString() : "";
                cb.setChecked(selected.contains(phoneStr));
                cb.setOnCheckedChangeListener((buttonView, isChecked) -> {
                    if (isChecked) {
                        if (!selected.contains(phoneStr)) selected.add(phoneStr);
                    } else {
                        selected.remove(phoneStr);
                    }
                    updateStats();
                });
            }
        }
    }
}