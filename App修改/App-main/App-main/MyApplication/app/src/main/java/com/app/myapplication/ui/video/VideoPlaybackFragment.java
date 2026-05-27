package com.app.myapplication.ui.video;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
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
import com.app.myapplication.data.api.VideoApi;

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

public class VideoPlaybackFragment extends Fragment {

    private static final String ARG_DEVICE_ID = "device_id";

    public static VideoPlaybackFragment newInstance(String deviceId) {
        Bundle b = new Bundle();
        b.putString(ARG_DEVICE_ID, deviceId);
        VideoPlaybackFragment f = new VideoPlaybackFragment();
        f.setArguments(b);
        return f;
    }

    private RecyclerView rvPlayback;
    private ProgressBar progressBar;
    private TextView tvEmpty;
    private Button btnNormal, btnAlarm;
    private List<PlaybackItem> items = new ArrayList<>();
    private PlaybackAdapter adapter;
    private String deviceId;
    private boolean isAlarmMode = false;

    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, ViewGroup container, Bundle savedInstanceState) {
        return inflater.inflate(R.layout.fragment_video_playback, container, false);
    }

    @Override
    public void onViewCreated(@NonNull View v, Bundle savedInstanceState) {
        rvPlayback = v.findViewById(R.id.rv_playback_list);
        progressBar = v.findViewById(R.id.progress_bar);
        tvEmpty = v.findViewById(R.id.tv_empty);
        btnNormal = v.findViewById(R.id.btn_normal);
        btnAlarm = v.findViewById(R.id.btn_alarm);

        deviceId = getArguments() != null ? getArguments().getString(ARG_DEVICE_ID) : "2";
        
        if (deviceId == null || deviceId.isEmpty()) {
            deviceId = "2";
        }

        rvPlayback.setLayoutManager(new LinearLayoutManager(requireContext()));
        adapter = new PlaybackAdapter(items);
        rvPlayback.setAdapter(adapter);

        btnNormal.setOnClickListener(view -> {
            isAlarmMode = false;
            btnNormal.setBackgroundColor(getResources().getColor(R.color.teal_200));
            btnAlarm.setBackgroundColor(getResources().getColor(android.R.color.transparent));
            loadPlaybacks();
        });

        btnAlarm.setOnClickListener(view -> {
            isAlarmMode = true;
            btnAlarm.setBackgroundColor(getResources().getColor(R.color.teal_200));
            btnNormal.setBackgroundColor(getResources().getColor(android.R.color.transparent));
            loadPlaybacks();
        });

        loadPlaybacks();
    }

    private void loadPlaybacks() {
        progressBar.setVisibility(View.VISIBLE);
        tvEmpty.setVisibility(View.GONE);

        VideoApi api = ApiClient.get(requireContext()).create(VideoApi.class);
        Call<List<Map<String, Object>>> call;
        if (isAlarmMode) {
            call = api.getAlarmVideos(deviceId);
        } else {
            call = api.getRecordingVideos(deviceId);
        }
        call.enqueue(new Callback<List<Map<String, Object>>>() {
            @Override
            public void onResponse(Call<List<Map<String, Object>>> call, Response<List<Map<String, Object>>> response) {
                progressBar.setVisibility(View.GONE);
                if (response.isSuccessful() && response.body() != null) {
                    items.clear();
                    for (Map<String, Object> obj : response.body()) {
                        try {
                            PlaybackItem item = new PlaybackItem();
                        item.id = obj.get("name") != null ? obj.get("name").toString().replace(".mp4", "") : "";
                        item.deviceId = deviceId;
                        item.deviceName = "设备 " + deviceId;
                        item.startTime = obj.get("start_time") != null ? obj.get("start_time").toString() : "";
                        item.endTime = obj.get("end_time") != null ? obj.get("end_time").toString() : "";
                        item.duration = obj.get("duration_seconds") != null ? ((Number) obj.get("duration_seconds")).intValue() : 0;
                        item.type = isAlarmMode ? "alarm" : "manual";
                        item.filePath = obj.get("web_path") != null ? obj.get("web_path").toString() : "";
                        item.company = "";
                        item.project = "";
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
                    Toast.makeText(requireContext(), "获取录像列表失败", Toast.LENGTH_SHORT).show();
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

    public static class PlaybackItem {
        public String id;
        public String deviceId;
        public String deviceName;
        public String startTime;
        public String endTime;
        public int duration;
        public String type;
        public String filePath;
        public String company;
        public String project;
    }

    private class PlaybackAdapter extends RecyclerView.Adapter<PlaybackAdapter.VH> {
        private List<PlaybackItem> list;

        PlaybackAdapter(List<PlaybackItem> list) {
            this.list = list;
        }

        @NonNull
        @Override
        public VH onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            View v = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_video_playback, parent, false);
            return new VH(v);
        }

        @Override
        public void onBindViewHolder(@NonNull VH holder, int position) {
            PlaybackItem item = list.get(position);
            holder.bind(item);
        }

        @Override
        public int getItemCount() {
            return list == null ? 0 : list.size();
        }

        class VH extends RecyclerView.ViewHolder {
            View typeIndicator;
            TextView tvDeviceName, tvRecordType, tvAlarmInfo;
            TextView tvCompany, tvProject;
            TextView tvTime, tvDuration;
            android.widget.ImageButton btnPlay;

            VH(@NonNull View itemView) {
                super(itemView);
                typeIndicator = itemView.findViewById(R.id.type_indicator);
                tvDeviceName = itemView.findViewById(R.id.tv_device_name);
                tvRecordType = itemView.findViewById(R.id.tv_record_type);
                tvAlarmInfo = itemView.findViewById(R.id.tv_alarm_info);
                tvCompany = itemView.findViewById(R.id.tv_company);
                tvProject = itemView.findViewById(R.id.tv_project);
                tvTime = itemView.findViewById(R.id.tv_time);
                tvDuration = itemView.findViewById(R.id.tv_duration);
                btnPlay = itemView.findViewById(R.id.btn_play);
            }

            void bind(PlaybackItem item) {
                tvDeviceName.setText(item.deviceName);
                tvCompany.setText(item.company);
                tvProject.setText(item.project);

                String timeStr = item.startTime;
                try {
                    SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault());
                    Date date = sdf.parse(timeStr);
                    if (date != null) {
                        SimpleDateFormat outFormat = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault());
                        timeStr = outFormat.format(date);
                    }
                } catch (Exception e) {
                }
                tvTime.setText(timeStr);

                int minutes = item.duration / 60;
                int seconds = item.duration % 60;
                tvDuration.setText(String.format(Locale.getDefault(), "时长: %02d:%02d", minutes, seconds));

                boolean isAlarm = "alarm".equals(item.type);
                if (isAlarm) {
                    tvRecordType.setText("报警录像");
                    tvRecordType.setTextColor(itemView.getContext().getResources().getColor(android.R.color.holo_red_dark));
                    tvRecordType.setBackgroundColor(itemView.getContext().getResources().getColor(R.color.low_level));
                    typeIndicator.setBackgroundColor(itemView.getContext().getResources().getColor(android.R.color.holo_red_dark));
                    tvAlarmInfo.setVisibility(View.VISIBLE);
                    tvAlarmInfo.setText("检测到异常事件");
                } else {
                    tvRecordType.setText("常规录像");
                    tvRecordType.setTextColor(itemView.getContext().getResources().getColor(android.R.color.holo_green_dark));
                    tvRecordType.setBackgroundColor(itemView.getContext().getResources().getColor(android.R.color.holo_green_dark));
                    typeIndicator.setBackgroundColor(itemView.getContext().getResources().getColor(android.R.color.holo_green_dark));
                    tvAlarmInfo.setVisibility(View.GONE);
                }

                btnPlay.setOnClickListener(v -> {
                    if (item.filePath != null && !item.filePath.isEmpty()) {
                        VideoFilePlayActivity.start(requireContext(), item.filePath);
                    } else {
                        Toast.makeText(itemView.getContext(), "视频路径无效", Toast.LENGTH_SHORT).show();
                    }
                });
            }
        }
    }
}