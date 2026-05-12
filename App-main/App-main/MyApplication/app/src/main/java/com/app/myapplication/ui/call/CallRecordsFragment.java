package com.app.myapplication.ui.call;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.ProgressBar;
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

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class CallRecordsFragment extends Fragment {

    private RecyclerView rvRecords;
    private ProgressBar progressBar;
    private TextView tvEmpty;
    private List<CallRecord> items = new ArrayList<>();
    private CallRecordAdapter adapter;

    public static CallRecordsFragment newInstance() {
        return new CallRecordsFragment();
    }

    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, ViewGroup container, Bundle savedInstanceState) {
        return inflater.inflate(R.layout.fragment_call_records, container, false);
    }

    @Override
    public void onViewCreated(@NonNull View v, Bundle savedInstanceState) {
        rvRecords = v.findViewById(R.id.rv_records);
        progressBar = v.findViewById(R.id.progress_bar);
        tvEmpty = v.findViewById(R.id.tv_empty);

        rvRecords.setLayoutManager(new LinearLayoutManager(requireContext()));
        adapter = new CallRecordAdapter(items);
        rvRecords.setAdapter(adapter);

        loadCallRecords();
    }

    private void loadCallRecords() {
        progressBar.setVisibility(View.VISIBLE);
        tvEmpty.setVisibility(View.GONE);

        CallApi api = ApiClient.get(requireContext()).create(CallApi.class);
        api.getCallRecords().enqueue(new Callback<List<Map<String, Object>>>() {
            @Override
            public void onResponse(Call<List<Map<String, Object>>> call, Response<List<Map<String, Object>>> response) {
                progressBar.setVisibility(View.GONE);
                if (response.isSuccessful() && response.body() != null) {
                    items.clear();
                    for (Map<String, Object> obj : response.body()) {
                        try {
                            CallRecord record = new CallRecord();
                            record.id = obj.get("id") != null ? obj.get("id").toString() : "";
                            record.type = obj.get("mode") != null ? obj.get("mode").toString() : "broadcast";
                            record.text = obj.get("text") != null ? obj.get("text").toString() : "";
                            record.startTime = obj.get("createdAt") != null ? obj.get("createdAt").toString() : "";
                            record.duration = obj.get("duration") != null ? ((Number) obj.get("duration")).intValue() : 0;
                            record.targetCount = obj.get("targetCount") != null ? ((Number) obj.get("targetCount")).intValue() : 0;
                            items.add(record);
                        } catch (Exception e) {
                            e.printStackTrace();
                        }
                    }
                    adapter.notifyDataSetChanged();

                    if (items.isEmpty()) {
                        tvEmpty.setVisibility(View.VISIBLE);
                    }
                } else {
                    tvEmpty.setVisibility(View.VISIBLE);
                    Toast.makeText(requireContext(), "获取通话记录失败", Toast.LENGTH_SHORT).show();
                }
            }

            @Override
            public void onFailure(Call<List<Map<String, Object>>> call, Throwable t) {
                progressBar.setVisibility(View.GONE);
                tvEmpty.setVisibility(View.VISIBLE);
                Toast.makeText(requireContext(), "网络错误: " + t.getMessage(), Toast.LENGTH_SHORT).show();
            }
        });
    }

    public static class CallRecord {
        public String id;
        public String type;
        public String text;
        public String startTime;
        public int duration;
        public int targetCount;
    }

    private class CallRecordAdapter extends RecyclerView.Adapter<CallRecordAdapter.VH> {
        private List<CallRecord> list;

        CallRecordAdapter(List<CallRecord> list) {
            this.list = list;
        }

        @NonNull
        @Override
        public VH onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            View v = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_call_record, parent, false);
            return new VH(v);
        }

        @Override
        public void onBindViewHolder(@NonNull VH holder, int position) {
            CallRecord item = list.get(position);
            holder.bind(item);
        }

        @Override
        public int getItemCount() {
            return list.size();
        }

        class VH extends RecyclerView.ViewHolder {
            android.widget.ImageView ivTypeIcon;
            TextView tvCallType, tvCallContent, tvDuration;
            TextView tvTargetCount, tvTime;
            Button btnReplay, btnDetail;

            VH(@NonNull View itemView) {
                super(itemView);
                ivTypeIcon = itemView.findViewById(R.id.iv_type_icon);
                tvCallType = itemView.findViewById(R.id.tv_call_type);
                tvCallContent = itemView.findViewById(R.id.tv_call_content);
                tvDuration = itemView.findViewById(R.id.tv_duration);
                tvTargetCount = itemView.findViewById(R.id.tv_target_count);
                tvTime = itemView.findViewById(R.id.tv_time);
                btnReplay = itemView.findViewById(R.id.btn_replay);
                btnDetail = itemView.findViewById(R.id.btn_detail);
            }

            void bind(CallRecord item) {
                if ("broadcast".equals(item.type)) {
                    tvCallType.setText("全体广播");
                    ivTypeIcon.setImageResource(android.R.drawable.ic_lock_silent_mode_off);
                } else {
                    tvCallType.setText("定向播报");
                    ivTypeIcon.setImageResource(android.R.drawable.ic_dialog_dialer);
                }

                tvCallContent.setText(item.text);

                int minutes = item.duration / 60;
                int seconds = item.duration % 60;
                tvDuration.setText(String.format(Locale.getDefault(), "%02d:%02d", minutes, seconds));

                tvTargetCount.setText("目标设备: " + item.targetCount + "台");

                String timeStr = item.startTime;
                try {
                    SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault());
                    Date date = sdf.parse(timeStr);
                    if (date != null) {
                        SimpleDateFormat outFormat = new SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault());
                        timeStr = outFormat.format(date);
                    }
                } catch (Exception e) {
                }
                tvTime.setText(timeStr);

                btnReplay.setOnClickListener(v -> {
                    Toast.makeText(itemView.getContext(), "重新播放: " + item.id, Toast.LENGTH_SHORT).show();
                });

                btnDetail.setOnClickListener(v -> {
                    Toast.makeText(itemView.getContext(), "查看详情: " + item.id, Toast.LENGTH_SHORT).show();
                });
            }
        }
    }
}