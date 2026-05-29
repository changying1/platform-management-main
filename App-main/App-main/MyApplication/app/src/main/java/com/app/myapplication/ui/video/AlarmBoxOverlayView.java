package com.app.myapplication.ui.video;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.util.AttributeSet;
import android.view.View;

import java.util.ArrayList;
import java.util.List;

public class AlarmBoxOverlayView extends View {
    public static class AlarmBox {
        public final float x1;
        public final float y1;
        public final float x2;
        public final float y2;
        public final String label;

        public AlarmBox(float x1, float y1, float x2, float y2, String label) {
            this.x1 = Math.min(x1, x2);
            this.y1 = Math.min(y1, y2);
            this.x2 = Math.max(x1, x2);
            this.y2 = Math.max(y1, y2);
            this.label = label == null || label.trim().isEmpty() ? "Alarm" : label.trim();
        }
    }

    private final Paint strokePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint textPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint labelPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final List<AlarmBox> boxes = new ArrayList<>();
    private int sourceWidth;
    private int sourceHeight;
    private final Runnable clearRunnable = this::clearBoxes;

    public AlarmBoxOverlayView(Context context) {
        super(context);
        init();
    }

    public AlarmBoxOverlayView(Context context, AttributeSet attrs) {
        super(context, attrs);
        init();
    }

    private void init() {
        setWillNotDraw(false);
        strokePaint.setColor(Color.rgb(239, 68, 68));
        strokePaint.setStyle(Paint.Style.STROKE);
        strokePaint.setStrokeWidth(dp(2.5f));

        labelPaint.setColor(Color.rgb(239, 68, 68));
        labelPaint.setStyle(Paint.Style.FILL);

        textPaint.setColor(Color.WHITE);
        textPaint.setTextSize(dp(12));
        textPaint.setStyle(Paint.Style.FILL);
    }

    public void showBoxes(List<AlarmBox> nextBoxes, int durationMs, int videoWidth, int videoHeight) {
        removeCallbacks(clearRunnable);
        boxes.clear();
        if (nextBoxes != null) {
            boxes.addAll(nextBoxes);
        }
        sourceWidth = Math.max(0, videoWidth);
        sourceHeight = Math.max(0, videoHeight);
        invalidate();
        if (!boxes.isEmpty()) {
            postDelayed(clearRunnable, Math.max(1, durationMs));
        }
    }

    public void clearBoxes() {
        removeCallbacks(clearRunnable);
        boxes.clear();
        invalidate();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        if (boxes.isEmpty() || getWidth() <= 0 || getHeight() <= 0) return;

        int inferredW = Math.max(getWidth(), maxCoordX());
        int inferredH = Math.max(getHeight(), maxCoordY());
        int rawW = sourceWidth > 0 ? sourceWidth : inferredW;
        int rawH = sourceHeight > 0 ? sourceHeight : inferredH;

        float scale = Math.min(getWidth() / (float) rawW, getHeight() / (float) rawH);
        float renderW = rawW * scale;
        float renderH = rawH * scale;
        float offsetX = (getWidth() - renderW) / 2f;
        float offsetY = (getHeight() - renderH) / 2f;

        for (AlarmBox box : boxes) {
            float x1 = box.x1;
            float y1 = box.y1;
            float x2 = box.x2;
            float y2 = box.y2;
            if (x2 <= 1.5f && y2 <= 1.5f && x1 >= 0f && y1 >= 0f) {
                x1 *= rawW;
                y1 *= rawH;
                x2 *= rawW;
                y2 *= rawH;
            }

            float left = offsetX + x1 * scale;
            float top = offsetY + y1 * scale;
            float right = offsetX + x2 * scale;
            float bottom = offsetY + y2 * scale;
            canvas.drawRect(left, top, right, bottom, strokePaint);

            float paddingX = dp(6);
            float labelHeight = dp(22);
            float labelWidth = Math.min(textPaint.measureText(box.label) + paddingX * 2, getWidth());
            float labelLeft = clamp(left, 0, getWidth() - labelWidth);
            float labelTop = Math.max(0, top - labelHeight - dp(2));
            canvas.drawRect(new RectF(labelLeft, labelTop, labelLeft + labelWidth, labelTop + labelHeight), labelPaint);
            canvas.drawText(box.label, labelLeft + paddingX, labelTop + dp(15), textPaint);
        }
    }

    private int maxCoordX() {
        float max = 1f;
        for (AlarmBox box : boxes) max = Math.max(max, Math.max(box.x1, box.x2));
        return (int) Math.ceil(max);
    }

    private int maxCoordY() {
        float max = 1f;
        for (AlarmBox box : boxes) max = Math.max(max, Math.max(box.y1, box.y2));
        return (int) Math.ceil(max);
    }

    private float clamp(float value, float min, float max) {
        return Math.max(min, Math.min(value, max));
    }

    private float dp(float value) {
        return value * getResources().getDisplayMetrics().density;
    }
}
