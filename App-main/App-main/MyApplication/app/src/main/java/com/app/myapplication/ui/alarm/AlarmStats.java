package com.app.myapplication.ui.alarm;

public class AlarmStats {

    private int totalAlarms;
    private int pendingAlarms;
    private int processedAlarms;
    private int criticalAlarms;

    public AlarmStats(int totalAlarms, int pendingAlarms, int processedAlarms, int criticalAlarms) {
        this.totalAlarms = totalAlarms;
        this.pendingAlarms = pendingAlarms;
        this.processedAlarms = processedAlarms;
        this.criticalAlarms = criticalAlarms;
    }

    // Getter 和 Setter 方法
    public int getTotalAlarms() { return totalAlarms; }
    public void setTotalAlarms(int totalAlarms) { this.totalAlarms = totalAlarms; }

    public int getPendingAlarms() { return pendingAlarms; }
    public void setPendingAlarms(int pendingAlarms) { this.pendingAlarms = pendingAlarms; }

    public int getProcessedAlarms() { return processedAlarms; }
    public void setProcessedAlarms(int processedAlarms) { this.processedAlarms = processedAlarms; }

    public int getCriticalAlarms() { return criticalAlarms; }
    public void setCriticalAlarms(int criticalAlarms) { this.criticalAlarms = criticalAlarms; }
}
