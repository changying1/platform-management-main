package com.app.myapplication.ui.device;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.view.View;
import android.widget.TextView;

import com.amap.api.maps.AMap;
import com.amap.api.maps.model.BitmapDescriptorFactory;
import com.amap.api.maps.model.LatLng;
import com.amap.api.maps.model.Marker;
import com.amap.api.maps.model.MarkerOptions;
import com.app.myapplication.data.model.DeviceItem;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 设备地图渲染器
 * 负责在地图上绘制设备标记
 */
public class DeviceMapRenderer {

    // 颜色定义（参考 Web 端）
    private static final int COLOR_ONLINE = 0xFF22C55E;      // 绿色 - 在线
    private static final int COLOR_OFFLINE = 0xFF64748B;     // 灰色 - 离线
    private static final int COLOR_VIOLATION = 0xFFEF4444;   // 红色 - 违规
    private static final int COLOR_CONTROLLED = 0xFF3B82F6;  // 蓝色 - 受控
    private static final int COLOR_DEBUG = 0xFFFF9800;       // 橙色 - 调试模式

    private final AMap aMap;
    private final Context context;
    private final Map<String, Marker> deviceMarkers = new HashMap<>();

    // 调试模式相关
    private boolean debugMode = false;
    private OnDevicePositionChangeListener positionChangeListener;

    public DeviceMapRenderer(Context context, AMap aMap) {
        this.context = context;
        this.aMap = aMap;
        // 初始化拖动监听器
        initDragListener();
    }

    /**
     * 初始化拖动监听器（需要在aMap.clear()后重新设置）
     */
    private void initDragListener() {
        if (aMap == null) return;
        android.util.Log.d("DeviceMapRenderer", "初始化拖动监听器");
        aMap.setOnMarkerDragListener(new AMap.OnMarkerDragListener() {
            @Override
            public void onMarkerDragStart(Marker marker) {
                android.util.Log.d("DeviceMapRenderer", "开始拖动标记");
            }

            @Override
            public void onMarkerDrag(Marker marker) {
                // 拖动中
            }

            @Override
            public void onMarkerDragEnd(Marker marker) {
                android.util.Log.d("DeviceMapRenderer", "拖动结束标记, debugMode=" + debugMode);
                // 拖动结束
                if (!debugMode) {
                    android.util.Log.d("DeviceMapRenderer", "非调试模式，不处理拖动");
                    return;  // 只在调试模式下处理
                }
                String deviceId = (String) marker.getObject();
                android.util.Log.d("DeviceMapRenderer", "拖动结束, deviceId=" + deviceId + ", listener=" + (positionChangeListener != null));
                if (deviceId != null && positionChangeListener != null) {
                    LatLng pos = marker.getPosition();
                    android.util.Log.d("DeviceMapRenderer", "调用位置变化监听器: " + deviceId + " -> (" + pos.latitude + ", " + pos.longitude + ")");
                    positionChangeListener.onDevicePositionChanged(deviceId, pos.latitude, pos.longitude);
                }
            }
        });
    }

    /**
     * 设置调试模式
     */
    public void setDebugMode(boolean debugMode) {
        android.util.Log.d("DeviceMapRenderer", "设置调试模式: " + debugMode);
        this.debugMode = debugMode;
        // 更新所有现有标记的可拖动状态
        for (Marker marker : deviceMarkers.values()) {
            marker.setDraggable(debugMode);
            android.util.Log.d("DeviceMapRenderer", "更新标记可拖动状态: " + marker.getObject() + " -> " + debugMode);
        }
    }

    /**
     * 设置设备位置变化监听器
     */
    public void setOnDevicePositionChangeListener(OnDevicePositionChangeListener listener) {
        this.positionChangeListener = listener;
    }

    /**
     * 设备位置变化监听器接口
     */
    public interface OnDevicePositionChangeListener {
        void onDevicePositionChanged(String deviceId, double lat, double lng);
    }

    /**
     * 渲染设备列表到地图
     * 注意：此方法需要在 aMap.clear() 之后调用，因为 clear 会清除所有覆盖物
     */
    public void renderDevices(List<DeviceItem> devices, Map<String, String> violationTypes) {
        if (aMap == null || devices == null) return;

        android.util.Log.d("DeviceMapRenderer", "renderDevices 被调用, debugMode=" + debugMode + ", 设备数量=" + devices.size());

        // 由于 aMap.clear() 会清除所有标记，我们需要清空本地引用
        deviceMarkers.clear();

        // 创建设备标记
        for (DeviceItem device : devices) {
            if (device.deviceId == null || !device.hasLocation()) continue;

            String violationType = violationTypes != null ? violationTypes.get(device.deviceId) : null;
            createMarker(device, violationType);
        }

        // aMap.clear() 会清除监听器，需要重新设置
        initDragListener();
    }

