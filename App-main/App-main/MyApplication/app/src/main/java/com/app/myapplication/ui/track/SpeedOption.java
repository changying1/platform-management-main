package com.app.myapplication.ui.track;

public enum SpeedOption {
    X1(1.0f), X2(2.0f), X4(4.0f);

    public final float factor;
    SpeedOption(float f) { this.factor = f; }

    @Override public String toString() {
        if (this == X1) return "1x";
        if (this == X2) return "2x";
        return "4x";
    }
}