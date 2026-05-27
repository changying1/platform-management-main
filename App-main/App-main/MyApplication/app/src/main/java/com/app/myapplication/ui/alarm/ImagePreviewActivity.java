package com.app.myapplication.ui.alarm;

import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.ProgressBar;
import android.widget.Toast;

import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;

import com.app.myapplication.R;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class ImagePreviewActivity extends AppCompatActivity {
    private static final String TAG = "ImagePreview";
    private static final String EXTRA_IMAGE_URL = "image_url";

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private ImageView imageView;
    private ProgressBar progressBar;
    private String imageUrl;

    public static void start(Context context, String imageUrl) {
        Intent intent = new Intent(context, ImagePreviewActivity.class);
        intent.putExtra(EXTRA_IMAGE_URL, imageUrl);
        context.startActivity(intent);
    }

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_image_preview);

        imageView = findViewById(R.id.iv_alarm_preview);
        progressBar = findViewById(R.id.pb_alarm_preview);
        ImageButton btnClose = findViewById(R.id.btn_close_preview);
        btnClose.setOnClickListener(v -> finish());

        imageUrl = getIntent().getStringExtra(EXTRA_IMAGE_URL);
        if (imageUrl == null || imageUrl.trim().isEmpty()) {
            Toast.makeText(this, "暂无报警截图", Toast.LENGTH_SHORT).show();
            finish();
            return;
        }

        loadImage(imageUrl.trim());
    }

    private void loadImage(String finalImageUrl) {
        progressBar.setVisibility(View.VISIBLE);
        executor.execute(() -> {
            Bitmap bitmap = null;
            Exception error = null;
            HttpURLConnection connection = null;
            try {
                URL url = new URL(finalImageUrl);
                connection = (HttpURLConnection) url.openConnection();
                connection.setConnectTimeout(10000);
                connection.setReadTimeout(15000);
                connection.setInstanceFollowRedirects(true);
                int code = connection.getResponseCode();
                if (code >= 200 && code < 300) {
                    try (InputStream input = connection.getInputStream()) {
                        bitmap = BitmapFactory.decodeStream(input);
                    }
                } else {
                    error = new IllegalStateException("HTTP " + code);
                }
            } catch (Exception e) {
                error = e;
            } finally {
                if (connection != null) {
                    connection.disconnect();
                }
            }

            Bitmap result = bitmap;
            Exception loadError = error;
            runOnUiThread(() -> {
                progressBar.setVisibility(View.GONE);
                if (result == null) {
                    Log.e(TAG, "报警截图加载失败 finalImageUrl=" + finalImageUrl, loadError);
                    Toast.makeText(this, "报警截图加载失败", Toast.LENGTH_SHORT).show();
                    return;
                }
                imageView.setImageBitmap(result);
            });
        });
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        executor.shutdownNow();
    }
}
