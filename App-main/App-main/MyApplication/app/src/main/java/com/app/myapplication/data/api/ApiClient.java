package com.app.myapplication.data.api;

import android.content.Context;
import android.content.pm.ApplicationInfo;

import com.app.myapplication.data.local.AppConfig;
import com.app.myapplication.data.local.SessionManager;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.logging.HttpLoggingInterceptor;
import retrofit2.Retrofit;
import retrofit2.converter.gson.GsonConverterFactory;

public class ApiClient {

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
                        String token = session.getToken();
                        if (token != null && !token.trim().isEmpty()) {
                            String auth = token.trim();
                            if (!auth.toLowerCase().startsWith("bearer ")) {
                                auth = "Bearer " + auth;
                            }
                            builder.header("Authorization", auth);
                        }

                        okhttp3.Response response = chain.proceed(builder.build());
                        if (response.code() == 401) {
                            session.clear();
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
