package com.app.myapplication.data.api;

import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.util.Log;

import com.app.myapplication.data.local.AppConfig;
import com.app.myapplication.data.local.SessionManager;

import java.io.IOException;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.logging.HttpLoggingInterceptor;
import retrofit2.Retrofit;
import retrofit2.converter.gson.GsonConverterFactory;

public class ApiClient {

    private static final String TAG = "ApiClient";
    private static Retrofit retrofit;

    public static Retrofit get(Context ctx) {
        Context appCtx = ctx.getApplicationContext();
        String baseUrl = AppConfig.getBaseUrl(appCtx);
        if (retrofit == null || !retrofit.baseUrl().toString().equals(baseUrl)) {
            SessionManager session = new SessionManager(appCtx);

            HttpLoggingInterceptor log = new HttpLoggingInterceptor();
            log.redactHeader("Authorization");
            log.setLevel(isDebuggable(appCtx)
                    ? HttpLoggingInterceptor.Level.BODY
                    : HttpLoggingInterceptor.Level.NONE);

            OkHttpClient client = new OkHttpClient.Builder()
                    .addInterceptor(chain -> {
                        Request original = chain.request();
                        Request.Builder builder = original.newBuilder();
                        String auth = session.getAuthorizationHeader();
                        if (!auth.isEmpty()) {
                            builder.header("Authorization", auth);
                        }

                        Request request = builder.build();
                        Log.d(TAG, "HTTP request: " + request.method() + " " + request.url());
                        okhttp3.Response response;
                        try {
                            response = chain.proceed(request);
                        } catch (IOException e) {
                            Log.e(TAG, "HTTP IOException: " + request.method()
                                    + " " + request.url()
                                    + " reason=" + e.getClass().getSimpleName()
                                    + ": " + e.getMessage(), e);
                            throw e;
                        }
                        Log.d(TAG, "HTTP response: " + response.code()
                                + " " + request.method()
                                + " " + request.url());
                        if (!response.isSuccessful()) {
                            String body = "";
                            try {
                                body = response.peekBody(1024 * 1024).string();
                            } catch (Exception e) {
                                body = "<failed to read error body: " + e.getMessage() + ">";
                            }
                            Log.e(TAG, "HTTP error body: " + response.code()
                                    + " " + request.url()
                                    + " body=" + body);
                        }
                        if (response.code() == 401) {
                            session.clear();
                            String path = request.url().encodedPath();
                            if (!path.endsWith("/api/auth/login")) {
                                Intent intent = new Intent(appCtx, com.app.myapplication.ui.login.LoginActivity.class);
                                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
                                appCtx.startActivity(intent);
                            }
                        }
                        return response;
                    })
                    .addInterceptor(log)
                    .build();

            retrofit = new Retrofit.Builder()
                    .baseUrl(baseUrl)
                    .client(client)
                    .addConverterFactory(GsonConverterFactory.create())
                    .build();
        }
        return retrofit;
    }

    public static void reset() {
        retrofit = null;
    }

    private static boolean isDebuggable(Context ctx) {
        return (ctx.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    }
}
