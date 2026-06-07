package com.app.myapplication.data.api;

import com.app.myapplication.data.model.LoginResult;

import retrofit2.Call;
import retrofit2.http.Body;
import retrofit2.http.POST;

public interface AuthApi {
    @POST("api/auth/login")
    Call<LoginResult> login(@Body LoginRequest request);

    class LoginRequest {
        public String username;
        public String password;

        public LoginRequest(String username, String password) {
            this.username = username;
            this.password = password;
        }
    }
}
