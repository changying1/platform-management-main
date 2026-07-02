package com.app.myapplication.ui.track;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.app.DatePickerDialog;
import android.app.TimePickerDialog;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

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
import com.app.myapplication.data.api.ApiClient;
import com.app.myapplication.data.api.TrackApi;
import com.app.myapplication.data.model.TrajectoryPoint;
import com.app.myapplication.data.model.TrackDevice;
import com.app.myapplication.ui.playback.PlaybackCenterActivity;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import retrofit2.Call;
import retrofit2.Callback;
import retrofit2.Response;

public class TrackPlaybackFragment extends Fragment {

    private MapView mapView;
    private AMap aMap;
    private Spinner spinnerDevice;
    private Spinner spinnerSpeed;
    private Button btnLoadTrack;
    private Button btnStartTime;
    private Button btnEndTime;
    private Button btnSortOrder;
    private Button btnClearTimeFilter;
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
    private TextView tvTrackRecordStatus;
    private LinearLayout layoutTrackInfo;
    private View layoutTrackListContent;
    private View layoutPlaybackFullscreen;
    private View layoutPlaybackMap;
    private View layoutPlaybackControls;
    private ImageButton btnCloseFullscreen;
    private RecyclerView rvTrackRecords;
    private OnBackPressedCallback fullscreenBackCallback;

    private TrackApi trackApi;
    private List<TrackDevice> deviceList = new ArrayList<>();
    private List<TrajectoryPoint> trackPoints = new ArrayList<>();
    private List<TrackRecordItem> trackRecords = new ArrayList<>();
    private TrackRecordAdapter trackRecordAdapter;
    private boolean isLoadingTrackSummaries = false;
    private Calendar startFilter;
    private Calendar endFilter;
    private boolean sortAsc = false;

    private Polyline trackPolyline;
    private Marker startMarker;
    private Marker endMarker;
    private Marker movingMarker;

    private int currentPointIndex = 0;
    private boolean isPlaying = false;
    private double playSpeed = 1.0;
    private int timeRangeHours = 168;

    private Handler playHandler = new Handler(Looper.getMainLooper());
    private Runnable playRunnable;

    private static final double[] SPEEDS = {0.5, 1, 2, 4, 8, 16, 32};
    private static final String[] SPEED_LABELS = {"0.5x", "1x", "2x", "4x", "8x", "16x", "32x"};

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        View view = inflater.inflate(R.layout.fragment_track_playback, container, false);

        if (getContext() != null) {
            trackApi = ApiClient.get(getContext()).create(TrackApi.class);
        }

        initViews(view);
        initMap(view, savedInstanceState);
        initSpinners();
        initTrackRecordList();
        initListeners();
        initBackHandler();

