package com.app.myapplication.ui.video;

import android.os.Bundle;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.fragment.app.Fragment;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.app.myapplication.R;
import com.app.myapplication.data.api.ApiClient;
import com.app.myapplication.data.api.VideoApi;
import com.app.myapplication.data.local.AppConfig;
import com.google.gson.Gson;

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
    private static final String TAG = "VideoPlaybackFragment";
    private static final Gson GSON = new Gson();

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
    private Button btnNormal;
    private Button btnAlarm;
    private final List<PlaybackItem> items = new ArrayList<>();
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
        Call<List<Map<String, Object>>> call = isAlarmMode
                ? api.getAlarmVideos(deviceId, 120)
                : api.getRecordingVideos(deviceId, 120);

        call.enqueue(new Callback<List<Map<String, Object>>>() {
            @Override
            public void onResponse(Call<List<Map<String, Object>>> call, Response<List<Map<String, Object>>> response) {
                if (!isAdded()) return;
                progressBar.setVisibility(View.GONE);

                if (!response.isSuccessful() || response.body() == null) {
                    tvEmpty.setVisibility(View.VISIBLE);
                    Toast.makeText(requireContext(), "Failed to get playback list", Toast.LENGTH_SHORT).show();
                    return;
                }

                items.clear();
                for (Map<String, Object> row : response.body()) {
                    PlaybackItem item = toPlaybackItem(row);
                    items.add(item);
                }
                adapter.notifyDataSetChanged();
                tvEmpty.setVisibility(items.isEmpty() ? View.VISIBLE : View.GONE);
            }

            @Override
            public void onFailure(Call<List<Map<String, Object>>> call, Throwable t) {
                if (!isAdded()) return;
                progressBar.setVisibility(View.GONE);
                tvEmpty.setVisibility(View.VISIBLE);
                Toast.makeText(requireContext(), "Network error: " + safeMessage(t), Toast.LENGTH_SHORT).show();
            }
        });
    }

    private PlaybackItem toPlaybackItem(Map<String, Object> row) {
        PlaybackItem item = new PlaybackItem();
        item.id = firstNonEmpty(row.get("id"), row.get("record_id"), row.get("recordId"), row.get("name")).replace(".mp4", "");
        item.deviceId = deviceId;
        item.deviceName = "Device " + deviceId;
        item.startTime = firstNonEmpty(row.get("start_time"), row.get("startTime"), row.get("created_at"));
        item.endTime = firstNonEmpty(row.get("end_time"), row.get("endTime"));
        item.duration = doubleValue(row.get("duration"), row.get("duration_seconds"), row.get("video_duration"), row.get("clip_duration"));
        item.alarmSecond = doubleValue(row.get("alarm_second_by_snapshot"), row.get("alarmSecondBySnapshot"));
        if (item.alarmSecond <= 0) {
            item.alarmSecond = doubleValue(row.get("alarm_second"), row.get("alarmSecond"));
        }
        item.snapshotTime = firstNonEmpty(row.get("snapshot_time"), row.get("snapshotTime"), row.get("image_time"), row.get("capture_time"));
        item.actualClipStart = firstNonEmpty(row.get("actual_clip_start"), row.get("actualClipStart"), row.get("clip_start"), row.get("video_start_time"));
        item.type = isAlarmMode ? "alarm" : "manual";
        item.hasBoxedVideoUrl = !firstNonEmpty(
                row.get("boxed_video_url"),
                row.get("boxedVideoUrl"),
                row.get("annotated_video_url"),
                row.get("annotatedVideoUrl"),
                row.get("alarm_video_url"),
                row.get("alarmVideoUrl")
        ).isEmpty();
        item.filePath = firstNonEmpty(
                row.get("boxed_video_url"),
                row.get("boxedVideoUrl"),
                row.get("annotated_video_url"),
                row.get("annotatedVideoUrl"),
                row.get("alarm_video_url"),
                row.get("alarmVideoUrl"),
                row.get("video_url"),
                row.get("videoUrl"),
                row.get("alarm_video_path"),
                row.get("alarmVideoPath"),
                row.get("raw_video_path"),
                row.get("rawVideoPath"),
                row.get("clip_url"),
                row.get("web_path"),
                row.get("url"),
                row.get("path"),
                row.get("recording_path")
        );
        item.bboxJson = jsonValue(firstObject(row, "coords", "coords_norm", "bbox", "bounding_box", "boxes", "detections", "detection_results"));
        if (item.filePath.isEmpty()) {
            String filename = firstNonEmpty(row.get("filename"), row.get("name"));
            if (!filename.isEmpty()) {
                item.filePath = "/api/videos/" + item.deviceId + "/" + filename;
            }
        }
        item.company = firstNonEmpty(row.get("company"));
        item.project = firstNonEmpty(row.get("project"));
        item.recordingStatus = firstNonEmpty(row.get("recording_status"), row.get("video_status"));
        item.errorMessage = firstNonEmpty(row.get("recording_error"), row.get("error_message"));
        return item;
    }

    public static class PlaybackItem {
        public String id;
        public String deviceId;
        public String deviceName;
        public String startTime;
        public String endTime;
        public double duration;
        public double alarmSecond;
        public String snapshotTime;
        public String actualClipStart;
        public String type;
        public String filePath;
        public boolean hasBoxedVideoUrl;
        public String bboxJson;
        public String company;
        public String project;
        public String recordingStatus;
        public String errorMessage;
    }

    private class PlaybackAdapter extends RecyclerView.Adapter<PlaybackAdapter.VH> {
        private final List<PlaybackItem> list;

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
            holder.bind(list.get(position));
        }

        @Override
        public int getItemCount() {
            return list == null ? 0 : list.size();
        }

        class VH extends RecyclerView.ViewHolder {
            View typeIndicator;
            TextView tvDeviceName;
            TextView tvRecordType;
            TextView tvAlarmInfo;
            TextView tvCompany;
            TextView tvProject;
            TextView tvTime;
            TextView tvDuration;
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
                tvTime.setText(formatTime(item.startTime));

                int displayDuration = (int) Math.round(item.duration);
                int minutes = displayDuration / 60;
                int seconds = displayDuration % 60;
                tvDuration.setText(String.format(Locale.getDefault(), "Duration: %02d:%02d", minutes, seconds));

                boolean isAlarm = "alarm".equals(item.type);
                if (isAlarm) {
                    tvRecordType.setText("Alarm video");
                    tvRecordType.setTextColor(itemView.getContext().getResources().getColor(android.R.color.holo_red_dark));
                    tvRecordType.setBackgroundColor(itemView.getContext().getResources().getColor(R.color.low_level));
                    typeIndicator.setBackgroundColor(itemView.getContext().getResources().getColor(android.R.color.holo_red_dark));
                    tvAlarmInfo.setVisibility(View.VISIBLE);
                    if (item.duration <= 0 || item.filePath == null || item.filePath.isEmpty()) {
                        tvAlarmInfo.setText(firstNonEmpty(item.errorMessage, "暂无报警视频"));
                    } else {
                        tvAlarmInfo.setText("Related alarm event");
                    }
                } else {
                    tvRecordType.setText("Normal video");
                    tvRecordType.setTextColor(itemView.getContext().getResources().getColor(android.R.color.holo_green_dark));
                    tvRecordType.setBackgroundColor(itemView.getContext().getResources().getColor(android.R.color.holo_green_dark));
                    typeIndicator.setBackgroundColor(itemView.getContext().getResources().getColor(android.R.color.holo_green_dark));
                    tvAlarmInfo.setVisibility(View.GONE);
                }

                btnPlay.setOnClickListener(v -> {
                    boolean unavailable = "alarm".equals(item.type) && (item.duration <= 0
                            || "failed".equalsIgnoreCase(item.recordingStatus)
                            || "no_video_segment".equalsIgnoreCase(item.recordingStatus));
                    if (unavailable) {
                        Toast.makeText(requireContext(), firstNonEmpty(item.errorMessage, "暂无报警视频"), Toast.LENGTH_SHORT).show();
                    } else if (item.filePath != null && !item.filePath.isEmpty()) {
                        VideoFilePlayActivity.start(
                                requireContext(),
                                AppConfig.toAbsoluteUrl(requireContext(), item.filePath),
                                "alarm".equals(item.type),
                                resolveAlarmSecond(item),
                                item.id,
                                item.snapshotTime,
                                item.actualClipStart,
                                item.hasBoxedVideoUrl,
                                item.bboxJson
                        );
                    } else {
                        Toast.makeText(requireContext(), "暂无播放地址", Toast.LENGTH_SHORT).show();
                    }
                });
            }
        }
    }

    private static double resolveAlarmSecond(PlaybackItem item) {
        if (item.alarmSecond > 0) return item.alarmSecond;
        long snapshotTime = parseTimeMillis(item.snapshotTime);
        long actualClipStart = parseTimeMillis(item.actualClipStart);
        if (snapshotTime > 0 && actualClipStart > 0) {
            double fallback = Math.max(0d, (snapshotTime - actualClipStart) / 1000d);
            Log.d(TAG, "Fallback alarmSecond from snapshot_time - actual_clip_start: alarmId="
                    + item.id + ", alarmSecond=" + fallback
                    + ", snapshotTime=" + item.snapshotTime
                    + ", actualClipStart=" + item.actualClipStart);
            return fallback;
        }
        double fallback = item.duration > 0 && item.duration < 30 ? Math.max(0d, item.duration / 2d) : 30d;
        Log.w(TAG, "Missing backend alarmSecond and snapshot clip timing, using last fallback: alarmId="
                + item.id + ", alarmSecond=" + fallback);
        return fallback;
    }

    private static long parseTimeMillis(String raw) {
        if (raw == null || raw.trim().isEmpty()) return 0;
        String normalized = raw.trim().replace("Z", "").replace("+00:00", "");
        String[] patterns = {
                "yyyy-MM-dd'T'HH:mm:ss.SSSSSS",
                "yyyy-MM-dd'T'HH:mm:ss",
                "yyyy-MM-dd HH:mm:ss"
        };
        for (String pattern : patterns) {
            try {
                Date date = new SimpleDateFormat(pattern, Locale.getDefault()).parse(normalized);
                if (date != null) return date.getTime();
            } catch (Exception ignored) {
            }
        }
        return 0;
    }

    private static String formatTime(String raw) {
        if (raw == null || raw.isEmpty()) return "";
        String normalized = raw.replace("Z", "").replace("+00:00", "");
        String[] patterns = {
                "yyyy-MM-dd'T'HH:mm:ss.SSSSSS",
                "yyyy-MM-dd'T'HH:mm:ss",
                "yyyy-MM-dd HH:mm:ss"
        };
        for (String pattern : patterns) {
            try {
                Date date = new SimpleDateFormat(pattern, Locale.getDefault()).parse(normalized);
                if (date != null) {
                    return new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault()).format(date);
                }
            } catch (Exception ignored) {
            }
        }
        return raw;
    }

    private static String firstNonEmpty(Object... values) {
        for (Object value : values) {
            if (value == null) continue;
            String text = value.toString().trim();
            if (!text.isEmpty() && !"null".equalsIgnoreCase(text)) return text;
        }
        return "";
    }

    private static int intValue(Object... values) {
        for (Object value : values) {
            if (value instanceof Number) return ((Number) value).intValue();
            if (value != null) {
                try {
                    return Integer.parseInt(value.toString());
                } catch (Exception ignored) {
                    try {
                        return (int) Double.parseDouble(value.toString());
                    } catch (Exception ignoredAgain) {
                    }
                }
            }
        }
        return 0;
    }

    private static double doubleValue(Object... values) {
        for (Object value : values) {
            if (value instanceof Number) return ((Number) value).doubleValue();
            if (value != null) {
                try {
                    return Double.parseDouble(value.toString());
                } catch (Exception ignored) {
                }
            }
        }
        return 0d;
    }

    private static Object firstObject(Map<String, Object> row, String... keys) {
        if (row == null) return null;
        for (String key : keys) {
            if (row.containsKey(key) && row.get(key) != null && !firstNonEmpty(row.get(key)).isEmpty()) {
                return row.get(key);
            }
        }
        return null;
    }

    private static String jsonValue(Object value) {
        if (value == null) return "";
        if (value instanceof String) return firstNonEmpty(value);
        try {
            return GSON.toJson(value);
        } catch (Exception e) {
            Log.w(TAG, "Invalid bbox json value: " + value);
            return "";
        }
    }

    private static String safeMessage(Throwable t) {
        return t == null || t.getMessage() == null ? "unknown" : t.getMessage();
    }
}
