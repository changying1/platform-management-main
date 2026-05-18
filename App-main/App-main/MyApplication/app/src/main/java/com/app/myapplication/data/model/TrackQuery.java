package com.app.myapplication.data.model;

public class TrackQuery {
    public String keyword;   // 姓名/设备号
    public String startDate; // yyyy-MM-dd
    public String endDate;   // yyyy-MM-dd

    public TrackQuery(String keyword, String startDate, String endDate) {
        this.keyword = keyword;
        this.startDate = startDate;
        this.endDate = endDate;
    }
}