        return view;
    }

    private void initViews(View view) {
        mapView = view.findViewById(R.id.mapView);
        spinnerDevice = view.findViewById(R.id.spinnerDevice);
        spinnerSpeed = view.findViewById(R.id.spinnerSpeed);
        btnLoadTrack = view.findViewById(R.id.btnLoadTrack);
        btnStartTime = view.findViewById(R.id.btnStartTime);
        btnEndTime = view.findViewById(R.id.btnEndTime);
        btnSortOrder = view.findViewById(R.id.btnSortOrder);
        btnClearTimeFilter = view.findViewById(R.id.btnClearTimeFilter);
        btnPlayPause = view.findViewById(R.id.btnPlayPause);
        btnFirst = view.findViewById(R.id.btnFirst);
        btnPrev = view.findViewById(R.id.btnPrev);
        btnPrev10 = view.findViewById(R.id.btnPrev10);
        btnNext = view.findViewById(R.id.btnNext);
        btnNext10 = view.findViewById(R.id.btnNext10);
        btnLast = view.findViewById(R.id.btnLast);
        seekBarProgress = view.findViewById(R.id.seekBarProgress);
        tvProgress = view.findViewById(R.id.tvProgress);
        tvDeviceInfo = view.findViewById(R.id.tvDeviceInfo);
        tvTrackStats = view.findViewById(R.id.tvTrackStats);
        tvStartTime = view.findViewById(R.id.tvStartTime);
        tvCurrentTime = view.findViewById(R.id.tvCurrentTime);
        tvEndTime = view.findViewById(R.id.tvEndTime);
        tvCurrentSpeed = view.findViewById(R.id.tvCurrentSpeed);
        tvTrackRecordStatus = view.findViewById(R.id.tvTrackRecordStatus);
        layoutTrackInfo = view.findViewById(R.id.layoutTrackInfo);
        layoutTrackListContent = view.findViewById(R.id.layoutTrackListContent);
        layoutPlaybackFullscreen = view.findViewById(R.id.layoutPlaybackFullscreen);
        layoutPlaybackMap = view.findViewById(R.id.layoutPlaybackMap);
        layoutPlaybackControls = view.findViewById(R.id.layoutPlaybackControls);
        btnCloseFullscreen = view.findViewById(R.id.btnCloseFullscreen);
        rvTrackRecords = view.findViewById(R.id.rvTrackRecords);
        setPlaybackAreaVisible(false);
    }

    private void initMap(View view, Bundle savedInstanceState) {
        mapView.onCreate(savedInstanceState);
        aMap = mapView.getMap();
        aMap.getUiSettings().setZoomControlsEnabled(true);
        aMap.getUiSettings().setScaleControlsEnabled(true);
    }

    private void initSpinners() {
        if (getContext() == null) return;

        ArrayAdapter<String> speedAdapter = new ArrayAdapter<>(getContext(),
                android.R.layout.simple_spinner_item, SPEED_LABELS);
        speedAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinnerSpeed.setAdapter(speedAdapter);
        spinnerSpeed.setSelection(1);
    }

    private void initTrackRecordList() {
        if (getContext() == null) return;
        trackRecordAdapter = new TrackRecordAdapter(trackRecords, this::loadTrackRecordPoints);
        rvTrackRecords.setLayoutManager(new LinearLayoutManager(getContext()));
        rvTrackRecords.setAdapter(trackRecordAdapter);
    }

    private void initListeners() {
        btnLoadTrack.setOnClickListener(v -> loadTrackSummaries());
        btnStartTime.setOnClickListener(v -> pickDateTime(startFilter, selected -> {
            startFilter = selected;
            updateTimeFilterButtons();
            loadTrackSummaries();
        }));
        btnEndTime.setOnClickListener(v -> pickDateTime(endFilter, selected -> {
            endFilter = selected;
            updateTimeFilterButtons();
            loadTrackSummaries();
        }));
        btnSortOrder.setOnClickListener(v -> {
            sortAsc = !sortAsc;
            updateTimeFilterButtons();
            applyTrackRecordSort();
        });
        btnClearTimeFilter.setOnClickListener(v -> {
            startFilter = null;
            endFilter = null;
            updateTimeFilterButtons();
            loadTrackSummaries();
        });
        btnCloseFullscreen.setOnClickListener(v -> exitPlaybackFullscreen());
        updateTimeFilterButtons();
        loadTrackSummaries();

        spinnerSpeed.setOnItemSelectedListener(new android.widget.AdapterView.OnItemSelectedListener() {
            @Override
            public void onItemSelected(android.widget.AdapterView<?> parent, View view, int position, long id) {
                playSpeed = SPEEDS[position];
            }

            @Override
            public void onNothingSelected(android.widget.AdapterView<?> parent) {}
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

    private void initBackHandler() {
        fullscreenBackCallback = new OnBackPressedCallback(false) {
            @Override
            public void handleOnBackPressed() {
                exitPlaybackFullscreen();
            }
        };
        requireActivity().getOnBackPressedDispatcher().addCallback(getViewLifecycleOwner(), fullscreenBackCallback);
    }

    private void loadDevices() {
        if (trackApi == null) return;

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
                    showToast("加载设备列表失败");
                }
            }

            @Override
            public void onFailure(@NonNull Call<List<TrackDevice>> call, @NonNull Throwable t) {
                showToast("网络错误: " + t.getMessage());
            }
        });
    }

    private void updateDeviceSpinner() {
        if (getContext() == null) return;

        List<String> deviceNames = new ArrayList<>();
        for (TrackDevice device : deviceList) {
            String name = device.getName() != null ? device.getName() : device.getDeviceId();
            String holder = device.getDisplayHolder();
            deviceNames.add(name + " (" + holder + ")");
        }

        ArrayAdapter<String> adapter = new ArrayAdapter<>(getContext(),
                android.R.layout.simple_spinner_item, deviceNames);
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinnerDevice.setAdapter(adapter);
    }

    private void loadTrack() {
        int position = spinnerDevice.getSelectedItemPosition();
        if (position < 0 || position >= deviceList.size()) {
            showToast("请先选择设备");
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

                android.util.Log.d("TrackPlayback", "Response code: " + response.code());
                android.util.Log.d("TrackPlayback", "Response successful: " + response.isSuccessful());

                if (response.isSuccessful() && response.body() != null) {
                    TrackDevice deviceData = response.body();
                    android.util.Log.d("TrackPlayback", "Device data received, deviceId: " + deviceData.getDeviceId());

                    List<TrajectoryPoint> trajectory = deviceData.getTrajectory();
                    android.util.Log.d("TrackPlayback", "Trajectory from deviceData: " + (trajectory == null ? "null" : "size=" + trajectory.size()));

                    if (trajectory != null && !trajectory.isEmpty()) {
                        trackPoints.clear();
                        trackPoints.addAll(trajectory);
                        android.util.Log.d("TrackPlayback", "trackPoints set, size: " + trackPoints.size());
                        displayTrack(deviceData);
                    } else {
                        showToast("该时间段内无轨迹数据");
                        clearTrack();
                    }
                } else {
                    showToast("加载轨迹失败");
                    android.util.Log.e("TrackPlayback", "Response failed or body is null");
                }
            }

            @Override
            public void onFailure(@NonNull Call<TrackDevice> call, @NonNull Throwable t) {
                btnLoadTrack.setEnabled(true);
                btnLoadTrack.setText("加载轨迹");
                showToast("网络错误: " + t.getMessage());
            }
        });
    }

    private void displayTrack(TrackDevice device) {
        if (trackPoints.isEmpty()) {
            android.util.Log.d("TrackPlayback", "trackPoints is empty");
            return;
        }

        if (aMap == null) {
            android.util.Log.e("TrackPlayback", "aMap is null");
            return;
        }

        // 先清除地图上的覆盖物，但不清空trackPoints
        clearMapOverlays();

        android.util.Log.d("TrackPlayback", "Displaying track with " + trackPoints.size() + " points");

        setPlaybackAreaVisible(true);
        layoutTrackInfo.setVisibility(View.VISIBLE);
        tvDeviceInfo.setText(device.getDisplayHolder() + " - " +
                (device.getName() != null ? device.getName() : device.getDeviceId()));
        double duration = trackPoints.size() * 5.0 / 60.0;
        tvTrackStats.setText(String.format("轨迹点: %d个 | 时长: %.0f分钟 | 间隔: 5秒/点",
                trackPoints.size(), duration));

        List<LatLng> path = new ArrayList<>();
        for (TrajectoryPoint point : trackPoints) {
            path.add(new LatLng(point.getLat(), point.getLng()));
            android.util.Log.d("TrackPlayback", "Point: lat=" + point.getLat() + ", lng=" + point.getLng());
        }

        // 绘制轨迹线
        PolylineOptions polylineOptions = new PolylineOptions()
                .addAll(path)
                .width(8)
                .color(Color.parseColor("#3b82f6"));
        trackPolyline = aMap.addPolyline(polylineOptions);
        android.util.Log.d("TrackPlayback", "Polyline added");

        // 起点标记
        TrajectoryPoint startPoint = trackPoints.get(0);
        startMarker = aMap.addMarker(new MarkerOptions()
                .position(new LatLng(startPoint.getLat(), startPoint.getLng()))
                .icon(createTextMarker("始", Color.parseColor("#22c55e")))
                .anchor(0.5f, 0.5f));
        android.util.Log.d("TrackPlayback", "Start marker added");

        // 终点标记
        TrajectoryPoint endPoint = trackPoints.get(trackPoints.size() - 1);
        endMarker = aMap.addMarker(new MarkerOptions()
                .position(new LatLng(endPoint.getLat(), endPoint.getLng()))
                .icon(createTextMarker("终", Color.parseColor("#ef4444")))
                .anchor(0.5f, 0.5f));
        android.util.Log.d("TrackPlayback", "End marker added");

        // 调整地图视野
        if (path.size() > 0) {
            try {
                LatLngBounds.Builder builder = LatLngBounds.builder();
                for (LatLng latLng : path) {
                    builder.include(latLng);
                }
                aMap.animateCamera(CameraUpdateFactory.newLatLngBounds(builder.build(), 100));
                android.util.Log.d("TrackPlayback", "Camera animated");
            } catch (Exception e) {
                android.util.Log.e("TrackPlayback", "Error animating camera: " + e.getMessage());
                // 如果视野调整失败，至少移动到一个点
                aMap.moveCamera(CameraUpdateFactory.newLatLngZoom(path.get(0), 15));
            }
        }

        seekBarProgress.setMax(trackPoints.size() - 1);
        seekBarProgress.setProgress(0);
        currentPointIndex = 0;
        updateProgressDisplay();
        updateTimeDisplay();
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
        setPlaybackAreaVisible(false);
    }

    private void clearMapOverlays() {
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
        currentPointIndex = 0;
        stopPlay();
    }

    private void setPlaybackAreaVisible(boolean visible) {
        int visibility = visible ? View.VISIBLE : View.GONE;
        if (layoutTrackListContent != null) {
            layoutTrackListContent.setVisibility(visible ? View.GONE : View.VISIBLE);
        }
        if (layoutPlaybackFullscreen != null) {
            layoutPlaybackFullscreen.setVisibility(visibility);
        }
        if (layoutPlaybackMap != null) {
            layoutPlaybackMap.setVisibility(visibility);
        }
        if (layoutPlaybackControls != null) {
            layoutPlaybackControls.setVisibility(visibility);
        }
        if (fullscreenBackCallback != null) {
            fullscreenBackCallback.setEnabled(visible);
        }
        if (getActivity() instanceof PlaybackCenterActivity) {
            ((PlaybackCenterActivity) getActivity()).setHeaderVisible(!visible);
        }
        if (visible && mapView != null) {
            mapView.post(() -> {
                if (aMap != null) {
                    aMap.getUiSettings().setZoomControlsEnabled(true);
                    aMap.getUiSettings().setScaleControlsEnabled(true);
                }
            });
        }
    }

    private void exitPlaybackFullscreen() {
        stopPlay();
        setPlaybackAreaVisible(false);
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

    private void showToast(String message) {
        if (getContext() != null) {
            Toast.makeText(getContext(), message, Toast.LENGTH_SHORT).show();
        }
    }

    private void loadTrackSummaries() {
        if (trackApi == null) return;
        if (isLoadingTrackSummaries) return;

        isLoadingTrackSummaries = true;
        btnLoadTrack.setEnabled(false);
        btnLoadTrack.setText("刷新中...");
        tvTrackRecordStatus.setText("正在加载轨迹记录...");

        trackApi.getTrajectorySummaries(timeRangeHours, toQueryTime(startFilter), toQueryTime(endFilter)).enqueue(new Callback<List<Map<String, Object>>>() {
            @Override
            public void onResponse(@NonNull Call<List<Map<String, Object>>> call,
                                   @NonNull Response<List<Map<String, Object>>> response) {
                btnLoadTrack.setEnabled(true);
                btnLoadTrack.setText("刷新列表");
                isLoadingTrackSummaries = false;

                if (response.isSuccessful() && response.body() != null) {
                    trackRecords.clear();
                    for (Map<String, Object> row : response.body()) {
                        TrackRecordItem item = TrackRecordItem.from(row);
                        if (item.deviceId != null && !item.deviceId.isEmpty()) {
                            trackRecords.add(item);
                        }
                    }
                    applyTrackRecordSort();
                    if (trackRecordAdapter != null) {
                        trackRecordAdapter.notifyDataSetChanged();
                    }
                    tvTrackRecordStatus.setText(trackRecords.isEmpty()
                            ? "暂无轨迹记录"
                            : "轨迹记录 " + trackRecords.size() + " 条（与网页端同接口/同权限）");
                } else {
                    tvTrackRecordStatus.setText("加载轨迹记录失败");
                    showToast("加载轨迹记录失败");
                }
            }

            @Override
            public void onFailure(@NonNull Call<List<Map<String, Object>>> call,
                                  @NonNull Throwable t) {
                btnLoadTrack.setEnabled(true);
                btnLoadTrack.setText("刷新列表");
                isLoadingTrackSummaries = false;
                tvTrackRecordStatus.setText("网络错误: " + t.getMessage());
                showToast("网络错误: " + t.getMessage());
            }
        });
    }

    private void loadTrackRecordPoints(TrackRecordItem item) {
        if (trackApi == null || item == null || item.deviceId == null || item.deviceId.isEmpty()) {
            showToast("轨迹记录缺少设备ID");
            return;
        }

        stopPlay();
        tvTrackRecordStatus.setText("正在加载：" + item.getTitle());

        trackApi.getTrajectoryPoints(
                item.deviceId,
                timeRangeHours,
                firstNonEmpty(toQueryTime(startFilter), item.startTime),
                firstNonEmpty(toQueryTime(endFilter), item.endTime)
        )
                .enqueue(new Callback<Map<String, Object>>() {
                    @Override
                    public void onResponse(@NonNull Call<Map<String, Object>> call,
                                           @NonNull Response<Map<String, Object>> response) {
                        if (response.isSuccessful() && response.body() != null) {
                            List<TrajectoryPoint> points = extractTrajectoryPoints(response.body().get("points"));
                            if (!points.isEmpty()) {
                                trackPoints.clear();
                                trackPoints.addAll(points);
                                displayTrack(item.toTrackDevice());
                                tvTrackRecordStatus.setText("正在回放：" + item.getTitle());
                            } else {
                                clearTrack();
                                tvTrackRecordStatus.setText("该轨迹记录暂无点位");
                                showToast("该轨迹记录暂无点位");
                            }
                        } else {
                            tvTrackRecordStatus.setText("加载轨迹点失败");
                            showToast("加载轨迹点失败");
                        }
                    }

                    @Override
                    public void onFailure(@NonNull Call<Map<String, Object>> call,
                                          @NonNull Throwable t) {
                        tvTrackRecordStatus.setText("网络错误: " + t.getMessage());
                        showToast("网络错误: " + t.getMessage());
                    }
                });
    }

    private List<TrajectoryPoint> extractTrajectoryPoints(Object raw) {
        List<TrajectoryPoint> points = new ArrayList<>();
        if (!(raw instanceof List<?>)) {
            return points;
        }
        for (Object entry : (List<?>) raw) {
            if (!(entry instanceof Map<?, ?>)) continue;
            Map<?, ?> map = (Map<?, ?>) entry;
            Double lat = asDouble(map.get("lat"));
            Double lng = asDouble(map.get("lng"));
            if (lat == null || lng == null) continue;
            String timestamp = asString(firstNonNull(map.get("timestamp"), map.get("time")));
            Double speed = asDouble(map.get("speed"));
            Double direction = asDouble(map.get("direction"));
            points.add(new TrajectoryPoint(lat, lng, timestamp, speed, direction));
        }
        return points;
    }

    private static Object firstNonNull(Object first, Object second) {
        return first != null ? first : second;
    }

    private void applyTrackRecordSort() {
        Collections.sort(trackRecords, (a, b) -> {
            long left = parseMillis(a.startTime);
            long right = parseMillis(b.startTime);
            return sortAsc ? Long.compare(left, right) : Long.compare(right, left);
        });
        if (trackRecordAdapter != null) {
            trackRecordAdapter.notifyDataSetChanged();
        }
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

    private static String toQueryTime(Calendar value) {
        if (value == null) return null;
        return new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault()).format(value.getTime());
    }

    private static String formatFilterButtonTime(Calendar value) {
        return new SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault()).format(value.getTime());
    }

    private static String firstNonEmpty(String first, String second) {
        return first != null && !first.trim().isEmpty() ? first : second;
    }

    private static long parseMillis(String raw) {
        if (raw == null || raw.trim().isEmpty()) return 0;
        String normalized = raw.trim().replace("Z", "").replace("+00:00", "");
        String[] patterns = {
                "yyyy-MM-dd'T'HH:mm:ss.SSSSSS",
                "yyyy-MM-dd'T'HH:mm:ss",
                "yyyy-MM-dd HH:mm:ss"
        };
        for (String pattern : patterns) {
            try {
                Date date = new SimpleDateFormat(pattern, Locale.getDefault()).parse(normalized);
                if (date != null) return date.getTime();
            } catch (Exception ignored) {}
        }
        return 0;
    }

    private interface DateTimeCallback {
        void onPicked(Calendar calendar);
    }

    private static String asString(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private static Double asDouble(Object value) {
        if (value instanceof Number) {
            return ((Number) value).doubleValue();
        }
        if (value == null) {
            return null;
        }
        try {
            return Double.parseDouble(String.valueOf(value));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static class TrackRecordItem {
        String deviceId;
        String deviceName;
        String holder;
        String project;
        String team;
        String company;
        String startTime;
        String endTime;
        String startCoordinate;
        int pointCount;

        static TrackRecordItem from(Map<String, Object> row) {
            TrackRecordItem item = new TrackRecordItem();
            item.deviceId = asString(row.get("device_id"));
            item.deviceName = pickText(row, "name", "device_name", "deviceId");
            item.holder = pickText(row, "holder", "person_name", "personName");
            item.project = pickText(row, "project", "project_name");
            item.team = pickText(row, "team", "team_name", "grid", "grid_name");
            item.company = pickText(row, "company", "branch_name");
            item.startTime = pickText(row, "start_time", "startTime");
            item.endTime = pickText(row, "end_time", "endTime");
            Object coordinate = firstNonNull(row.get("start_coordinate"), row.get("startCoordinate"));
            if (coordinate == null) {
                Double lat = asDouble(firstNonNull(row.get("start_lat"), row.get("lat")));
                Double lng = asDouble(firstNonNull(row.get("start_lng"), row.get("lng")));
                item.startCoordinate = lat != null && lng != null
                        ? String.format(Locale.getDefault(), "%.5f, %.5f", lat, lng)
                        : "-";
            } else {
                item.startCoordinate = asString(coordinate);
            }
            Double count = asDouble(firstNonNull(row.get("point_count"), row.get("count")));
            item.pointCount = count == null ? 0 : count.intValue();
            return item;
        }

        TrackDevice toTrackDevice() {
            TrackDevice device = new TrackDevice();
            device.setDeviceId(deviceId);
            device.setName(deviceName);
            device.setHolder(holder);
            device.setCompany(company);
            device.setProject(project);
            device.setTeam(team);
            device.setTrajectory(new ArrayList<>());
            return device;
        }

        String getTitle() {
            if (holder != null && !holder.isEmpty() && !"null".equals(holder)) {
                return holder;
            }
            if (deviceName != null && !deviceName.isEmpty() && !"null".equals(deviceName)) {
                return deviceName;
            }
            return deviceId;
        }

        String getDeviceLine() {
            return (deviceName == null || deviceName.isEmpty() ? deviceId : deviceName)
                    + " / " + deviceId
                    + (pointCount > 0 ? " / " + pointCount + "个轨迹点" : "");
        }

        String getMetaLine() {
            List<String> parts = new ArrayList<>();
            if (startCoordinate != null && !startCoordinate.isEmpty() && !"-".equals(startCoordinate)) {
                parts.add("起点 " + startCoordinate);
            }
            if (project != null && !project.isEmpty() && !"null".equals(project)) {
                parts.add(project);
            }
            if (team != null && !team.isEmpty() && !"null".equals(team)) {
                parts.add(team);
            }
            if (startTime != null && !startTime.isEmpty() && !"null".equals(startTime)) {
                parts.add(startTime + (endTime != null && !endTime.isEmpty() && !"null".equals(endTime) ? " 至 " + endTime : ""));
            }
            return parts.isEmpty() ? "暂无轨迹描述" : android.text.TextUtils.join(" · ", parts);
        }

        private static String pickText(Map<String, Object> row, String... keys) {
            for (String key : keys) {
                Object value = row.get(key);
                if (value != null) {
                    String text = String.valueOf(value);
                    if (!text.isEmpty() && !"null".equals(text)) return text;
                }
            }
            return "";
        }
    }

    private static class TrackRecordAdapter extends RecyclerView.Adapter<TrackRecordAdapter.ViewHolder> {
        interface OnTrackClickListener {
            void onClick(TrackRecordItem item);
        }

        private final List<TrackRecordItem> data;
        private final OnTrackClickListener listener;

        TrackRecordAdapter(List<TrackRecordItem> data, OnTrackClickListener listener) {
            this.data = data;
            this.listener = listener;
        }

        @NonNull
        @Override
        public ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
            View view = LayoutInflater.from(parent.getContext())
                    .inflate(R.layout.item_track_record, parent, false);
            return new ViewHolder(view);
        }

        @Override
        public void onBindViewHolder(@NonNull ViewHolder holder, int position) {
            TrackRecordItem item = data.get(position);
            holder.tvTitle.setText(item.getTitle());
            holder.tvDevice.setText(item.getDeviceLine());
            holder.tvMeta.setText(item.getMetaLine());
            holder.itemView.setOnClickListener(v -> listener.onClick(item));
            holder.tvAction.setOnClickListener(v -> listener.onClick(item));
        }

        @Override
        public int getItemCount() {
            return data.size();
        }

        static class ViewHolder extends RecyclerView.ViewHolder {
            TextView tvTitle;
            TextView tvDevice;
            TextView tvMeta;
            TextView tvAction;

            ViewHolder(@NonNull View itemView) {
                super(itemView);
                tvTitle = itemView.findViewById(R.id.tvTrackTitle);
                tvDevice = itemView.findViewById(R.id.tvTrackDevice);
                tvMeta = itemView.findViewById(R.id.tvTrackMeta);
                tvAction = itemView.findViewById(R.id.tvTrackAction);
            }
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        if (mapView != null) mapView.onResume();
    }

    @Override
    public void onPause() {
        super.onPause();
        if (mapView != null) mapView.onPause();
        stopPlay();
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        stopPlay();
        if (getActivity() instanceof PlaybackCenterActivity) {
            ((PlaybackCenterActivity) getActivity()).setHeaderVisible(true);
        }
        if (mapView != null) mapView.onDestroy();
    }

    @Override
    public void onSaveInstanceState(@NonNull Bundle outState) {
        super.onSaveInstanceState(outState);
        if (mapView != null) mapView.onSaveInstanceState(outState);
    }
}
