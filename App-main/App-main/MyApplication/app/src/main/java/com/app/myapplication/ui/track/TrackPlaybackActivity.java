package com.app.myapplication.ui.track;
import android.app.DatePickerDialog;
import android.os.Bundle;
import android.text.TextUtils;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ImageButton;
import android.widget.SeekBar;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;
import org.osmdroid.config.Configuration;
import androidx.appcompat.app.AppCompatActivity;
import androidx.lifecycle.ViewModelProvider;

import com.app.myapplication.R;
import com.app.myapplication.data.model.TrackPoint;

import org.osmdroid.tileprovider.tilesource.TileSourceFactory;
import org.osmdroid.util.GeoPoint;
import org.osmdroid.views.CustomZoomButtonsController;
import org.osmdroid.views.MapView;
import org.osmdroid.views.overlay.Marker;
import org.osmdroid.views.overlay.Polyline;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.List;
import java.util.Locale;

public class TrackPlaybackActivity extends AppCompatActivity {

    private TrackPlaybackViewModel vm;

    private EditText etKeyword;
    private TextView tvStartDate, tvEndDate, tvTimeStart, tvTimeEnd;
    private Button btnSearch;
    private ImageButton btnRestart, btnPlayPause;
    private SeekBar seekProgress;
    private Spinner spSpeed;

    private MapView mapView;
    private Polyline polyline;
    private Marker startMarker, endMarker, movingMarker;

    private boolean userDragging = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Configuration.getInstance().load(
                getApplicationContext(),
                getSharedPreferences("osmdroid", MODE_PRIVATE)
        );
        Configuration.getInstance().setUserAgentValue(getPackageName());

        setContentView(R.layout.activity_track_playback);
        vm = new ViewModelProvider(this).get(TrackPlaybackViewModel.class);

        bindViews();
        initMap();
        initSpeedSpinner();
        initDatePickers();
        initEvents();
        observeState();

        String today = new SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(System.currentTimeMillis());
        tvStartDate.setText(today);
        tvEndDate.setText(today);
    }

    private void bindViews() {
        tvStartDate = findViewById(R.id.tvStartDate);
        tvEndDate = findViewById(R.id.tvEndDate);
        tvTimeStart = findViewById(R.id.tvTimeStart);
        tvTimeEnd = findViewById(R.id.tvTimeEnd);

        btnSearch = findViewById(R.id.btnSearch);

        seekProgress = findViewById(R.id.seekProgress);
        btnRestart = findViewById(R.id.btnRestart);
        btnPlayPause = findViewById(R.id.btnPlayPause);
        etKeyword = findViewById(R.id.etKeyword);
        spSpeed = findViewById(R.id.spSpeed);
    }

    private void initMap() {
        mapView = findViewById(R.id.mapView);

        mapView.setTileSource(TileSourceFactory.MAPNIK);
        mapView.setUseDataConnection(true);
        mapView.setMultiTouchControls(true);

        mapView.setBuiltInZoomControls(true);
        mapView.getZoomController().setVisibility(CustomZoomButtonsController.Visibility.SHOW_AND_FADEOUT);

        mapView.getController().setZoom(15.0);
        mapView.getController().setCenter(new GeoPoint(31.2304, 121.4737));

        polyline = new Polyline();
        polyline.getOutlinePaint().setStrokeWidth(8f);
        polyline.getOutlinePaint().setColor(0xFF2563EB);
        mapView.getOverlays().add(polyline);

        startMarker = new Marker(mapView);
        endMarker = new Marker(mapView);
        movingMarker = new Marker(mapView);
        movingMarker.setTitle("当前位置");

        mapView.getOverlays().add(startMarker);
        mapView.getOverlays().add(endMarker);
        mapView.getOverlays().add(movingMarker);
    }

    private void initSpeedSpinner() {
        ArrayAdapter<SpeedOption> ad =
                new ArrayAdapter<>(this, R.layout.item_speed_spinner, SpeedOption.values());
        ad.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spSpeed.setAdapter(ad);
        spSpeed.setSelection(0);
    }

    private void initDatePickers() {
        tvStartDate.setOnClickListener(v -> pickDate(tvStartDate));
        tvEndDate.setOnClickListener(v -> pickDate(tvEndDate));
    }

    private void pickDate(TextView tv) {
        Calendar c = Calendar.getInstance();
        DatePickerDialog dlg = new DatePickerDialog(this, (view, year, month, dayOfMonth) -> {
            Calendar cc = Calendar.getInstance();
            cc.set(year, month, dayOfMonth);
            String val = new SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(cc.getTime());
            tv.setText(val);
        }, c.get(Calendar.YEAR), c.get(Calendar.MONTH), c.get(Calendar.DAY_OF_MONTH));
        dlg.show();
    }

    private void initEvents() {
        btnSearch.setOnClickListener(v -> {
            String kw = etKeyword.getText().toString().trim();
            vm.search(kw, tvStartDate.getText().toString(), tvEndDate.getText().toString());
        });

        btnPlayPause.setOnClickListener(v -> vm.togglePlay());
        btnRestart.setOnClickListener(v -> vm.stop());

        seekProgress.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar seekBar, int progress, boolean fromUser) {
                if (fromUser) vm.setProgress(progress);
            }
            @Override public void onStartTrackingTouch(SeekBar seekBar) { userDragging = true; }
            @Override public void onStopTrackingTouch(SeekBar seekBar) { userDragging = false; }
        });

        spSpeed.setOnItemSelectedListener(new android.widget.AdapterView.OnItemSelectedListener() {
            @Override public void onItemSelected(android.widget.AdapterView<?> parent, android.view.View view, int position, long id) {
                SpeedOption sp = (SpeedOption) parent.getItemAtPosition(position);
                vm.setSpeed(sp);
            }
            @Override public void onNothingSelected(android.widget.AdapterView<?> parent) {}
        });
    }

    private void observeState() {
        vm.state.observe(this, s -> {
            if (s == null) return;

            if (!TextUtils.isEmpty(s.error)) {
                Toast.makeText(this, s.error, Toast.LENGTH_SHORT).show();
            }

            btnPlayPause.setImageResource(
                    s.isPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play
            );
            if (!userDragging) seekProgress.setProgress(s.progress);

            renderTrack(s.points, s.progress);

            mapView.invalidate();
        });
    }

    private void renderTrack(List<TrackPoint> points, int progress0to1000) {
        if (points == null || points.size() < 2) return;

        java.util.ArrayList<GeoPoint> geo = new java.util.ArrayList<>();
        for (TrackPoint p : points) {
            geo.add(new GeoPoint(p.lat, p.lng));
        }

        polyline.setPoints(geo);

        startMarker.setPosition(geo.get(0));
        endMarker.setPosition(geo.get(geo.size() - 1));

        int idx = (int) (points.size() * (progress0to1000 / 1000.0));
        idx = Math.max(0, Math.min(idx, points.size() - 1));
        movingMarker.setPosition(geo.get(idx));
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
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        mapView.onDetach();
    }
}
