package com.app.myapplication.ui.video;

import android.app.Dialog;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Bundle;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.fragment.app.DialogFragment;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.PlayerView;

import com.app.myapplication.R;

public class FullscreenVideoDialog extends DialogFragment {

    private static final String TAG = "FullscreenVideoDialog";
    private static final String ARG_PLAY_URL = "play_url";
    private static final String ARG_PLAY_TYPE = "play_type";

    private PlayerView fullscreenPlayerView;
    private TextView btnFullscreenPlay;
    private TextView btnCloseFullscreen;
    private ExoPlayer fullscreenPlayer;
    private int oldRequestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED;
    private Runnable onDismissCallback;
    private String playUrl;
    private String playType;

    public static FullscreenVideoDialog newInstance(String playUrl, String playType) {
        FullscreenVideoDialog dialog = new FullscreenVideoDialog();
        Bundle args = new Bundle();
        args.putString(ARG_PLAY_URL, playUrl);
        args.putString(ARG_PLAY_TYPE, playType);
        dialog.setArguments(args);
        return dialog;
    }

    public void setOnFullscreenDismissListener(Runnable listener) {
        this.onDismissCallback = listener;
    }

    @Override
    public void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setStyle(STYLE_NO_TITLE, android.R.style.Theme_Black_NoTitleBar_Fullscreen);

