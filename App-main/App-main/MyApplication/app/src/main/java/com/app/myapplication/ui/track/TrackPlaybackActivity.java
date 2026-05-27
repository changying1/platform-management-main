package com.app.myapplication.ui.track;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;

import com.amap.api.maps.AMap;
import com.amap.api.maps.CameraUpdateFactory;
import com.amap.api.maps.MapView;
import com.amap.api.maps.model.BitmapDescriptor;
import com.amap.api.maps.model.BitmapDescriptorFactory;
import com.amap.api.maps.model.LatLng;
import com.amap.api.maps.model.LatLngBounds;
import com.amap.api.maps.model.Marker;
import com.amap.api.maps.model.MarkerOptions;
import com.amap.api.maps.model.Polyline;
import com.amap.api.maps.model.PolylineOptions;
import com.app.myapplication.R;
import com.app.myapplication.data.api.TrackApi;
import com.app.myapplication.data.model.TrajectoryPoint;
import com.app.myapplication.data.model.TrackDevice;
import com.app.myapplication.data.model.TrackDeviceListResponse;
import com.app.myapplication.data.api.ApiClient;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class TrackPlaybackActivity extends AppCompatActivity {

    private MapView mapView;
    private AMap aMap;
    private Spinner spinnerDevice;
    private Spinner spinnerTimeRange;
    private Spinner spinnerSpeed;
    private Button btnLoadTrack;
    private ImageButton btnBack;
    private ImageButton btnPlayPause;
    private ImageButton btnFirst;
    private ImageButton btnPrev;
    private ImageButton btnPrev10;
    private ImageButton btnNext;
    private ImageButton btnNext10;
    private ImageButton btnLast;
    private SeekBar seekBarProgress;
    private TextView tvProgress;
    private TextView tvDeviceInfo;
    private TextView tvTrackStats;
    private TextView tvStartTime;
    private TextView tvCurrentTime;
    private TextView tvEndTime;
    private TextView tvCurrentSpeed;
    private TextView tvTimeRange;
    private LinearLayout layoutTrackInfo;

    private TrackApi trackApi;
    private List<TrackDevice> deviceList = new ArrayList<>();
    private List<TrajectoryPoint> trackPoints = new ArrayList<>();
    
    private Polyline trackPolyline;
    private Marker startMarker;
    private Marker endMarker;
    private Marker movingMarker;
    
    private int currentPointIndex = 0;
    private boolean isPlaying = false;
    private double playSpeed = 1.0;
    private int timeRangeHours = 24;
    
    private Handler playHandler = new Handler(Looper.getMainLooper());
    private Runnable playRunnable;
    
    private static final int[] TIME_RANGES = {6, 12, 24, 48, 72, 168};
    private static final String[] TIME_RANGE_LABELS = {"6小时", "12小时", "24小时", "48小时", "72小时", "7天"};
    private static final double[] SPEEDS = {0.5, 1, 2, 4, 8, 16, 32};
    private static final String[] SPEED_LABELS = {"0.5x", "1x", "2x", "4x", "8x", "16x", "32x"};

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_track_playback);
        
        trackApi = ApiClient.get(this).create(TrackApi.class);
        
        initViews();
        initMap(savedInstanceState);
        initSpinners();
        initListeners();
        loadDevices();
    }

    private void initViews() {
        mapView = findViewById(R.id.mapView);
        spinnerDevice = findViewById(R.id.spinnerDevice);
        spinnerTimeRange = findViewById(R.id.spinnerTimeRange);
        spinnerSpeed = findViewById(R.id.spinnerSpeed);
        btnLoadTrack = findViewById(R.id.btnLoadTrack);
        btnBack = findViewById(R.id.btnBack);
        btnPlayPause = findViewById(R.id.btnPlayPause);
        btnFirst = findViewById(R.id.btnFirst);
        btnPrev = findViewById(R.id.btnPrev);
        btnPrev10 = findViewById(R.id.btnPrev10);
        btnNext = findViewById(R.id.btnNext);
        btnNext10 = findViewById(R.id.btnNext10);
        btnLast = findViewById(R.id.btnLast);
        seekBarProgress = findViewById(R.id.seekBarProgress);
        tvProgress = findViewById(R.id.tvProgress);
        tvDeviceInfo = findViewById(R.id.tvDeviceInfo);
        tvTrackStats = findViewById(R.id.tvTrackStats);
        tvStartTime = findViewById(R.id.tvStartTime);
        tvCurrentTime = findViewById(R.id.tvCurrentTime);
        tvEndTime = findViewById(R.id.tvEndTime);
        tvCurrentSpeed = findViewById(R.id.tvCurrentSpeed);
        tvTimeRange = findViewById(R.id.tvTimeRange);
        layoutTrackInfo = findViewById(R.id.layoutTrackInfo);
    }

    private void initMap(Bundle savedInstanceState) {
        mapView.onCreate(savedInstanceState);
        aMap = mapView.getMap();
        aMap.getUiSettings().setZoomControlsEnabled(true);
        aMap.getUiSettings().setScaleControlsEnabled(true);
    }

    private void initSpinners() {
        // 时间范围选择器
        ArrayAdapter<String> timeAdapter = new ArrayAdapter<>(this, 
                android.R.layout.simple_spinner_item, TIME_RANGE_LABELS);
        timeAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinnerTimeRange.setAdapter(timeAdapter);
        spinnerTimeRange.setSelection(2); // 默认24小时
        
        // 倍速选择器
        ArrayAdapter<String> speedAdapter = new ArrayAdapter<>(this, 
                android.R.layout.simple_spinner_item, SPEED_LABELS);
        speedAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinnerSpeed.setAdapter(speedAdapter);
        spinnerSpeed.setSelection(1); // 默认1x
    }

    private void initListeners() {
        btnBack.setOnClickListener(v -> finish());
        
        btnLoadTrack.setOnClickListener(v -> loadTrack());
        
        spinnerTimeRange.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override
            public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                timeRangeHours = TIME_RANGES[position];
                tvTimeRange.setText(TIME_RANGE_LABELS[position]);
            }
            
            @Override
            public void onNothingSelected(AdapterView<?> parent) {}
        });
        
        spinnerSpeed.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override
            public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                playSpeed = SPEEDS[position];
                updateCurrentSpeedDisplay();
            }
            
            @Override
            public void onNothingSelected(AdapterView<?> parent) {}
        });
        
        btnPlayPause.setOnClickListener(v -> togglePlay());
        
        btnFirst.setOnClickListener(v -> {
            stopPlay();
            setCurrentPointIndex(0);
        });
        
        btnPrev10.setOnClickListener(v -> {
            stopPlay();
            setCurrentPointIndex(Math.max(0, currentPointIndex - 10));
        });
        
        btnPrev.setOnClickListener(v -> {
            stopPlay();
            setCurrentPointIndex(Math.max(0, currentPointIndex - 1));
        });
        
        btnNext.setOnClickListener(v -> {
            stopPlay();
            setCurrentPointIndex(Math.min(trackPoints.size() - 1, currentPointIndex + 1));
        });
        
        btnNext10.setOnClickListener(v -> {
            stopPlay();
            setCurrentPointIndex(Math.min(trackPoints.size() - 1, currentPointIndex + 10));
        });
        
        btnLast.setOnClickListener(v -> {
            stopPlay();
            setCurrentPointIndex(trackPoints.size() - 1);
        });
        
        seekBarProgress.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override
            public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
                if (fromUser && !trackPoints.isEmpty()) {
                    setCurrentPointIndex(progress);
                }
            }
            
            @Override
            public void onStartTrackingTouch(SeekBar seekBar) {
                stopPlay();
            }
            
            @Override
            public void onStopTrackingTouch(SeekBar seekBar) {}
        });
    }

    private void loadDevices() {
        trackApi.getDevices().enqueue(new Callback<List<TrackDevice>>() {
            @Override
            public void onResponse(@NonNull Call<List<TrackDevice>> call, 
                                   @NonNull Response<List<TrackDevice>> response) {
                if (response.isSuccessful() && response.body() != null) {
                    deviceList = response.body();
                    if (deviceList == null) {
                        deviceList = new ArrayList<>();
                    }
                    updateDeviceSpinner();
                } else {
                    Toast.makeText(TrackPlaybackActivity.this, 
                            "加载设备列表失败", Toast.LENGTH_SHORT).show();
                }
            }
            
            @Override
            public void onFailure(@NonNull Call<List<TrackDevice>> call, @NonNull Throwable t) {
                Toast.makeText(TrackPlaybackActivity.this, 
                        "网络错误: " + t.getMessage(), Toast.LENGTH_SHORT).show();
            }
        });
    }

    private void updateDeviceSpinner() {
        List<String> deviceNames = new ArrayList<>();
        for (TrackDevice device : deviceList) {
            String name = device.getName() != null ? device.getName() : device.getDeviceId();
            String holder = device.getDisplayHolder();
            deviceNames.add(name + " (" + holder + ")");
        }
        
        ArrayAdapter<String> adapter = new ArrayAdapter<>(this, 
                android.R.layout.simple_spinner_item, deviceNames);
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinnerDevice.setAdapter(adapter);
    }

    private void loadTrack() {
        int position = spinnerDevice.getSelectedItemPosition();
        if (position < 0 || position >= deviceList.size()) {
            Toast.makeText(this, "请先选择设备", Toast.LENGTH_SHORT).show();
            return;
        }
        
        TrackDevice device = deviceList.get(position);
        String deviceId = device.getDeviceId();
        
        btnLoadTrack.setEnabled(false);
        btnLoadTrack.setText("加载中...");
        
        trackApi.getDeviceTrajectory(deviceId, timeRangeHours).enqueue(new Callback<TrackDevice>() {
            @Override
            public void onResponse(@NonNull Call<TrackDevice> call, 
                                   @NonNull Response<TrackDevice> response) {
                btnLoadTrack.setEnabled(true);
                btnLoadTrack.setText("加载轨迹");
                
                if (response.isSuccessful() && response.body() != null) {
                    TrackDevice deviceData = response.body();
                    if (deviceData.getTrajectory() != null && !deviceData.getTrajectory().isEmpty()) {
                        trackPoints = deviceData.getTrajectory();
                        displayTrack(deviceData);
                    } else {
                        Toast.makeText(TrackPlaybackActivity.this, 
                                "该时间段内无轨迹数据", Toast.LENGTH_SHORT).show();
                        clearTrack();
                    }
                } else {
                    Toast.makeText(TrackPlaybackActivity.this, 
                            "加载轨迹失败", Toast.LENGTH_SHORT).show();
                }
            }
            
            @Override
            public void onFailure(@NonNull Call<TrackDevice> call, @NonNull Throwable t) {
                btnLoadTrack.setEnabled(true);
                btnLoadTrack.setText("加载轨迹");
                Toast.makeText(TrackPlaybackActivity.this, 
                        "网络错误: " + t.getMessage(), Toast.LENGTH_SHORT).show();
            }
        });
    }

    private void displayTrack(TrackDevice device) {
        clearTrack();
        
        if (trackPoints.isEmpty()) return;
        
        // 显示轨迹信息
        layoutTrackInfo.setVisibility(View.VISIBLE);
        tvDeviceInfo.setText(device.getDisplayHolder() + " - " + 
                (device.getName() != null ? device.getName() : device.getDeviceId()));
        double duration = trackPoints.size() * 5.0 / 60.0;
        tvTrackStats.setText(String.format("轨迹点: %d个 | 时长: %.0f分钟 | 间隔: 5秒/点", 
                trackPoints.size(), duration));
        
        // 绘制轨迹线
        List<LatLng> path = new ArrayList<>();
        for (TrajectoryPoint point : trackPoints) {
            path.add(new LatLng(point.getLat(), point.getLng()));
        }
        
        PolylineOptions polylineOptions = new PolylineOptions()
                .addAll(path)
                .width(8)
                .color(Color.parseColor("#3b82f6"));
        trackPolyline = aMap.addPolyline(polylineOptions);
        
        // 起点标记
        TrajectoryPoint startPoint = trackPoints.get(0);
        startMarker = aMap.addMarker(new MarkerOptions()
                .position(new LatLng(startPoint.getLat(), startPoint.getLng()))
                .icon(createTextMarker("始", Color.parseColor("#22c55e")))
                .anchor(0.5f, 0.5f));
        
        // 终点标记
        TrajectoryPoint endPoint = trackPoints.get(trackPoints.size() - 1);
        endMarker = aMap.addMarker(new MarkerOptions()
                .position(new LatLng(endPoint.getLat(), endPoint.getLng()))
                .icon(createTextMarker("终", Color.parseColor("#ef4444")))
                .anchor(0.5f, 0.5f));
        
        // 调整地图视野
        LatLngBounds.Builder builder = LatLngBounds.builder();
        for (LatLng latLng : path) {
            builder.include(latLng);
        }
        aMap.animateCamera(CameraUpdateFactory.newLatLngBounds(builder.build(), 100));
        
        // 初始化进度条
        seekBarProgress.setMax(trackPoints.size() - 1);
        seekBarProgress.setProgress(0);
        currentPointIndex = 0;
        updateProgressDisplay();
        updateTimeDisplay();
        
        // 创建移动标记
        updateMovingMarker();
    }

    private void clearTrack() {
        if (trackPolyline != null) {
            trackPolyline.remove();
            trackPolyline = null;
        }
        if (startMarker != null) {
            startMarker.remove();
            startMarker = null;
        }
        if (endMarker != null) {
            endMarker.remove();
            endMarker = null;
        }
        if (movingMarker != null) {
            movingMarker.remove();
            movingMarker = null;
        }
        layoutTrackInfo.setVisibility(View.GONE);
        trackPoints.clear();
        currentPointIndex = 0;
        stopPlay();
    }

    private BitmapDescriptor createTextMarker(String text, int bgColor) {
        Paint paint = new Paint();
        paint.setColor(bgColor);
        paint.setStyle(Paint.Style.FILL);
        
        Paint textPaint = new Paint();
        textPaint.setColor(Color.WHITE);
        textPaint.setTextSize(24);
        textPaint.setTextAlign(Paint.Align.CENTER);
        textPaint.setFakeBoldText(true);
        
        int size = 44;
        Bitmap bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        canvas.drawCircle(size / 2f, size / 2f, size / 2f, paint);
        canvas.drawText(text, size / 2f, size / 2f + 8, textPaint);
        
        return BitmapDescriptorFactory.fromBitmap(bitmap);
    }

    private BitmapDescriptor createMovingMarkerIcon() {
        Paint paint = new Paint();
        paint.setColor(Color.parseColor("#3b82f6"));
        paint.setStyle(Paint.Style.FILL);
        
        int size = 64;
        Bitmap bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        canvas.drawCircle(size / 2f, size / 2f, size / 2f, paint);
        
        Paint borderPaint = new Paint();
        borderPaint.setColor(Color.WHITE);
        borderPaint.setStyle(Paint.Style.STROKE);
        borderPaint.setStrokeWidth(4);
        canvas.drawCircle(size / 2f, size / 2f, size / 2f - 2, borderPaint);
        
        return BitmapDescriptorFactory.fromBitmap(bitmap);
    }

    private void togglePlay() {
        if (trackPoints.isEmpty()) return;
        
        if (isPlaying) {
            stopPlay();
        } else {
            startPlay();
        }
    }

    private void startPlay() {
        if (currentPointIndex >= trackPoints.size() - 1) {
            currentPointIndex = 0;
        }
        
        isPlaying = true;
        btnPlayPause.setImageResource(R.drawable.ic_pause);
        
        playRunnable = new Runnable() {
            @Override
            public void run() {
                if (!isPlaying || currentPointIndex >= trackPoints.size() - 1) {
                    stopPlay();
                    return;
                }
                
                currentPointIndex++;
                setCurrentPointIndex(currentPointIndex);
                
                long delay = (long) (1000 / playSpeed);
                playHandler.postDelayed(this, delay);
            }
        };
        
        playHandler.post(playRunnable);
    }

    private void stopPlay() {
        isPlaying = false;
        btnPlayPause.setImageResource(R.drawable.ic_play);
        if (playRunnable != null) {
            playHandler.removeCallbacks(playRunnable);
        }
    }

    private void setCurrentPointIndex(int index) {
        if (index < 0 || index >= trackPoints.size()) return;
        
        currentPointIndex = index;
        seekBarProgress.setProgress(index);
        updateProgressDisplay();
        updateTimeDisplay();
        updateMovingMarker();
    }

    private void updateMovingMarker() {
        if (trackPoints.isEmpty() || currentPointIndex >= trackPoints.size()) return;
        
        TrajectoryPoint point = trackPoints.get(currentPointIndex);
        LatLng position = new LatLng(point.getLat(), point.getLng());
        
        if (movingMarker == null) {
            movingMarker = aMap.addMarker(new MarkerOptions()
                    .position(position)
                    .icon(createMovingMarkerIcon())
                    .anchor(0.5f, 0.5f));
        } else {
            movingMarker.setPosition(position);
        }
    }

    private void updateProgressDisplay() {
        tvProgress.setText(String.format("%d / %d", currentPointIndex + 1, trackPoints.size()));
    }

    private void updateTimeDisplay() {
        if (trackPoints.isEmpty()) return;
        
        SimpleDateFormat sdf = new SimpleDateFormat("HH:mm:ss", Locale.getDefault());
        
        TrajectoryPoint startPoint = trackPoints.get(0);
        TrajectoryPoint currentPoint = trackPoints.get(currentPointIndex);
        TrajectoryPoint endPoint = trackPoints.get(trackPoints.size() - 1);
        
        tvStartTime.setText(formatTime(startPoint.getTimestamp()));
        tvCurrentTime.setText(formatTime(currentPoint.getTimestamp()));
        tvEndTime.setText(formatTime(endPoint.getTimestamp()));
        
        if (currentPoint.getSpeed() != null) {
            tvCurrentSpeed.setText(String.format("速度: %.1f km/h", currentPoint.getSpeed()));
        } else {
            tvCurrentSpeed.setText("");
        }
    }

    private String formatTime(String timestamp) {
        if (timestamp == null) return "";
        try {
            SimpleDateFormat isoFormat = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault());
            Date date = isoFormat.parse(timestamp);
            SimpleDateFormat timeFormat = new SimpleDateFormat("HH:mm:ss", Locale.getDefault());
            return timeFormat.format(date);
        } catch (Exception e) {
            return timestamp;
        }
    }

    private void updateCurrentSpeedDisplay() {
        // 倍速显示已在spinner中
    }

    @Override
    protected void onResume() {
        super.onResume();
        mapView.onResume();
    }

    @Override
    protected void onPause() {
        super.onPause();
        mapView.onPause();
        stopPlay();
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        stopPlay();
        mapView.onDestroy();
    }

    @Override
    protected void onSaveInstanceState(@NonNull Bundle outState) {
        super.onSaveInstanceState(outState);
        mapView.onSaveInstanceState(outState);
    }
}
