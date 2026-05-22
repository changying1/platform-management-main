package com.app.myapplication.ui.video;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.fragment.app.Fragment;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.app.myapplication.R;
import com.app.myapplication.data.api.AlarmApi;
import com.app.myapplication.data.api.ApiClient;
import com.app.myapplication.data.local.AppConfig;

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
    private final List<AlarmEventItem> items = new ArrayList<>();
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

        ApiClient.get(requireContext())
                .create(AlarmApi.class)
                .getAlarms(0, 100, null)
                .enqueue(new Callback<List<Map<String, Object>>>() {
                    @Override
                    public void onResponse(Call<List<Map<String, Object>>> call, Response<List<Map<String, Object>>> response) {
                        if (!isAdded()) return;
                        progressBar.setVisibility(View.GONE);

                        if (!response.isSuccessful() || response.body() == null) {
                            tvEmpty.setVisibility(View.VISIBLE);
                            Toast.makeText(requireContext(), "Failed to get alarm records", Toast.LENGTH_SHORT).show();
                            return;
                        }

                        items.clear();
                        for (Map<String, Object> row : response.body()) {
                            AlarmEventItem item = toAlarmEvent(row);
                            if (deviceId == null || deviceId.isEmpty() || deviceId.equals(item.deviceId)) {
                                items.add(item);
                            }
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

    private AlarmEventItem toAlarmEvent(Map<String, Object> row) {
        AlarmEventItem item = new AlarmEventItem();
        item.id = stringValue(row.get("id"));
        item.deviceId = stringValue(row.get("device_id"));
        item.type = firstNonEmpty(row.get("alarm_type"), row.get("type"), "unknown");
        item.level = firstNonEmpty(row.get("severity"), row.get("alarmLevel"), "medium");
        item.msg = firstNonEmpty(row.get("description"), row.get("msg"), "");
        item.timestamp = firstNonEmpty(row.get("timestamp"), row.get("alarmTime"), "");
        item.personnel = firstNonEmpty(row.get("person_name"), row.get("personnel"), "");
        item.deviceName = firstNonEmpty(row.get("device_name"), item.deviceId, "unknown");
        item.screenshotUrl = firstNonEmpty(row.get("alarm_image_path"), row.get("screenshot_url"), "");
        item.videoUrl = firstNonEmpty(row.get("recording_path"), row.get("video_url"), "");
        item.status = firstNonEmpty(row.get("status"), "pending");
        return item;
    }

    public static class AlarmEventItem {
        public String id;
        public String deviceId;
        public String type;
        public String level;
        public String msg;
        public String timestamp;
        public String personnel;
        public String deviceName;
        public String screenshotUrl;
        public String videoUrl;
        public String status;
    }

    private class AlarmEventAdapter extends RecyclerView.Adapter<AlarmEventAdapter.VH> {
        private final List<AlarmEventItem> list;

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
            holder.bind(list.get(position));
        }

        @Override
        public int getItemCount() {
            return list == null ? 0 : list.size();
        }

        class VH extends RecyclerView.ViewHolder {
            View alarmLevelIndicator;
            TextView tvAlarmType;
            TextView tvAlarmMsg;
            TextView tvScore;
            TextView tvPersonnel;
            TextView tvDeviceName;
            TextView tvTimestamp;
            android.widget.ImageButton btnScreenshot;
            android.widget.ImageButton btnVideo;

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
                tvScore.setText(item.level + " / " + item.status);
                tvDeviceName.setText("Device: " + item.deviceName);
                tvPersonnel.setText(item.personnel == null || item.personnel.isEmpty()
                        ? "Personnel: unknown"
                        : "Personnel: " + item.personnel);
                tvTimestamp.setText(formatTime(item.timestamp));

                String level = item.level == null ? "" : item.level.toLowerCase();
                if ("high".equals(level) || "severe".equals(level)) {
                    alarmLevelIndicator.setBackgroundColor(itemView.getContext().getResources().getColor(android.R.color.holo_red_dark));
                } else if ("medium".equals(level)) {
                    alarmLevelIndicator.setBackgroundColor(itemView.getContext().getResources().getColor(android.R.color.holo_orange_dark));
                } else {
                    alarmLevelIndicator.setBackgroundColor(itemView.getContext().getResources().getColor(android.R.color.holo_orange_light));
                }

                btnScreenshot.setOnClickListener(v -> {
                    String url = AppConfig.toAbsoluteUrl(requireContext(), item.screenshotUrl);
                    Toast.makeText(itemView.getContext(), url.isEmpty() ? "No screenshot" : url, Toast.LENGTH_SHORT).show();
                });

                btnVideo.setOnClickListener(v -> {
                    String url = AppConfig.toAbsoluteUrl(requireContext(), item.videoUrl);
                    if (url.isEmpty()) {
                        Toast.makeText(itemView.getContext(), "No related video", Toast.LENGTH_SHORT).show();
                    } else {
                        VideoFilePlayActivity.start(requireContext(), url);
                    }
                });
            }
        }
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
            String text = stringValue(value);
            if (!text.isEmpty() && !"null".equalsIgnoreCase(text)) return text;
        }
        return "";
    }

    private static String stringValue(Object value) {
        if (value == null) return "";
        if (value instanceof Number) {
            double number = ((Number) value).doubleValue();
            if (number == Math.rint(number)) {
                return String.valueOf((long) number);
            }
        }
        return value.toString().trim();
    }

    private static String safeMessage(Throwable t) {
        return t == null || t.getMessage() == null ? "unknown" : t.getMessage();
    }
}
