package com.app.myapplication.data.api;

import android.content.Context;

import com.app.myapplication.data.local.AppConfig;

import okhttp3.OkHttpClient;
import okhttp3.logging.HttpLoggingInterceptor;
import retrofit2.Retrofit;
import retrofit2.converter.gson.GsonConverterFactory;


//    建 Retrofit/OkHttp 客户端（并从 AppConfig 读取 BaseURL)
//    Retrofit 是一种“把 HTTP 请求，包装成普通 Java 接口调用”的方式

public class ApiClient {

    private static Retrofit retrofit;

    public static Retrofit get(Context ctx) {
        String baseUrl = AppConfig.getBaseUrl(ctx); // ✅ 统一来源
        if (retrofit == null || !retrofit.baseUrl().toString().equals(baseUrl)) {

            HttpLoggingInterceptor log = new HttpLoggingInterceptor();
            log.setLevel(HttpLoggingInterceptor.Level.BODY);

            OkHttpClient client = new OkHttpClient.Builder()
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
}
