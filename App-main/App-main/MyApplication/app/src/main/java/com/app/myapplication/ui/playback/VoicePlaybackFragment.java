package com.app.myapplication.ui.playback;

import android.media.MediaPlayer;
import android.app.DatePickerDialog;
import android.app.TimePickerDialog;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageButton;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AlertDialog;
import androidx.fragment.app.Fragment;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.app.myapplication.R;
import com.app.myapplication.data.api.ApiClient;
import com.app.myapplication.data.api.AppVoiceCallApi;
import com.app.myapplication.data.local.AppConfig;
import com.app.myapplication.data.model.call.AppVoiceRecord;
import com.app.myapplication.data.model.call.TtsBatchRecord;
import com.app.myapplication.data.model.call.TtsQueueJob;
import com.app.myapplication.ui.call.CallRecordsFragment;

import java.io.IOException;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class VoicePlaybackFragment extends Fragment {
    private static final String TYPE_CALL = "call";
    private static final String TYPE_BROADCAST = "broadcast";

    private RecyclerView rvVoiceRecords;
    private EditText etKeyword;
    private Button btnSearch;
    private Button btnStartTime;
    private Button btnEndTime;
    private Button btnSortOrder;
    private Button btnClearTimeFilter;
    private Button btnCallRecordsTab;
    private Button btnBroadcastRecordsTab;
    private View voiceSearchBar;
    private View callRecordsContainer;
    private VoiceRecordAdapter adapter;
    private MediaPlayer mediaPlayer;
    private VoiceRecordItem currentPlayingItem;
    private AppVoiceCallApi api;
    private final List<VoiceRecordItem> allItems = new ArrayList<>();
    private List<AppVoiceRecord> pendingAudioRecords;
    private List<TtsBatchRecord> pendingTextBatches;
    private String activeRecordType = TYPE_CALL;
    private Calendar startFilter;
    private Calendar endFilter;
    private boolean sortAsc = false;

    public static VoicePlaybackFragment newInstance() {
        return new VoicePlaybackFragment();
    }

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        View root = inflater.inflate(R.layout.fragment_voice_playback, container, false);

        rvVoiceRecords = root.findViewById(R.id.rv_voice_records);
        etKeyword = root.findViewById(R.id.et_keyword);
        btnSearch = root.findViewById(R.id.btn_search);
        btnStartTime = root.findViewById(R.id.btn_start_time);
        btnEndTime = root.findViewById(R.id.btn_end_time);
        btnSortOrder = root.findViewById(R.id.btn_sort_order);
        btnClearTimeFilter = root.findViewById(R.id.btn_clear_time_filter);
        btnCallRecordsTab = root.findViewById(R.id.btn_call_records_tab);
        btnBroadcastRecordsTab = root.findViewById(R.id.btn_broadcast_records_tab);
        voiceSearchBar = root.findViewById(R.id.voice_search_bar);
        callRecordsContainer = root.findViewById(R.id.call_records_container);

        mediaPlayer = new MediaPlayer();
        if (getContext() != null) {
            api = ApiClient.get(getContext()).create(AppVoiceCallApi.class);
        }

        initRecyclerView();
        if (savedInstanceState == null) {
            getChildFragmentManager()
                    .beginTransaction()
                    .replace(R.id.call_records_container, CallRecordsFragment.newInstance())
                    .commit();
        }
        loadVoiceRecords();

        btnSearch.setOnClickListener(v -> applySearchFilter());
        btnStartTime.setOnClickListener(v -> pickDateTime(startFilter, selected -> {
            startFilter = selected;
            updateTimeFilterButtons();
            applySearchFilter();
        }));
        btnEndTime.setOnClickListener(v -> pickDateTime(endFilter, selected -> {
            endFilter = selected;
            updateTimeFilterButtons();
            applySearchFilter();
        }));
        btnSortOrder.setOnClickListener(v -> {
            sortAsc = !sortAsc;
            updateTimeFilterButtons();
            applySearchFilter();
        });
        btnClearTimeFilter.setOnClickListener(v -> {
            startFilter = null;
            endFilter = null;
            updateTimeFilterButtons();
            applySearchFilter();
        });
        btnCallRecordsTab.setOnClickListener(v -> switchRecordType(TYPE_CALL));
        btnBroadcastRecordsTab.setOnClickListener(v -> switchRecordType(TYPE_BROADCAST));
        updateRecordTypeTabs();
        updateTimeFilterButtons();

        return root;
    }

    private void switchRecordType(String type) {
        if (type.equals(activeRecordType)) return;
        activeRecordType = type;
        updateRecordTypeTabs();
        applySearchFilter();
    }

    private void updateRecordTypeTabs() {
        if (btnCallRecordsTab == null || btnBroadcastRecordsTab == null) return;
        boolean callActive = TYPE_CALL.equals(activeRecordType);
        btnCallRecordsTab.setEnabled(!callActive);
        btnBroadcastRecordsTab.setEnabled(callActive);
        btnCallRecordsTab.setAlpha(callActive ? 1.0f : 0.72f);
        btnBroadcastRecordsTab.setAlpha(callActive ? 0.72f : 1.0f);
        if (voiceSearchBar != null && callRecordsContainer != null && rvVoiceRecords != null) {
            callRecordsContainer.setVisibility(callActive ? View.VISIBLE : View.GONE);
            voiceSearchBar.setVisibility(callActive ? View.GONE : View.VISIBLE);
            rvVoiceRecords.setVisibility(callActive ? View.GONE : View.VISIBLE);
        }
    }

    private void initRecyclerView() {
        rvVoiceRecords.setLayoutManager(new LinearLayoutManager(requireContext()));
        adapter = new VoiceRecordAdapter(new ArrayList<>(), this::handleRecordClick);
        rvVoiceRecords.setAdapter(adapter);
    }

    private void loadVoiceRecords() {
        if (api == null) return;
        btnSearch.setEnabled(false);
        btnSearch.setText("加载中");
        pendingAudioRecords = null;
        pendingTextBatches = null;

        api.getWebVoiceRecords(100).enqueue(new Callback<List<AppVoiceRecord>>() {
            @Override
            public void onResponse(@NonNull Call<List<AppVoiceRecord>> call,
                                   @NonNull Response<List<AppVoiceRecord>> response) {
                pendingAudioRecords = response.isSuccessful() && response.body() != null
                        ? response.body()
                        : new ArrayList<>();
                finishLoadingIfReady();
            }

            @Override
            public void onFailure(@NonNull Call<List<AppVoiceRecord>> call, @NonNull Throwable t) {
                pendingAudioRecords = new ArrayList<>();
                showToast("音频记录加载失败: " + t.getMessage());
                finishLoadingIfReady();
            }
        });

        api.getTtsBatches(100).enqueue(new Callback<List<TtsBatchRecord>>() {
            @Override
            public void onResponse(@NonNull Call<List<TtsBatchRecord>> call,
                                   @NonNull Response<List<TtsBatchRecord>> response) {
                pendingTextBatches = response.isSuccessful() && response.body() != null
                        ? response.body()
                        : new ArrayList<>();
                finishLoadingIfReady();
            }

            @Override
            public void onFailure(@NonNull Call<List<TtsBatchRecord>> call, @NonNull Throwable t) {
                pendingTextBatches = new ArrayList<>();
                showToast("文字播报记录加载失败: " + t.getMessage());
                finishLoadingIfReady();
            }
        });
    }

    private void finishLoadingIfReady() {
        if (pendingAudioRecords == null || pendingTextBatches == null) return;

        allItems.clear();
        Set<String> audioBatchIds = new HashSet<>();
        for (AppVoiceRecord record : pendingAudioRecords) {
            VoiceRecordItem item = VoiceRecordItem.fromAudioRecord(record, requireContext());
            if (item.batchId != null && !item.batchId.isEmpty()) {
                audioBatchIds.add(item.batchId);
            }
            allItems.add(item);
        }

        for (TtsBatchRecord batch : pendingTextBatches) {
            if (batch.batchId != null && audioBatchIds.contains(batch.batchId)) {
                continue;
            }
            allItems.add(VoiceRecordItem.fromTextBatch(batch));
        }

        btnSearch.setEnabled(true);
        btnSearch.setText("搜索");
        applySearchFilter();
    }

    private void applySearchFilter() {
        List<VoiceRecordItem> filtered = new ArrayList<>();
        String keyword = etKeyword.getText().toString().trim().toLowerCase(Locale.ROOT);
        for (VoiceRecordItem item : allItems) {
            if (!activeRecordType.equals(item.recordType)) {
                continue;
            }
            if (!matchesTimeFilter(item.time)) {
                continue;
            }
            if (keyword.isEmpty() || item.matches(keyword)) {
                filtered.add(item);
            }
        }
        Collections.sort(filtered, (a, b) -> sortAsc
                ? Long.compare(a.time.getTime(), b.time.getTime())
                : Long.compare(b.time.getTime(), a.time.getTime()));
        adapter.setItems(filtered);
    }

    private boolean matchesTimeFilter(Date time) {
        long value = time == null ? 0 : time.getTime();
        if (startFilter != null && value < startFilter.getTimeInMillis()) return false;
        if (endFilter != null && value > endFilter.getTimeInMillis()) return false;
        return true;
    }

    private void updateTimeFilterButtons() {
        if (btnStartTime == null) return;
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

    private static String formatFilterButtonTime(Calendar value) {
        return new SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault()).format(value.getTime());
    }

    private interface DateTimeCallback {
        void onPicked(Calendar calendar);
    }

    private void handleRecordClick(VoiceRecordItem item) {
        if (item.isTextOnly()) {
            showTextRecordDialog(item);
        } else {
            playVoiceRecord(item);
        }
    }

    private void showTextRecordDialog(VoiceRecordItem item) {
        if (getContext() == null) return;
        new AlertDialog.Builder(getContext())
                .setTitle("文字播报记录")
                .setMessage("发送人：" + item.from + "\n"
                        + "接收对象：" + item.targetSummary + "\n"
                        + "发送时间：" + item.getDisplayTime() + "\n\n"
                        + item.transcript)
                .setPositiveButton("知道了", null)
                .show();
    }

    private void playVoiceRecord(VoiceRecordItem item) {
        if (item.filePath == null || item.filePath.trim().isEmpty()) {
            showToast("该记录没有音频文件，仅可查看文字内容");
            showTextRecordDialog(item);
            return;
        }

        if (currentPlayingItem != null && currentPlayingItem == item) {
            if (mediaPlayer.isPlaying()) {
                mediaPlayer.pause();
            } else {
                mediaPlayer.start();
            }
            adapter.notifyDataSetChanged();
            return;
        }

        try {
            if (currentPlayingItem != null) {
                mediaPlayer.stop();
                mediaPlayer.reset();
            }

            mediaPlayer.setDataSource(item.filePath);
            mediaPlayer.prepareAsync();
            mediaPlayer.setOnPreparedListener(mp -> {
                mp.start();
                currentPlayingItem = item;
                adapter.notifyDataSetChanged();
            });

            mediaPlayer.setOnCompletionListener(mp -> {
                currentPlayingItem = null;
                adapter.notifyDataSetChanged();
            });

        } catch (IOException e) {
            showToast("播放失败: " + e.getMessage());
        }
    }

    private void showToast(String message) {
        if (getContext() != null) {
            Toast.makeText(getContext(), message, Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (mediaPlayer != null) {
            mediaPlayer.release();
            mediaPlayer = null;
        }
    }

    public static class VoiceRecordItem {
        public String title;
        public String from;
        public String fromRole;
        public String targetSummary;
        public Date time;
        public int duration;
        public String filePath;
        public String transcript;
        public String batchId;
        public boolean textOnly;
        public String recordType;

        public static VoiceRecordItem fromAudioRecord(AppVoiceRecord record, android.content.Context context) {
            VoiceRecordItem item = new VoiceRecordItem();
            item.title = text(record.transcript).isEmpty() ? "语音通话记录" : record.transcript;
            item.from = fallback(record.from, "群组通话");
            item.fromRole = fallback(record.fromRole, "语音通话");
            item.targetSummary = joinOrDefault(record.toNames, "未指定接收对象");
            item.time = parseDate(record.createdAt);
            item.duration = Math.max(1, record.duration);
            item.filePath = text(record.audioUrl).isEmpty()
                    ? ""
                    : AppConfig.toAbsoluteUrl(context, record.audioUrl);
            item.transcript = fallback(record.transcript, "该语音记录暂无文字内容");
            item.batchId = record.batchId;
            item.textOnly = item.filePath.isEmpty();
            item.recordType = TYPE_CALL;
            return item;
        }

        public static VoiceRecordItem fromTextBatch(TtsBatchRecord batch) {
            VoiceRecordItem item = new VoiceRecordItem();
            item.title = fallback(batch.text, "文字播报");
            item.from = fallback(batch.operator, "群组通话");
            item.fromRole = "JT808文字播报";
            item.targetSummary = summarizeJobs(batch.jobs);
            item.time = parseDate(batch.createdAt);
            item.duration = Math.max(1, (int) Math.ceil(text(batch.text).length() / 4.0));
            item.filePath = "";
            item.transcript = fallback(batch.text, "暂无播报内容");
            item.batchId = batch.batchId;
            item.textOnly = true;
            item.recordType = TYPE_BROADCAST;
            return item;
        }

        public boolean isTextOnly() {
            return textOnly;
        }

        public boolean matches(String keyword) {
            return text(title).toLowerCase(Locale.ROOT).contains(keyword)
                    || text(from).toLowerCase(Locale.ROOT).contains(keyword)
                    || text(fromRole).toLowerCase(Locale.ROOT).contains(keyword)
                    || text(targetSummary).toLowerCase(Locale.ROOT).contains(keyword)
                    || text(transcript).toLowerCase(Locale.ROOT).contains(keyword);
        }

        public String getDisplayTime() {
            return new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault()).format(time);
        }

        private static String summarizeJobs(List<TtsQueueJob> jobs) {
            if (jobs == null || jobs.isEmpty()) return "未指定接收对象";
            List<String> names = new ArrayList<>();
            for (TtsQueueJob job : jobs) {
                String name = fallback(job.deviceName, job.devicePhone);
                if (!name.isEmpty()) names.add(name);
                if (names.size() >= 3) break;
            }
            String summary = joinOrDefault(names, "未指定接收对象");
            if (jobs.size() > 3) {
                summary += " 等" + jobs.size() + "个终端";
            }
            return summary;
        }

        private static String joinOrDefault(List<String> values, String defaultText) {
            if (values == null || values.isEmpty()) return defaultText;
            List<String> cleaned = new ArrayList<>();
            for (String value : values) {
                String text = text(value);
                if (!text.isEmpty()) cleaned.add(text);
            }
            return cleaned.isEmpty() ? defaultText : android.text.TextUtils.join("、", cleaned);
        }

        private static Date parseDate(String raw) {
            String value = text(raw);
            if (value.isEmpty()) return new Date(0);
            String normalized = value.replace("Z", "+0000");
            String[] patterns = {
                    "yyyy-MM-dd'T'HH:mm:ss.SSSZ",
                    "yyyy-MM-dd'T'HH:mm:ssZ",
                    "yyyy-MM-dd'T'HH:mm:ss.SSS",
                    "yyyy-MM-dd'T'HH:mm:ss",
                    "yyyy-MM-dd HH:mm:ss"
            };
            for (String pattern : patterns) {
                try {
                    return new SimpleDateFormat(pattern, Locale.getDefault()).parse(normalized);
                } catch (ParseException ignored) {
                }
            }
            return new Date(0);
        }

        private static String fallback(String value, String defaultText) {
            String text = text(value);
            return text.isEmpty() ? defaultText : text;
        }

        private static String text(String value) {
            return value == null ? "" : value.trim();
        }
    }

    public class VoiceRecordAdapter extends RecyclerView.Adapter<VoiceRecordAdapter.VH> {

        private List<VoiceRecordItem> items;
        private final OnItemClickListener listener;

        public VoiceRecordAdapter(List<VoiceRecordItem> items, OnItemClickListener listener) {
            this.items = items;
            this.listener = listener;
        }

        public void setItems(List<VoiceRecordItem> items) {
            this.items = items;
            notifyDataSetChanged();
        }

        @NonNull
        @Override
        public VH onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            View view = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_voice_record, parent, false);
            return new VH(view);
        }

        @Override
        public void onBindViewHolder(@NonNull VH holder, int position) {
            VoiceRecordItem item = items.get(position);
            holder.bind(item);
        }

        @Override
        public int getItemCount() {
            return items.size();
        }

        public class VH extends RecyclerView.ViewHolder {
            private final ImageButton btnPlay;
            private final TextView tvDeviceName;
            private final TextView tvTime;
            private final TextView tvDuration;

            public VH(@NonNull View itemView) {
                super(itemView);
                btnPlay = itemView.findViewById(R.id.btn_play);
                tvDeviceName = itemView.findViewById(R.id.tv_device_name);
                tvTime = itemView.findViewById(R.id.tv_time);
                tvDuration = itemView.findViewById(R.id.tv_duration);
            }

            public void bind(VoiceRecordItem item) {
                tvDeviceName.setText(item.isTextOnly() ? "文字播报：" + item.title : item.title);
                tvTime.setText(item.getDisplayTime() + "  ·  " + item.fromRole + "  ·  " + item.targetSummary);
                tvDuration.setText(item.isTextOnly() ? "查看" : item.duration + "s");

                boolean isPlaying = currentPlayingItem == item && mediaPlayer != null && mediaPlayer.isPlaying();
                btnPlay.setImageResource(item.isTextOnly()
                        ? android.R.drawable.ic_menu_view
                        : (isPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play));

                btnPlay.setOnClickListener(v -> listener.onItemClick(item));
                itemView.setOnClickListener(v -> listener.onItemClick(item));
            }
        }
    }

    public interface OnItemClickListener {
        void onItemClick(VoiceRecordItem item);
    }
}
