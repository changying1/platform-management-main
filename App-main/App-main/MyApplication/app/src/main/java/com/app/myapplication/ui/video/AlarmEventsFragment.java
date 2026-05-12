package com.app.myapplication.ui.video;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageButton;
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
import com.app.myapplication.data.api.AlarmApi;

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

public class AlarmEventsFragment extends Fragment {

    private static final String ARG_DEVICE_ID = "device_id";

    public static AlarmEventsFragment newInstance(String deviceId) {
        Bundle b = new Bundle();
        b.putString(ARG_DEVICE_ID, deviceId);
        AlarmEventsFragment f = new AlarmEventsFragment();
        f.setArguments(b);
        return f;
    }

    private RecyclerView rvEvents;
    private ProgressBar progressBar;
    private TextView tvEmpty;
    private List<AlarmEventItem> items = new ArrayList<>();
    private AlarmEventAdapter adapter;
    private String deviceId;

    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, ViewGroup container, Bundle savedInstanceState) {
        return inflater.inflate(R.layout.fragment_alarm_events, container, false);
    }

    @Override
    public void onViewCreated(@NonNull View v, Bundle savedInstanceState) {
        rvEvents = v.findViewById(R.id.rv_events);
        progressBar = v.findViewById(R.id.progress_bar);
        tvEmpty = v.findViewById(R.id.tv_empty);

        deviceId = getArguments() != null ? getArguments().getString(ARG_DEVICE_ID) : "1";

        rvEvents.setLayoutManager(new LinearLayoutManager(requireContext()));
        adapter = new AlarmEventAdapter(items);
        rvEvents.setAdapter(adapter);

        loadAlarmEvents();
    }

    private void loadAlarmEvents() {
        progressBar.setVisibility(View.VISIBLE);
        tvEmpty.setVisibility(View.GONE);

        AlarmApi api = ApiClient.get(requireContext()).create(AlarmApi.class);
        api.getAlarms().enqueue(new Callback<List<Map<String, Object>>>() {
            @Override
            public void onResponse(Call<List<Map<String, Object>>> call, Response<List<Map<String, Object>>> response) {
                progressBar.setVisibility(View.GONE);
                if (response.isSuccessful() && response.body() != null) {
                    items.clear();
                    for (Map<String, Object> obj : response.body()) {
                        try {
                            AlarmEventItem item = new AlarmEventItem();
                            item.id = obj.get("id") != null ? obj.get("id").toString() : "";
                            item.type = obj.get("type") != null ? obj.get("type").toString() : "未知告警";
                            item.msg = obj.get("msg") != null ? obj.get("msg").toString() : "";
                            item.score = obj.get("score") != null ? ((Number) obj.get("score")).doubleValue() : 0;
                            item.timestamp = obj.get("timestamp") != null ? obj.get("timestamp").toString() : "";
                            item.personnel = obj.get("personnel") != null ? obj.get("personnel").toString() : null;
                            item.deviceName = obj.get("device_name") != null ? obj.get("device_name").toString() : "未知设备";
                            item.screenshotUrl = obj.get("screenshot_url") != null ? obj.get("screenshot_url").toString() : "";
                            items.add(item);
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
                    Toast.makeText(requireContext(), "获取告警列表失败", Toast.LENGTH_SHORT).show();
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

    public static class AlarmEventItem {
        public String id;
        public String type;
        public String msg;
        public double score;
        public String timestamp;
        public String personnel;
        public String deviceName;
        public String screenshotUrl;
    }

    private class AlarmEventAdapter extends RecyclerView.Adapter<AlarmEventAdapter.VH> {
        private List<AlarmEventItem> list;

        AlarmEventAdapter(List<AlarmEventItem> list) {
            this.list = list;
        }

        @NonNull
        @Override
        public VH onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            View v = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_alarm_event, parent, false);
            return new VH(v);
        }

        @Override
        public void onBindViewHolder(@NonNull VH holder, int position) {
            AlarmEventItem item = list.get(position);
            holder.bind(item);
        }

        @Override
        public int getItemCount() {
            return list == null ? 0 : list.size();
        }

        class VH extends RecyclerView.ViewHolder {
            View alarmLevelIndicator;
            TextView tvAlarmType, tvAlarmMsg, tvScore;
            TextView tvPersonnel, tvDeviceName;
            TextView tvTimestamp;
            android.widget.ImageButton btnScreenshot, btnVideo;

            VH(@NonNull View itemView) {
                super(itemView);
                alarmLevelIndicator = itemView.findViewById(R.id.alarm_level_indicator);
                tvAlarmType = itemView.findViewById(R.id.tv_alarm_type);
                tvAlarmMsg = itemView.findViewById(R.id.tv_alarm_msg);
                tvScore = itemView.findViewById(R.id.tv_score);
                tvPersonnel = itemView.findViewById(R.id.tv_personnel);
                tvDeviceName = itemView.findViewById(R.id.tv_device_name);
                tvTimestamp = itemView.findViewById(R.id.tv_timestamp);
                btnScreenshot = itemView.findViewById(R.id.btn_screenshot);
                btnVideo = itemView.findViewById(R.id.btn_video);
            }

            void bind(AlarmEventItem item) {
                tvAlarmType.setText(item.type);
                tvAlarmMsg.setText(item.msg);
                tvScore.setText(String.format(Locale.getDefault(), "%.0f%%", item.score * 100));
                tvDeviceName.setText("设备: " + item.deviceName);

                String personnelStr = item.personnel != null ? "人员: " + item.personnel : "人员: 未知";
                tvPersonnel.setText(personnelStr);

                String timeStr = item.timestamp;
                try {
                    SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault());
                    Date date = sdf.parse(timeStr);
                    if (date != null) {
                        SimpleDateFormat outFormat = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault());
                        timeStr = outFormat.format(date);
                    }
                } catch (Exception e) {
                }
                tvTimestamp.setText(timeStr);

                int scorePercent = (int) (item.score * 100);
                if (scorePercent >= 80) {
                    alarmLevelIndicator.setBackgroundColor(itemView.getContext().getResources().getColor(android.R.color.holo_red_dark));
                } else if (scorePercent >= 60) {
                    alarmLevelIndicator.setBackgroundColor(itemView.getContext().getResources().getColor(android.R.color.holo_orange_dark));
                } else {
                    alarmLevelIndicator.setBackgroundColor(itemView.getContext().getResources().getColor(android.R.color.holo_orange_light));
                }

                btnScreenshot.setOnClickListener(v -> {
                    Toast.makeText(itemView.getContext(), "查看截图: " + item.id, Toast.LENGTH_SHORT).show();
                });

                btnVideo.setOnClickListener(v -> {
                    Toast.makeText(itemView.getContext(), "查看关联录像: " + item.id, Toast.LENGTH_SHORT).show();
                });
            }
        }
    }
}