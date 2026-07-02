package com.app.myapplication.ui.video;

import android.app.DatePickerDialog;
import android.app.TimePickerDialog;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.TextWatcher;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
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
import com.app.myapplication.ui.alarm.AlarmAdapter;
import com.app.myapplication.ui.alarm.ImagePreviewActivity;
import com.google.gson.Gson;

import java.text.SimpleDateFormat;
import java.util.Calendar;
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
    private Button btnStartTime;
    private Button btnEndTime;
    private Button btnSortOrder;
    private Button btnClearTimeFilter;
    private EditText etPlaybackSearch;
    private final List<PlaybackItem> items = new ArrayList<>();
    private PlaybackAdapter adapter;
    private final Handler searchHandler = new Handler(Looper.getMainLooper());
    private String deviceId;
    private String keywordFilter = "";
    private boolean isAlarmMode = false;
    private int page = 1;
    private boolean loadingMore = false;
    private boolean hasMore = true;
    private Calendar startFilter;
    private Calendar endFilter;
    private boolean sortAsc = false;
    private final Runnable searchRunnable = () -> {
        if (!isAdded()) return;
        keywordFilter = etPlaybackSearch == null ? "" : etPlaybackSearch.getText().toString().trim();
        loadPlaybacks(true);
    };

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
        btnStartTime = v.findViewById(R.id.btn_start_time);
        btnEndTime = v.findViewById(R.id.btn_end_time);
        btnSortOrder = v.findViewById(R.id.btn_sort_order);
        btnClearTimeFilter = v.findViewById(R.id.btn_clear_time_filter);
        etPlaybackSearch = v.findViewById(R.id.et_playback_search);

        deviceId = getArguments() != null ? getArguments().getString(ARG_DEVICE_ID) : "";

        rvPlayback.setLayoutManager(new LinearLayoutManager(requireContext()));
        adapter = new PlaybackAdapter(items);
        rvPlayback.setAdapter(adapter);
        rvPlayback.addOnScrollListener(new RecyclerView.OnScrollListener() {
            @Override
            public void onScrolled(@NonNull RecyclerView recyclerView, int dx, int dy) {
                super.onScrolled(recyclerView, dx, dy);
                if (dy <= 0 || loadingMore || !hasMore) return;
                RecyclerView.LayoutManager manager = recyclerView.getLayoutManager();
                if (!(manager instanceof LinearLayoutManager)) return;
                LinearLayoutManager lm = (LinearLayoutManager) manager;
                int last = lm.findLastVisibleItemPosition();
                if (last >= adapter.getItemCount() - 4) {
                    page += 1;
                    loadPlaybacks(false);
                }
            }
        });

        btnNormal.setOnClickListener(view -> {
            isAlarmMode = false;
            btnNormal.setBackgroundColor(getResources().getColor(R.color.teal_200));
            btnAlarm.setBackgroundColor(getResources().getColor(android.R.color.transparent));
            loadPlaybacks(true);
        });

        btnAlarm.setOnClickListener(view -> {
            isAlarmMode = true;
            btnAlarm.setBackgroundColor(getResources().getColor(R.color.teal_200));
            btnNormal.setBackgroundColor(getResources().getColor(android.R.color.transparent));
            loadPlaybacks(true);
        });

        btnStartTime.setOnClickListener(view -> pickDateTime(startFilter, selected -> {
            startFilter = selected;
            updateTimeFilterButtons();
            loadPlaybacks(true);
        }));
        btnEndTime.setOnClickListener(view -> pickDateTime(endFilter, selected -> {
            endFilter = selected;
            updateTimeFilterButtons();
            loadPlaybacks(true);
        }));
        btnSortOrder.setOnClickListener(view -> {
            sortAsc = !sortAsc;
            updateTimeFilterButtons();
            loadPlaybacks(true);
        });
        btnClearTimeFilter.setOnClickListener(view -> {
            startFilter = null;
            endFilter = null;
            updateTimeFilterButtons();
            loadPlaybacks(true);
        });
        etPlaybackSearch.addTextChangedListener(new TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence s, int start, int count, int after) {
            }

            @Override
            public void onTextChanged(CharSequence s, int start, int before, int count) {
                searchHandler.removeCallbacks(searchRunnable);
                searchHandler.postDelayed(searchRunnable, 400);
            }

            @Override
            public void afterTextChanged(Editable s) {
            }
        });
        updateTimeFilterButtons();
        loadPlaybacks(true);
    }

    private void loadPlaybacks(boolean reset) {
        if (!isAdded()) return;
        if (reset) {
            page = 1;
            hasMore = true;
            items.clear();
            adapter.notifyDataSetChanged();
        }
        if (loadingMore || !hasMore) return;

        loadingMore = true;
        progressBar.setVisibility(reset ? View.VISIBLE : View.GONE);
        tvEmpty.setVisibility(View.GONE);

        VideoApi api = ApiClient.get(requireContext()).create(VideoApi.class);
        String scopedDeviceId = deviceId == null || deviceId.trim().isEmpty() ? null : deviceId.trim();
        Call<Map<String, Object>> call = api.queryPlaybacks(
                isAlarmMode ? "alarm" : "manual",
                page,
                40,
                scopedDeviceId,
                null,
                null,
                null,
                null,
                keywordFilter.isEmpty() ? null : keywordFilter,
                toQueryTime(startFilter),
                toQueryTime(endFilter),
                sortAsc ? "asc" : "desc"
        );

        call.enqueue(new Callback<Map<String, Object>>() {
            @Override
            public void onResponse(Call<Map<String, Object>> call, Response<Map<String, Object>> response) {
                if (!isAdded()) return;
                loadingMore = false;
                progressBar.setVisibility(View.GONE);

                if (!response.isSuccessful() || response.body() == null) {
                    tvEmpty.setVisibility(View.VISIBLE);
                    Toast.makeText(requireContext(), "获取回放列表失败：HTTP " + response.code(), Toast.LENGTH_SHORT).show();
                    return;
                }

                List<Map<String, Object>> rows = extractRows(response.body());
                for (Map<String, Object> row : rows) {
                    PlaybackItem item = toPlaybackItem(row);
                    items.add(item);
                }
                int totalPages = intValue(response.body().get("total_pages"));
                hasMore = rows.size() >= 40 && (totalPages <= 0 || page < totalPages);
                adapter.notifyDataSetChanged();
                tvEmpty.setVisibility(items.isEmpty() ? View.VISIBLE : View.GONE);
            }

            @Override
            public void onFailure(Call<Map<String, Object>> call, Throwable t) {
                if (!isAdded()) return;
                loadingMore = false;
                progressBar.setVisibility(View.GONE);
                tvEmpty.setVisibility(View.VISIBLE);
                Toast.makeText(requireContext(), "网络错误: " + safeMessage(t), Toast.LENGTH_SHORT).show();
            }
        });
    }

    @Override
    public void onDestroyView() {
        searchHandler.removeCallbacks(searchRunnable);
        super.onDestroyView();
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> extractRows(Map<String, Object> body) {
        Object data = body == null ? null : body.get("data");
        if (!(data instanceof List)) return new ArrayList<>();
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Object item : (List<?>) data) {
            if (item instanceof Map) {
                rows.add((Map<String, Object>) item);
            }
        }
        return rows;
    }

    private PlaybackItem toPlaybackItem(Map<String, Object> row) {
        PlaybackItem item = new PlaybackItem();
        item.id = firstNonEmpty(row.get("id"), row.get("record_id"), row.get("recordId"), row.get("name")).replace(".mp4", "");
        item.deviceId = firstNonEmpty(row.get("device_id"), deviceId);
        item.deviceName = firstNonEmpty(row.get("device_name"), "设备 " + item.deviceId);
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
        item.alarmType = firstNonEmpty(row.get("alarm_type"), row.get("alarmType"));
        item.alarmDescription = AlarmAdapter.normalizeAlarmDisplayText(AlarmAdapter.cleanDisplayDescription(firstNonEmpty(
                row.get("description"),
                row.get("alarm_description"),
                row.get("alarmDescription"),
                row.get("message"),
                row.get("msg")
        )));
        item.screenshotPath = firstNonEmpty(
                row.get("image_url"),
                row.get("snapshot_url"),
                row.get("picture_url"),
                row.get("alarm_image_path"),
                row.get("image_path"),
                row.get("snapshot_path"),
                row.get("screenshot_path"),
                row.get("thumbnail_path")
        );
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
        public String alarmType;
        public String alarmDescription;
        public String screenshotPath;
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
            android.widget.ImageButton btnScreenshot;
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
                btnScreenshot = itemView.findViewById(R.id.btn_screenshot);
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
                tvDuration.setText(String.format(Locale.getDefault(), "时长: %02d:%02d", minutes, seconds));

                boolean isAlarm = "alarm".equals(item.type);
                if (isAlarm) {
                    tvRecordType.setText("告警录像");
                    tvRecordType.setTextColor(itemView.getContext().getResources().getColor(android.R.color.holo_red_dark));
                    tvRecordType.setBackgroundColor(itemView.getContext().getResources().getColor(R.color.low_level));
                    typeIndicator.setBackgroundColor(itemView.getContext().getResources().getColor(android.R.color.holo_red_dark));
                    tvAlarmInfo.setVisibility(View.VISIBLE);
                    if (item.duration <= 0 || item.filePath == null || item.filePath.isEmpty()) {
                        tvAlarmInfo.setText(firstNonEmpty(item.errorMessage, alarmDisplayText(item), "暂无告警视频"));
                    } else {
                        tvAlarmInfo.setText(alarmDisplayText(item));
                    }
                    bindScreenshotButton(item);
                } else {
                    tvRecordType.setText("常规录像");
                    tvRecordType.setTextColor(itemView.getContext().getResources().getColor(android.R.color.holo_green_dark));
                    tvRecordType.setBackgroundColor(itemView.getContext().getResources().getColor(android.R.color.holo_green_dark));
                    typeIndicator.setBackgroundColor(itemView.getContext().getResources().getColor(android.R.color.holo_green_dark));
                    tvAlarmInfo.setVisibility(View.GONE);
                    btnScreenshot.setVisibility(View.GONE);
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

            private void bindScreenshotButton(PlaybackItem item) {
                String screenshotUrl = AppConfig.toAbsoluteUrl(requireContext(), item.screenshotPath);
                if (screenshotUrl.isEmpty()) {
                    btnScreenshot.setVisibility(View.GONE);
                    btnScreenshot.setOnClickListener(null);
                    return;
                }

                btnScreenshot.setVisibility(View.VISIBLE);
                btnScreenshot.setOnClickListener(v -> ImagePreviewActivity.start(requireContext(), screenshotUrl));
            }
        }
    }

    private static String alarmDisplayText(PlaybackItem item) {
        String description = AlarmAdapter.normalizeAlarmDisplayText(firstNonEmpty(item.alarmDescription));
        if (!description.isEmpty()) return description;

        String type = firstNonEmpty(item.alarmType);
        if (type.isEmpty()) return "告警事件";
        switch (type) {
            case "fire":
            case "FIRE":
                return "发现明火";
            case "smoke":
            case "SMOKE":
                return "发现烟雾";
            case "no_helmet":
            case "NO_HELMET":
                return "未佩戴安全帽";
            case "no_vest":
            case "NO_VEST":
                return "未穿反光衣";
            case "ladder_angle":
            case "LADDER_ANGLE":
                return "梯子角度违规";
            case "intrusion":
            case "INTRUSION":
                return "区域入侵";
            case "VIDEO_DEVICE_OFFLINE":
                return "视频设备离线";
            case "VIDEO_DEVICE_STATUS":
                return "视频设备状态告警";
            default:
                return AlarmAdapter.normalizeAlarmDisplayText(type);
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

    private void updateTimeFilterButtons() {
        btnStartTime.setText(startFilter == null ? "开始时间" : formatFilterButtonTime(startFilter));
        btnEndTime.setText(endFilter == null ? "结束时间" : formatFilterButtonTime(endFilter));
        btnSortOrder.setText(sortAsc ? "时间正序" : "时间倒序");
    }

    private void pickDateTime(Calendar initial, DateTimeCallback callback) {
        Calendar base = initial == null ? Calendar.getInstance() : (Calendar) initial.clone();
        new DatePickerDialog(requireContext(), (datePicker, year, month, day) -> {
            Calendar picked = (Calendar) base.clone();
            picked.set(Calendar.YEAR, year);
            picked.set(Calendar.MONTH, month);
            picked.set(Calendar.DAY_OF_MONTH, day);
            new TimePickerDialog(requireContext(), (timePicker, hour, minute) -> {
                picked.set(Calendar.HOUR_OF_DAY, hour);
                picked.set(Calendar.MINUTE, minute);
                picked.set(Calendar.SECOND, 0);
                picked.set(Calendar.MILLISECOND, 0);
                callback.onPicked(picked);
            }, picked.get(Calendar.HOUR_OF_DAY), picked.get(Calendar.MINUTE), true).show();
        }, base.get(Calendar.YEAR), base.get(Calendar.MONTH), base.get(Calendar.DAY_OF_MONTH)).show();
    }

    private static String toQueryTime(Calendar value) {
        if (value == null) return null;
        return new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault()).format(value.getTime());
    }

    private static String formatFilterButtonTime(Calendar value) {
        return new SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault()).format(value.getTime());
    }

    private interface DateTimeCallback {
        void onPicked(Calendar calendar);
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
