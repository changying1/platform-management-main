package com.app.myapplication;

import android.app.Application;
import android.os.Build;
import android.util.Log;

import com.amap.api.maps.MapsInitializer;
import com.app.myapplication.ui.video.ezviz.EzvizSdkBridge;

import java.util.Arrays;

public class MyApp extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        MapsInitializer.updatePrivacyShow(this, true, true);
        MapsInitializer.updatePrivacyAgree(this, true);
        Log.d("ABI", Arrays.toString(Build.SUPPORTED_ABIS));
        if (!BuildConfig.USE_HLS_DEBUG_STREAM) {
            EzvizSdkBridge.init(this);
        }

    }
}
