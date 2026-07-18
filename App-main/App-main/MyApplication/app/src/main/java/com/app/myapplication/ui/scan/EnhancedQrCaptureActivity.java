package com.app.myapplication.ui.scan;

import android.os.Bundle;
import android.util.Log;

import com.app.myapplication.R;
import com.journeyapps.barcodescanner.CaptureActivity;
import com.journeyapps.barcodescanner.DecoratedBarcodeView;

public class EnhancedQrCaptureActivity extends CaptureActivity {
    private static final String TAG = "EnhancedQrCapture";

    @Override
    protected DecoratedBarcodeView initializeContent() {
        setContentView(R.layout.activity_enhanced_qr_capture);

        DecoratedBarcodeView barcodeView = findViewById(R.id.zxing_barcode_scanner);
        try {
            barcodeView.getCameraSettings().setAutoFocusEnabled(true);
        } catch (RuntimeException e) {
            Log.w(TAG, "Unable to enable autofocus; using ZXing defaults.", e);
        }
        return barcodeView;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
    }
}
