package com.app.myapplication.ui.call;

import android.content.Intent;
import android.app.DatePickerDialog;
import android.app.TimePickerDialog;
import android.os.Bundle;
import android.text.Editable;
import android.text.TextUtils;
import android.text.TextWatcher;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.EditText;
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
import com.app.myapplication.data.api.AppVoiceCallApi;
import com.app.myapplication.data.local.SessionManager;
import com.app.myapplication.data.model.call.AppVoiceMember;
import com.app.myapplication.data.model.call.AppVoiceRecord;
import com.app.myapplication.data.model.call.AppVoiceRoom;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.text.ParseException;
import java.text.SimpleDateFormat;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class CallRecordsFragment extends Fragment {

    private RecyclerView rvRecords;
    private ProgressBar progressBar;
    private TextView tvEmpty;
    private EditText etKeyword;
    private TextView btnSearch;
    private Button btnStartTime;
    private Button btnEndTime;
    private Button btnSortOrder;
    private Button btnClearTimeFilter;
    private final List<Object> allItems = new ArrayList<>();
    private final List<Object> displayItems = new ArrayList<>();
    private RecordAdapter adapter;
    private Calendar startFilter;
    private Calendar endFilter;
    private boolean sortAsc = false;

    public static CallRecordsFragment newInstance() {
        return new CallRecordsFragment();
    }

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        return inflater.inflate(R.layout.fragment_call_records, container, false);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        rvRecords = view.findViewById(R.id.rv_records);
        progressBar = view.findViewById(R.id.progress_bar);
        tvEmpty = view.findViewById(R.id.tv_empty);
        etKeyword = view.findViewById(R.id.et_call_keyword);
        btnSearch = view.findViewById(R.id.btn_call_search);
        btnStartTime = view.findViewById(R.id.btn_start_time);
        btnEndTime = view.findViewById(R.id.btn_end_time);
        btnSortOrder = view.findViewById(R.id.btn_sort_order);
        btnClearTimeFilter = view.findViewById(R.id.btn_clear_time_filter);

        adapter = new RecordAdapter();
        rvRecords.setLayoutManager(new LinearLayoutManager(requireContext()));
        rvRecords.setAdapter(adapter);

        btnSearch.setOnClickListener(v -> applyFilter());
        btnStartTime.setOnClickListener(v -> pickDateTime(startFilter, selected -> {
            startFilter = selected;
            updateTimeFilterButtons();
            applyFilter();
        }));
        btnEndTime.setOnClickListener(v -> pickDateTime(endFilter, selected -> {
            endFilter = selected;
            updateTimeFilterButtons();
            applyFilter();
        }));
        btnSortOrder.setOnClickListener(v -> {
            sortAsc = !sortAsc;
            updateTimeFilterButtons();
            applyFilter();
        });
        btnClearTimeFilter.setOnClickListener(v -> {
            startFilter = null;
            endFilter = null;
            updateTimeFilterButtons();
            applyFilter();
        });
        updateTimeFilterButtons();
        etKeyword.addTextChangedListener(new TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence s, int start, int count, int after) {
            }

            @Override
            public void onTextChanged(CharSequence s, int start, int before, int count) {
                applyFilter();
            }

            @Override
            public void afterTextChanged(Editable s) {
            }
        });

        loadRoomsAndRecords();
    }

    private void loadRoomsAndRecords() {
        progressBar.setVisibility(View.VISIBLE);
        tvEmpty.setVisibility(View.GONE);
        allItems.clear();
        displayItems.clear();
        adapter.notifyDataSetChanged();

        SessionManager session = new SessionManager(requireContext());
        String userId = session.getUserId();
        AppVoiceCallApi api = ApiClient.get(requireContext()).create(AppVoiceCallApi.class);

        if (TextUtils.isEmpty(userId)) {
            loadRecords(api);
            return;
        }

        api.getRooms(userId, null, 50).enqueue(new Callback<List<AppVoiceRoom>>() {
            @Override
            public void onResponse(@NonNull Call<List<AppVoiceRoom>> call, @NonNull Response<List<AppVoiceRoom>> response) {
                if (response.isSuccessful() && response.body() != null) {
                    allItems.addAll(response.body());
                }
                loadRecords(api);
            }

            @Override
            public void onFailure(@NonNull Call<List<AppVoiceRoom>> call, @NonNull Throwable t) {
                Toast.makeText(requireContext(), "获取待接听通话失败: " + t.getMessage(), Toast.LENGTH_SHORT).show();
                loadRecords(api);
            }
        });
    }

    private void loadRecords(AppVoiceCallApi api) {
        api.getRecords(100).enqueue(new Callback<List<AppVoiceRecord>>() {
            @Override
            public void onResponse(@NonNull Call<List<AppVoiceRecord>> call, @NonNull Response<List<AppVoiceRecord>> response) {
                progressBar.setVisibility(View.GONE);
                if (response.isSuccessful() && response.body() != null) {
                    allItems.addAll(response.body());
                } else {
                    Toast.makeText(requireContext(), "获取通话记录失败", Toast.LENGTH_SHORT).show();
                }
                applyFilter();
            }

            @Override
            public void onFailure(@NonNull Call<List<AppVoiceRecord>> call, @NonNull Throwable t) {
                progressBar.setVisibility(View.GONE);
                applyFilter();
                Toast.makeText(requireContext(), "网络错误: " + t.getMessage(), Toast.LENGTH_SHORT).show();
            }
        });
    }

    private void applyFilter() {
        String keyword = etKeyword == null ? "" : etKeyword.getText().toString().trim().toLowerCase(Locale.ROOT);
        displayItems.clear();
        for (Object item : allItems) {
            if (!matchesTimeFilter(item)) {
                continue;
            }
            if (keyword.isEmpty() || matches(item, keyword)) {
                displayItems.add(item);
            }
        }
        Collections.sort(displayItems, (a, b) -> sortAsc
                ? Long.compare(itemTimeMillis(a), itemTimeMillis(b))
                : Long.compare(itemTimeMillis(b), itemTimeMillis(a)));
        adapter.notifyDataSetChanged();
        tvEmpty.setVisibility(displayItems.isEmpty() ? View.VISIBLE : View.GONE);
    }

    private boolean matchesTimeFilter(Object item) {
        long value = itemTimeMillis(item);
        if (startFilter != null && value < startFilter.getTimeInMillis()) return false;
        if (endFilter != null && value > endFilter.getTimeInMillis()) return false;
        return true;
    }

    private long itemTimeMillis(Object item) {
        if (item instanceof AppVoiceRoom) {
            return parseMillis(((AppVoiceRoom) item).createdAt);
        }
        if (item instanceof AppVoiceRecord) {
            AppVoiceRecord record = (AppVoiceRecord) item;
            return parseMillis(firstNonEmpty(record.startedAt, record.endedAt, record.createdAt));
        }
        return 0;
    }

    private boolean matches(Object item, String keyword) {
        if (item instanceof AppVoiceRoom) {
            return matchesRoom((AppVoiceRoom) item, keyword);
        }
        if (item instanceof AppVoiceRecord) {
            return matchesRecord((AppVoiceRecord) item, keyword);
        }
        return false;
    }

    private boolean matchesRoom(AppVoiceRoom room, String keyword) {
        if (contains(room.roomId, keyword)
                || contains(room.title, keyword)
                || contains(room.type, keyword)
                || contains(room.status, keyword)
                || contains(room.initiatorId, keyword)
                || contains(room.createdAt, keyword)) {
            return true;
        }
        if (room.members != null) {
            for (AppVoiceMember member : room.members) {
                if (matchesMember(member, keyword)) {
                    return true;
                }
            }
        }
        return false;
    }

    private boolean matchesRecord(AppVoiceRecord record, String keyword) {
        if (contains(record.title, keyword)
                || contains(record.status, keyword)
                || contains(record.roomId, keyword)
                || contains(record.initiatorId, keyword)
                || contains(record.from, keyword)
                || contains(record.fromRole, keyword)
                || contains(record.transcript, keyword)
                || contains(record.startedAt, keyword)
                || contains(record.endedAt, keyword)
                || contains(record.createdAt, keyword)
                || containsList(record.toNames, keyword)
                || containsList(record.targetPhones, keyword)) {
            return true;
        }
        if (record.members != null) {
            for (AppVoiceMember member : record.members) {
                if (matchesMember(member, keyword)) {
                    return true;
                }
            }
        }
        return false;
    }

    private boolean matchesMember(AppVoiceMember member, String keyword) {
        return member != null
                && (contains(member.userId, keyword)
                || contains(member.name, keyword)
                || contains(member.clientType, keyword)
                || contains(member.role, keyword)
                || contains(member.status, keyword));
    }

    private boolean containsList(List<String> values, String keyword) {
        if (values == null) return false;
        for (String value : values) {
            if (contains(value, keyword)) return true;
        }
        return false;
    }

    private boolean contains(String value, String keyword) {
        return value != null && value.toLowerCase(Locale.ROOT).contains(keyword);
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

    private static String firstNonEmpty(String... values) {
        for (String value : values) {
            if (value != null && !value.trim().isEmpty()) return value;
        }
        return "";
    }

    private static long parseMillis(String raw) {
        if (raw == null || raw.trim().isEmpty()) return 0;
        String normalized = raw.trim().replace("Z", "").replace("+00:00", "");
        String[] patterns = {
                "yyyy-MM-dd'T'HH:mm:ss.SSSSSS",
                "yyyy-MM-dd'T'HH:mm:ss.SSS",
                "yyyy-MM-dd'T'HH:mm:ss",
                "yyyy-MM-dd HH:mm:ss"
        };
        for (String pattern : patterns) {
            try {
                Date date = new SimpleDateFormat(pattern, Locale.getDefault()).parse(normalized);
                if (date != null) return date.getTime();
            } catch (ParseException ignored) {
            }
        }
        return 0;
    }

    private interface DateTimeCallback {
        void onPicked(Calendar calendar);
    }

    private class RecordAdapter extends RecyclerView.Adapter<RecordAdapter.VH> {
        @NonNull
        @Override
        public VH onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            View view = LayoutInflater.from(parent.getContext()).inflate(R.layout.item_call_record, parent, false);
            return new VH(view);
        }

        @Override
        public void onBindViewHolder(@NonNull VH holder, int position) {
            holder.bind(displayItems.get(position));
        }

        @Override
        public int getItemCount() {
            return displayItems.size();
        }

        class VH extends RecyclerView.ViewHolder {
            TextView tvCallType;
            TextView tvCallContent;
            TextView tvDuration;
            TextView tvTargetCount;
            TextView tvTime;

            VH(@NonNull View itemView) {
                super(itemView);
                tvCallType = itemView.findViewById(R.id.tv_call_type);
                tvCallContent = itemView.findViewById(R.id.tv_call_content);
                tvDuration = itemView.findViewById(R.id.tv_duration);
                tvTargetCount = itemView.findViewById(R.id.tv_target_count);
                tvTime = itemView.findViewById(R.id.tv_time);
                View replay = itemView.findViewById(R.id.btn_replay);
                View detail = itemView.findViewById(R.id.btn_detail);
                if (replay != null) replay.setVisibility(View.GONE);
                if (detail != null) detail.setVisibility(View.GONE);
            }

            void bind(Object item) {
                if (item instanceof AppVoiceRoom) {
                    bindRoom((AppVoiceRoom) item);
                } else {
                    bindRecord((AppVoiceRecord) item);
                }
            }

            private void bindRoom(AppVoiceRoom room) {
                tvCallType.setText("calling".equals(room.status) ? "待接听" : statusText(room.status));
                tvCallContent.setText(room.title == null ? "App 群组语音通话" : room.title);
                tvDuration.setText("接听");
                int count = room.members == null ? 0 : room.members.size();
                tvTargetCount.setText(String.format(Locale.getDefault(), "%d 位成员", count));
                tvTime.setText(room.createdAt == null ? "--" : room.createdAt);
                itemView.setOnClickListener(v -> openRoom(room));
            }

            private void bindRecord(AppVoiceRecord record) {
                tvCallType.setText(statusText(record.status));
                tvCallContent.setText(record.title == null ? "App 群组语音通话" : record.title);
                int minutes = record.durationSeconds / 60;
                int seconds = record.durationSeconds % 60;
                tvDuration.setText(String.format(Locale.getDefault(), "%02d:%02d", minutes, seconds));
                tvTargetCount.setText(String.format(Locale.getDefault(), "%d 位成员", record.memberCount));
                tvTime.setText(record.startedAt != null ? record.startedAt : record.endedAt);
                itemView.setOnClickListener(null);
            }

            private void openRoom(AppVoiceRoom room) {
                String userId = new SessionManager(requireContext()).getUserId();
                if (TextUtils.isEmpty(userId)) {
                    Toast.makeText(requireContext(), "请先在发起通话页选择当前身份", Toast.LENGTH_SHORT).show();
                    return;
                }
                Intent intent = new Intent(requireContext(), VoiceRoomActivity.class);
                intent.putExtra(VoiceRoomActivity.EXTRA_ROOM_ID, room.roomId);
                intent.putExtra(VoiceRoomActivity.EXTRA_USER_ID, userId);
                intent.putExtra(VoiceRoomActivity.EXTRA_IS_INITIATOR, false);
                startActivity(intent);
            }

            private String statusText(String status) {
                if ("calling".equals(status)) return "待接听";
                if ("active".equals(status)) return "进行中";
                if ("ended".equals(status)) return "已结束";
                if ("cancelled".equals(status)) return "已取消";
                if ("missed".equals(status)) return "未接听";
                return "语音通话";
            }
        }
    }
}
