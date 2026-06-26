package com.app.myapplication.data.api;

import com.app.myapplication.data.model.LoginResult;

import retrofit2.Call;
import retrofit2.http.Body;
import retrofit2.http.GET;
import retrofit2.http.POST;

public interface AuthApi {
    @POST("api/auth/login")
    Call<LoginResult> login(@Body LoginRequest request);

    @GET("api/auth/me")
    Call<LoginResult> me();

    class LoginRequest {
        public String username;
        public String password;

        public LoginRequest(String username, String password) {
            this.username = username;
            this.password = password;
        }
    }
}
