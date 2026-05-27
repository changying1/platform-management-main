package com.app.myapplication.ui.call;

import android.content.Intent;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
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
import com.app.myapplication.data.model.call.AppVoiceRecord;
import com.app.myapplication.data.model.call.AppVoiceRoom;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class CallRecordsFragment extends Fragment {

    private RecyclerView rvRecords;
    private ProgressBar progressBar;
    private TextView tvEmpty;
    private final List<Object> items = new ArrayList<>();
    private RecordAdapter adapter;

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

        adapter = new RecordAdapter();
        rvRecords.setLayoutManager(new LinearLayoutManager(requireContext()));
        rvRecords.setAdapter(adapter);

        loadRoomsAndRecords();
    }

    private void loadRoomsAndRecords() {
        progressBar.setVisibility(View.VISIBLE);
        tvEmpty.setVisibility(View.GONE);
        items.clear();

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
                    items.addAll(response.body());
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
                    items.addAll(response.body());
                } else {
                    Toast.makeText(requireContext(), "获取通话记录失败", Toast.LENGTH_SHORT).show();
                }
                adapter.notifyDataSetChanged();
                tvEmpty.setVisibility(items.isEmpty() ? View.VISIBLE : View.GONE);
            }

            @Override
            public void onFailure(@NonNull Call<List<AppVoiceRecord>> call, @NonNull Throwable t) {
                progressBar.setVisibility(View.GONE);
                tvEmpty.setVisibility(items.isEmpty() ? View.VISIBLE : View.GONE);
                Toast.makeText(requireContext(), "网络错误: " + t.getMessage(), Toast.LENGTH_SHORT).show();
            }
        });
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
            holder.bind(items.get(position));
        }

        @Override
        public int getItemCount() {
            return items.size();
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
                tvCallType.setText("待接听".equals(room.status) ? "待接听" : statusText(room.status));
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
