package com.app.myapplication.data.model.call;

import com.google.gson.annotations.SerializedName;

import java.util.ArrayList;
import java.util.List;

public class TtsBatchRecord {
    @SerializedName("batch_id")
    public String batchId;

    @SerializedName("text")
    public String text;

    @SerializedName("request_source")
    public String requestSource;

    @SerializedName("operator")
    public String operator;

    @SerializedName("created_at")
    public String createdAt;

    @SerializedName("requested_count")
    public int requestedCount;

    @SerializedName("queued_count")
    public int queuedCount;

    @SerializedName("sending_count")
    public int sendingCount;

    @SerializedName("acked_count")
    public int ackedCount;

    @SerializedName("failed_count")
    public int failedCount;

    @SerializedName("retry_wait_count")
    public int retryWaitCount;

    @SerializedName("jobs")
    public List<TtsQueueJob> jobs = new ArrayList<>();
}
