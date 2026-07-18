package com.app.myapplication.ui.scan;

import com.journeyapps.barcodescanner.ScanOptions;

public final class QrScanOptions {
    private static final long SCAN_TIMEOUT_MS = 120000L;

    private QrScanOptions() {
    }

    public static ScanOptions cameraDevice(String prompt) {
        ScanOptions options = new ScanOptions();
        options.setCaptureActivity(EnhancedQrCaptureActivity.class);
        options.setDesiredBarcodeFormats(ScanOptions.QR_CODE);
        options.setPrompt(prompt);
        options.setBeepEnabled(true);
        options.setOrientationLocked(false);
        options.setBarcodeImageEnabled(false);
        options.setTimeout(SCAN_TIMEOUT_MS);
        return options;
    }
}
