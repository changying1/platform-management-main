package com.app.myapplication.ui.video;

import android.content.pm.ActivityInfo;
import android.os.Bundle;
import android.view.*;
        import android.widget.ImageButton;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.fragment.app.DialogFragment;

import com.app.myapplication.R;

public class FullscreenVideoDialog extends DialogFragment {

    // 传进来“正在播放的 PlayerView”
    private View playerView;
    private ViewGroup oldParent;
    private int oldIndex = -1;

    public void attachPlayerView(View pv) {
        this.playerView = pv;
    }

    @Override
    public void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setStyle(STYLE_NO_TITLE, android.R.style.Theme_Black_NoTitleBar_Fullscreen);
    }

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater,
                             @Nullable ViewGroup container,
                             @Nullable Bundle savedInstanceState) {
        return inflater.inflate(R.layout.dialog_fullscreen_video, container, false);
    }

    @Override
    public void onStart() {
        super.onStart();

        // Dialog 真正铺满
        Window w = getDialog() != null ? getDialog().getWindow() : null;
        if (w != null) {
            w.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);

            // 沉浸式
            WindowCompat.setDecorFitsSystemWindows(w, false);
            WindowInsetsControllerCompat c =
                    WindowCompat.getInsetsController(w, w.getDecorView());
            if (c != null) {
                c.hide(WindowInsetsCompat.Type.systemBars());
                c.setSystemBarsBehavior(
                        WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                );
            }
        }

        // 横屏（退出恢复）
        requireActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE);
    }

    @Override
    public void onViewCreated(@NonNull View v, @Nullable Bundle savedInstanceState) {
        ViewGroup container = v.findViewById(R.id.full_container);
        ImageButton btnExit = v.findViewById(R.id.btn_exit_fullscreen);

        btnExit.setOnClickListener(view -> dismiss());

        if (playerView != null) {
            // 记录原父容器和位置
            oldParent = (ViewGroup) playerView.getParent();
            if (oldParent != null) {
                oldIndex = oldParent.indexOfChild(playerView);
                oldParent.removeView(playerView);
            }
            // 挪进全屏容器
            container.addView(playerView, new ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
            ));
        }
    }

    @Override
    public void onDestroyView() {
        super.onDestroyView();

        // 把 playerView 挪回原位
        if (playerView != null && oldParent != null) {
            ViewGroup curParent = (ViewGroup) playerView.getParent();
            if (curParent != null) curParent.removeView(playerView);

            if (oldIndex >= 0 && oldIndex <= oldParent.getChildCount()) {
                oldParent.addView(playerView, oldIndex);
            } else {
                oldParent.addView(playerView);
            }
        }

        // 回竖屏
        requireActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
    }
}
