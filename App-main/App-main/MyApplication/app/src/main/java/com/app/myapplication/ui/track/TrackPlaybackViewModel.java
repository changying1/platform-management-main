package com.app.myapplication.ui.track;

import android.app.Application;
import android.os.Handler;
import android.os.Looper;

import androidx.annotation.NonNull;
import androidx.lifecycle.AndroidViewModel;
import androidx.lifecycle.MutableLiveData;

import com.app.myapplication.data.model.TrackPoint;
import com.app.myapplication.data.model.TrackQuery;
import com.app.myapplication.data.repo.TrackRepository;

import java.util.ArrayList;
import java.util.List;

public class TrackPlaybackViewModel extends AndroidViewModel {

    public static class UiState {
        public List<TrackPoint> points = new ArrayList<>();
        public boolean isPlaying = false;
        public int progress = 0; // 0..1000
        public SpeedOption speed = SpeedOption.X1;
        public String error;
    }

    public final MutableLiveData<UiState> state = new MutableLiveData<>(new UiState());

    private final TrackRepository repo;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable ticker = new Runnable() {
        @Override public void run() {
            UiState s = state.getValue();
            if (s == null || !s.isPlaying) return;

            int step = Math.max(1, Math.round(2 * s.speed.factor)); // 每帧推进
            s.progress = Math.min(1000, s.progress + step);

            if (s.progress >= 1000) {
                s.isPlaying = false;
            }
            state.setValue(s);

            if (s.isPlaying) handler.postDelayed(this, 50);
        }
    };

    public TrackPlaybackViewModel(@NonNull Application app) {
        super(app);
        repo = new TrackRepository(app);
    }

    public void search(String keyword, String startDate, String endDate) {
        UiState s = state.getValue();
        if (s == null) s = new UiState();
        s.error = null;
        state.setValue(s);

        repo.queryTrack(new TrackQuery(keyword, startDate, endDate), new TrackRepository.RepoCallback<List<TrackPoint>>() {
            @Override public void onSuccess(List<TrackPoint> data) {
                UiState ns = state.getValue();
                if (ns == null) ns = new UiState();
                ns.points = (data == null) ? new ArrayList<>() : data;
                ns.progress = 0;
                ns.isPlaying = false;
                state.setValue(ns);
            }

            @Override public void onError(String msg) {
                UiState ns = state.getValue();
                if (ns == null) ns = new UiState();
                ns.error = msg;
                state.setValue(ns);
            }
        });
    }

    public void togglePlay() {
        UiState s = state.getValue();
        if (s == null) return;
        if (s.points == null || s.points.size() < 2) {
            s.error = "轨迹点不足，无法播放";
            state.setValue(s);
            return;
        }
        s.isPlaying = !s.isPlaying;
        state.setValue(s);
        if (s.isPlaying) handler.post(ticker);
    }

    public void stop() {
        UiState s = state.getValue();
        if (s == null) return;
        s.isPlaying = false;
        s.progress = 0;
        state.setValue(s);
    }

    public void setProgress(int p) {
        UiState s = state.getValue();
        if (s == null) return;
        s.progress = Math.max(0, Math.min(1000, p));
        state.setValue(s);
    }

    public void setSpeed(SpeedOption sp) {
        UiState s = state.getValue();
        if (s == null) return;
        s.speed = sp;
        state.setValue(s);
    }

    @Override
    protected void onCleared() {
        handler.removeCallbacksAndMessages(null);
    }
}
