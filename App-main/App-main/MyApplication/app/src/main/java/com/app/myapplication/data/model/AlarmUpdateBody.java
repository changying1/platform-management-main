package com.app.myapplication.data.model;

public class AlarmUpdateBody {
    private String status;
    private String severity;

    public AlarmUpdateBody(String status, String severity) {
        this.status = status;
        this.severity = severity;
    }

    public String getStatus() { return status; }
    public String getSeverity() { return severity; }
}
