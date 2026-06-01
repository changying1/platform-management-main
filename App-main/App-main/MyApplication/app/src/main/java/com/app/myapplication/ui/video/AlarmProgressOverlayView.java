package com.app.myapplication.ui.video;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.util.AttributeSet;
import android.view.View;

public class AlarmProgressOverlayView extends View {
    private final Paint linePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint dotPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private boolean visible;
    private long alarmSecond;
    private long durationMs;

    public AlarmProgressOverlayView(Context context) {
        super(context);
        init();
    }

    public AlarmProgressOverlayView(Context context, AttributeSet attrs) {
        super(context, attrs);
        init();
    }

    private void init() {
        linePaint.setColor(Color.RED);
        linePaint.setStrokeWidth(dp(2));
        dotPaint.setColor(Color.RED);
        setWillNotDraw(false);
    }

    public void setAlarmMarker(boolean show, long alarmSecond, long durationMs) {
        this.visible = show;
        this.alarmSecond = Math.max(0, alarmSecond);
        this.durationMs = Math.max(0, durationMs);
        setVisibility(show ? VISIBLE : GONE);
        invalidate();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        if (!visible || durationMs <= 0) return;

        float ratio = Math.max(0f, Math.min(1f, (alarmSecond * 1000f) / durationMs));
        float leftPadding = dp(28);
        float rightPadding = dp(28);
        float x = leftPadding + ratio * Math.max(0, getWidth() - leftPadding - rightPadding);
        float bottom = getHeight() - dp(32);
        canvas.drawLine(x, bottom - dp(18), x, bottom + dp(8), linePaint);
        canvas.drawCircle(x, bottom - dp(2), dp(5), dotPaint);
    }

    private float dp(float value) {
        return value * getResources().getDisplayMetrics().density;
    }
}
