package com.app.myapplication.data.api;

import com.google.gson.JsonObject;

import retrofit2.Call;
import retrofit2.http.Body;
import retrofit2.http.POST;

public interface CameraRegistrationApi {
    @POST("device-registration/cameras")
    Call<JsonObject> registerCamera(@Body JsonObject request);
}
