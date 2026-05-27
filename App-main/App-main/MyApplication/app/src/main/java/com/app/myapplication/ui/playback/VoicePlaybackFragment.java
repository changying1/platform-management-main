package com.app.myapplication.ui.playback;

import android.media.MediaPlayer;
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
import androidx.fragment.app.Fragment;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.app.myapplication.R;
import com.app.myapplication.data.local.AppConfig;

import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

public class VoicePlaybackFragment extends Fragment {

    private RecyclerView rvVoiceRecords;
    private EditText etKeyword;
    private Button btnSearch;
    private VoiceRecordAdapter adapter;
    private MediaPlayer mediaPlayer;
    private VoiceRecordItem currentPlayingItem;

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

        mediaPlayer = new MediaPlayer();

        initRecyclerView();
        loadVoiceRecords();

        btnSearch.setOnClickListener(v -> searchVoiceRecords());

        return root;
    }

    private void initRecyclerView() {
        rvVoiceRecords.setLayoutManager(new LinearLayoutManager(requireContext()));
        adapter = new VoiceRecordAdapter(new ArrayList<>(), item -> {
            playVoiceRecord(item);
        });
        rvVoiceRecords.setAdapter(adapter);
    }

    private void loadVoiceRecords() {
        List<VoiceRecordItem> items = new ArrayList<>();
        for (int i = 0; i < 10; i++) {
            items.add(new VoiceRecordItem(
                    "设备-" + (i + 1),
                    new Date(System.currentTimeMillis() - i * 3600 * 1000),
                    30 + i * 5,
                    AppConfig.toAbsoluteUrl(requireContext(), "/static/voice/record_" + (i + 1) + ".mp3")
            ));
        }
        adapter.setItems(items);
    }

    private void searchVoiceRecords() {
        String keyword = etKeyword.getText().toString().trim();
        Toast.makeText(requireContext(), "搜索: " + keyword, Toast.LENGTH_SHORT).show();
        loadVoiceRecords();
    }

    private void playVoiceRecord(VoiceRecordItem item) {
        if (currentPlayingItem != null && currentPlayingItem == item) {
            if (mediaPlayer.isPlaying()) {
                mediaPlayer.pause();
            } else {
                mediaPlayer.start();
            }
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
            Toast.makeText(requireContext(), "播放失败: " + e.getMessage(), Toast.LENGTH_SHORT).show();
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
        public String deviceName;
        public Date time;
        public int duration;
        public String filePath;

        public VoiceRecordItem(String deviceName, Date time, int duration, String filePath) {
            this.deviceName = deviceName;
            this.time = time;
            this.duration = duration;
            this.filePath = filePath;
        }
    }

    public class VoiceRecordAdapter extends RecyclerView.Adapter<VoiceRecordAdapter.VH> {

        private List<VoiceRecordItem> items;
        private OnItemClickListener listener;

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
            private ImageButton btnPlay;
            private TextView tvDeviceName;
            private TextView tvTime;
            private TextView tvDuration;

            public VH(@NonNull View itemView) {
                super(itemView);
                btnPlay = itemView.findViewById(R.id.btn_play);
                tvDeviceName = itemView.findViewById(R.id.tv_device_name);
                tvTime = itemView.findViewById(R.id.tv_time);
                tvDuration = itemView.findViewById(R.id.tv_duration);
            }

            public void bind(VoiceRecordItem item) {
                tvDeviceName.setText(item.deviceName);
                SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault());
                tvTime.setText(sdf.format(item.time));
                tvDuration.setText(item.duration + "s");

                boolean isPlaying = currentPlayingItem == item && mediaPlayer != null && mediaPlayer.isPlaying();
                btnPlay.setImageResource(isPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play);

                btnPlay.setOnClickListener(v -> listener.onItemClick(item));
            }
        }
    }

    public interface OnItemClickListener {
        void onItemClick(VoiceRecordItem item);
    }
}