        Bundle args = getArguments();
        if (args != null) {
            playUrl = args.getString(ARG_PLAY_URL);
            playType = args.getString(ARG_PLAY_TYPE);
        }
    }

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater,
                             @Nullable ViewGroup container,
                             @Nullable Bundle savedInstanceState) {
        return inflater.inflate(R.layout.dialog_fullscreen_video, container, false);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        View root = view.findViewById(R.id.fullscreen_root);
        fullscreenPlayerView = view.findViewById(R.id.fullscreen_player_view);
        btnFullscreenPlay = view.findViewById(R.id.btn_fullscreen_play);
        btnCloseFullscreen = view.findViewById(R.id.btn_close_fullscreen);

        Log.d(TAG, "fullscreenPlayerView=" + fullscreenPlayerView
                + ", btnFullscreenPlay=" + btnFullscreenPlay
                + ", btnCloseFullscreen=" + btnCloseFullscreen);

        root.setOnClickListener(v -> {
            if (fullscreenPlayer != null && !fullscreenPlayer.isPlaying()) {
                startFullscreenPlayback();
            }
        });
        fullscreenPlayerView.setOnClickListener(v -> {
            if (fullscreenPlayer != null && !fullscreenPlayer.isPlaying()) {
                startFullscreenPlayback();
            }
        });
        if (btnFullscreenPlay != null) {
            btnFullscreenPlay.setVisibility(View.VISIBLE);
            btnFullscreenPlay.bringToFront();
            btnFullscreenPlay.setOnClickListener(v -> {
                Log.d(TAG, "Fullscreen center play button clicked");
                startFullscreenPlayback();
            });
            btnFullscreenPlay.post(() -> {
                btnFullscreenPlay.setVisibility(View.VISIBLE);
                btnFullscreenPlay.bringToFront();
                btnFullscreenPlay.requestLayout();
                btnFullscreenPlay.invalidate();
            });
        }
        if (btnCloseFullscreen != null) {
            btnCloseFullscreen.bringToFront();
            btnCloseFullscreen.setOnClickListener(v -> dismiss());
        }
    }

    @Override
    public void onStart() {
        super.onStart();

        Dialog dialog = getDialog();
        Window window = dialog != null ? dialog.getWindow() : null;
        if (window != null) {
            window.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
            window.setBackgroundDrawable(new ColorDrawable(Color.BLACK));

            WindowCompat.setDecorFitsSystemWindows(window, false);
            WindowInsetsControllerCompat controller =
                    WindowCompat.getInsetsController(window, window.getDecorView());
            if (controller != null) {
                controller.hide(WindowInsetsCompat.Type.systemBars());
                controller.setSystemBarsBehavior(
                        WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                );
            }
        }

        oldRequestedOrientation = requireActivity().getRequestedOrientation();
        requireActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE);
        initFullscreenPlayer(false);
    }

    private void initFullscreenPlayer(boolean autoPlay) {
        if (playUrl == null || playUrl.trim().isEmpty()) {
            Toast.makeText(requireContext(), "播放地址为空", Toast.LENGTH_SHORT).show();
            dismiss();
            return;
        }

        if (fullscreenPlayer != null) {
            if (autoPlay) {
                fullscreenPlayer.play();
            }
            return;
        }

        Log.d(TAG, "Fullscreen independent player init, playUrl=" + playUrl
                + ", playType=" + playType
                + ", autoPlay=" + autoPlay);

        fullscreenPlayer = new ExoPlayer.Builder(requireContext()).build();
        fullscreenPlayerView.setPlayer(fullscreenPlayer);
        fullscreenPlayer.addListener(new Player.Listener() {
            @Override
            public void onPlaybackStateChanged(int playbackState) {
                Log.d(TAG, "Fullscreen playbackState=" + playbackState
                        + ", isPlaying=" + fullscreenPlayer.isPlaying());

                if (playbackState == Player.STATE_READY && fullscreenPlayer.isPlaying()
                        && btnFullscreenPlay != null) {
                    btnFullscreenPlay.setVisibility(View.GONE);
                }
            }

            @Override
            public void onIsPlayingChanged(boolean isPlaying) {
                Log.d(TAG, "Fullscreen isPlaying=" + isPlaying);
                if (btnFullscreenPlay != null) {
                    btnFullscreenPlay.setVisibility(isPlaying ? View.GONE : View.VISIBLE);
                }
            }

            @Override
            public void onPlayerError(@NonNull PlaybackException error) {
                Log.e(TAG, "Fullscreen independent player error: " + error.getMessage(), error);
                if (btnFullscreenPlay != null) {
                    btnFullscreenPlay.setVisibility(View.VISIBLE);
                }
                Toast.makeText(requireContext(), "全屏播放失败，请点击播放重试", Toast.LENGTH_SHORT).show();
            }
        });

        fullscreenPlayer.setMediaItem(MediaItem.fromUri(playUrl));
        fullscreenPlayer.prepare();
        if (autoPlay) {
            fullscreenPlayer.play();
        } else {
            fullscreenPlayer.pause();
            if (btnFullscreenPlay != null) {
                btnFullscreenPlay.setVisibility(View.VISIBLE);
            }
        }
    }

    private void startFullscreenPlayback() {
        if (fullscreenPlayer == null) {
            initFullscreenPlayer(false);
        }

        if (fullscreenPlayer == null) {
            return;
        }

        Log.d(TAG, "Fullscreen play button clicked, playUrl=" + playUrl);

        if (fullscreenPlayer.getPlaybackState() == Player.STATE_IDLE) {
            fullscreenPlayer.setMediaItem(MediaItem.fromUri(playUrl));
            fullscreenPlayer.prepare();
        }

        fullscreenPlayer.play();
        if (btnFullscreenPlay != null) {
            btnFullscreenPlay.setVisibility(View.GONE);
        }
    }

    @Override
    public void onStop() {
        requireActivity().setRequestedOrientation(oldRequestedOrientation);
        super.onStop();
    }

    @Override
    public void onDestroyView() {
        releaseFullscreenPlayer();
        if (onDismissCallback != null) {
            onDismissCallback.run();
        }
        btnFullscreenPlay = null;
        btnCloseFullscreen = null;
        fullscreenPlayerView = null;
        super.onDestroyView();
    }

    private void releaseFullscreenPlayer() {
        if (fullscreenPlayerView != null) {
            fullscreenPlayerView.setPlayer(null);
        }

        if (fullscreenPlayer != null) {
            fullscreenPlayer.release();
            fullscreenPlayer = null;
        }
    }
}
