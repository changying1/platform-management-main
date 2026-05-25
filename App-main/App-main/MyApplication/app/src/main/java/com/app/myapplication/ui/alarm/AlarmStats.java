package com.app.myapplication.ui.alarm;

public class AlarmStats {

    private int totalAlarms;
    private int pendingAlarms;
    private int resolvedAlarms;
    private int highSeverityAlarms;
    private int mediumSeverityAlarms;
    private int lowSeverityAlarms;

    public AlarmStats(int totalAlarms, int pendingAlarms, int resolvedAlarms,
                      int highSeverityAlarms, int mediumSeverityAlarms, int lowSeverityAlarms) {
        this.totalAlarms = totalAlarms;
        this.pendingAlarms = pendingAlarms;
        this.resolvedAlarms = resolvedAlarms;
        this.highSeverityAlarms = highSeverityAlarms;
        this.mediumSeverityAlarms = mediumSeverityAlarms;
        this.lowSeverityAlarms = lowSeverityAlarms;
    }

    // Getter 和 Setter 方法
    public int getTotalAlarms() {
        return totalAlarms;
    }

    public void setTotalAlarms(int totalAlarms) {
        this.totalAlarms = totalAlarms;
    }

    public int getPendingAlarms() {
        return pendingAlarms;
    }

    public void setPendingAlarms(int pendingAlarms) {
        this.pendingAlarms = pendingAlarms;
    }

    public int getResolvedAlarms() {
        return resolvedAlarms;
    }

    public void setResolvedAlarms(int resolvedAlarms) {
        this.resolvedAlarms = resolvedAlarms;
    }

    public int getHighSeverityAlarms() {
        return highSeverityAlarms;
    }

    public void setHighSeverityAlarms(int highSeverityAlarms) {
        this.highSeverityAlarms = highSeverityAlarms;
    }

    public int getMediumSeverityAlarms() {
        return mediumSeverityAlarms;
    }

    public void setMediumSeverityAlarms(int mediumSeverityAlarms) {
        this.mediumSeverityAlarms = mediumSeverityAlarms;
    }

    public int getLowSeverityAlarms() {
        return lowSeverityAlarms;
    }

    public void setLowSeverityAlarms(int lowSeverityAlarms) {
        this.lowSeverityAlarms = lowSeverityAlarms;
    }

    // 兼容旧代码
    public int getProcessedAlarms() {
        return resolvedAlarms;
    }

    public void setProcessedAlarms(int processedAlarms) {
        this.resolvedAlarms = processedAlarms;
    }

    public int getCriticalAlarms() {
        return highSeverityAlarms;
    }

    public void setCriticalAlarms(int criticalAlarms) {
        this.highSeverityAlarms = criticalAlarms;
    }
}