    /**
     * 创建设备标记（每次 redrawAll 后重新创建）
     */
    private void createMarker(DeviceItem device, String violationType) {
        LatLng position = new LatLng(device.lat, device.lng);

        // 确定标记颜色
        int color = getDeviceColor(device, violationType);
        // 调试模式下使用橙色
        if (debugMode) {
            color = COLOR_DEBUG;
        }

        // 创建新标记
        MarkerOptions options = new MarkerOptions()
                .position(position)
                .icon(BitmapDescriptorFactory.fromBitmap(createDeviceBitmap(color, violationType != null)))
                .anchor(0.5f, 1.0f)  // 底部中心
                .title(device.name)
                .snippet(createSnippet(device, violationType));

        Marker marker = aMap.addMarker(options);
        marker.setObject(device.deviceId);  // 存储设备ID用于拖动识别
        marker.setDraggable(debugMode);  // 调试模式下可拖动（必须在addMarker后设置）
        android.util.Log.d("DeviceMapRenderer", "创建标记: " + device.deviceId + ", draggable=" + debugMode);
        deviceMarkers.put(device.deviceId, marker);
    }

    /**
     * 获取设备颜色
     */
    private int getDeviceColor(DeviceItem device, String violationType) {
        if (violationType != null) {
            return COLOR_VIOLATION;
        }
        if (!device.isOnline()) {
            return COLOR_OFFLINE;
        }
        return COLOR_ONLINE;
    }

    /**
     * 创建设备标记的 Bitmap
     */
    private Bitmap createDeviceBitmap(int color, boolean hasViolation) {
        int size = 48;
        int padding = 4;

        Bitmap bitmap = Bitmap.createBitmap(size, size + 16, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);

        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);

        // 绘制定位标记（水滴形状）
        paint.setColor(color);
        paint.setStyle(Paint.Style.FILL);

        // 圆形头部
        float centerX = size / 2f;
        float centerY = size / 2f - 4;
        float radius = size / 2f - padding;

        canvas.drawCircle(centerX, centerY, radius, paint);

        // 白色边框
        paint.setColor(Color.WHITE);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(3);
        canvas.drawCircle(centerX, centerY, radius, paint);

        // 绘制尖端
        paint.setColor(color);
        paint.setStyle(Paint.Style.FILL);
        android.graphics.Path path = new android.graphics.Path();
        path.moveTo(centerX - 8, centerY + radius - 4);
        path.lineTo(centerX, size + 8);
        path.lineTo(centerX + 8, centerY + radius - 4);
        path.close();
        canvas.drawPath(path, paint);

        // 如果有违规，绘制感叹号
        if (hasViolation) {
            paint.setColor(Color.WHITE);
            paint.setStyle(Paint.Style.FILL);
            paint.setTextSize(20);
            paint.setTextAlign(Paint.Align.CENTER);
            canvas.drawText("!", centerX, centerY + 7, paint);
        }

        return bitmap;
    }

    /**
     * 创建信息窗口内容
     */
    private String createSnippet(DeviceItem device, String violationType) {
        StringBuilder sb = new StringBuilder();
        sb.append("状态: ").append(device.isOnline() ? "在线" : "离线").append("\n");
        if (device.holder != null && !device.holder.isEmpty()) {
            sb.append("持有人: ").append(device.holder).append("\n");
        }
        if (device.holderPhone != null && !device.holderPhone.isEmpty()) {
            sb.append("电话: ").append(device.holderPhone).append("\n");
        }
        if (violationType != null) {
            sb.append("违规: ").append(violationType.equals("No Entry") ? "非法闯入" : "非法越界");
        }
        return sb.toString();
    }

    /**
     * 清除所有设备标记
     */
    public void clearAll() {
        for (Marker marker : deviceMarkers.values()) {
            marker.remove();
        }
        deviceMarkers.clear();
    }

    /**
     * 定位到指定设备
     */
    public void focusOnDevice(DeviceItem device) {
        if (aMap == null || device == null || !device.hasLocation()) return;

        Marker marker = deviceMarkers.get(device.deviceId);
        if (marker != null) {
            marker.showInfoWindow();
        }

        LatLng position = new LatLng(device.lat, device.lng);
        aMap.animateCamera(com.amap.api.maps.CameraUpdateFactory.newLatLngZoom(position, 18f));
    }

    /**
     * 显示设备信息窗口
     */
    public void showInfoWindow(DeviceItem device) {
        if (aMap == null || device == null) return;
        Marker marker = deviceMarkers.get(device.deviceId);
        if (marker != null) {
            marker.showInfoWindow();
        }
    }
}
