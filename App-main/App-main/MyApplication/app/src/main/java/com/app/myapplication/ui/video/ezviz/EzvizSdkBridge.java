package com.app.myapplication.ui.video.ezviz;

import android.app.Application;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Handler;
import android.util.Log;
import android.view.SurfaceHolder;

import com.app.myapplication.BuildConfig;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;

public final class EzvizSdkBridge {
    private static final String TAG = "EzvizSdkBridge";
    private static final String META_APP_KEY = "EZVIZ_APP_KEY";
    private static final String[] SDK_CLASS_NAMES = {
            "com.videogo.openapi.EZOpenSDK",
            "com.videogo.openapi.EZGlobalSDK"
    };

    private static Class<?> sdkClass;
    private static boolean initAttempted;
    private static boolean initSucceeded;
    private static String initStatus = "EZVIZ SDK init has not run";

    private EzvizSdkBridge() {
    }

    public static synchronized void init(Application application) {
        initAttempted = true;
        initSucceeded = false;
        sdkClass = findSdkClass();
        if (sdkClass == null) {
            initStatus = "EZVIZ SDK class not found; put official EZOpenSDK AAR/JAR under app/libs";
            Log.w(TAG, initStatus);
            return;
        }

        invokeStaticIfExists("showSDKLog", new Class<?>[]{boolean.class}, false);
        invokeStaticIfExists("enableP2P", new Class<?>[]{boolean.class}, false);

        String appKey = readConfiguredAppKey(application);
        if (appKey.isEmpty()) {
            initStatus = "EZVIZ SDK found but EZVIZ_APP_KEY is empty; configure it in local.properties or Gradle property; appSecret must stay on backend";
            Log.w(TAG, initStatus);
            return;
        }

        try {
            Method initLib = sdkClass.getMethod("initLib", Application.class, String.class);
            initLib.invoke(null, application, appKey);
            initSucceeded = true;
            initStatus = "EZVIZ SDK initialized with BuildConfig/local.properties appKey";
            Log.i(TAG, initStatus);
            return;
        } catch (NoSuchMethodException ignored) {
            // Some SDK variants expose initLib(Application, String, String).
        } catch (Exception e) {
            initStatus = "EZVIZ SDK initLib(Application, String) failed: " + rootMessage(e);
            Log.e(TAG, initStatus, e);
            return;
        }

        try {
            Method initLib = sdkClass.getMethod("initLib", Application.class, String.class, String.class);
            initLib.invoke(null, application, appKey, null);
            initSucceeded = true;
            initStatus = "EZVIZ SDK initialized with BuildConfig/local.properties appKey";
            Log.i(TAG, initStatus);
        } catch (Exception e) {
            initStatus = "EZVIZ SDK initLib(Application, String, String) failed: " + rootMessage(e);
            Log.e(TAG, initStatus, e);
        }
    }

    public static boolean isSdkPresent() {
        if (sdkClass == null) sdkClass = findSdkClass();
        return sdkClass != null;
    }

    public static boolean isReady() {
        return initSucceeded && isSdkPresent();
    }

    public static String getInitStatus() {
        if (!initAttempted) return "EZVIZ SDK init has not run";
        if (!isSdkPresent()) {
            return "EZVIZ SDK class not found; put official EZOpenSDK AAR/JAR under app/libs";
        }
        return initStatus;
    }

    public static void setAccessToken(String accessToken) throws ReflectiveOperationException {
        Object sdk = getSdkInstance();
        Method method = sdkClass.getMethod("setAccessToken", String.class);
        method.invoke(sdk, accessToken);
    }

    public static Object createPlayer(String deviceSerial, int cameraNo) throws ReflectiveOperationException {
        Object sdk = getSdkInstance();
        Method method = sdkClass.getMethod("createPlayer", String.class, int.class);
        return method.invoke(sdk, deviceSerial, cameraNo);
    }

    public static boolean setSurfaceHolder(Object player, SurfaceHolder holder) throws ReflectiveOperationException {
        Method method = player.getClass().getMethod("setSurfaceHold", SurfaceHolder.class);
        Object result = method.invoke(player, holder);
        return !(result instanceof Boolean) || (Boolean) result;
    }

    public static boolean setHandler(Object player, Handler handler) throws ReflectiveOperationException {
        Method method = player.getClass().getMethod("setHandler", Handler.class);
        Object result = method.invoke(player, handler);
        return !(result instanceof Boolean) || (Boolean) result;
    }

    public static boolean startRealPlay(Object player) throws ReflectiveOperationException {
        Method method = player.getClass().getMethod("startRealPlay");
        Object result = method.invoke(player);
        return !(result instanceof Boolean) || (Boolean) result;
    }

    public static void stopRealPlay(Object player) {
        invokePlayerIfExists(player, "stopRealPlay");
    }

    public static void releasePlayer(Object player) {
        if (player == null || !isSdkPresent()) return;
        try {
            Object sdk = getSdkInstance();
            Method method = sdkClass.getMethod("releasePlayer", player.getClass());
            method.invoke(sdk, player);
            return;
        } catch (Exception ignored) {
            // Fall back to EZPlayer.release().
        }
        invokePlayerIfExists(player, "release");
    }

    public static String rootMessage(Throwable throwable) {
        Throwable t = throwable;
        if (t instanceof InvocationTargetException && ((InvocationTargetException) t).getTargetException() != null) {
            t = ((InvocationTargetException) t).getTargetException();
        }
        return t == null || t.getMessage() == null ? "unknown" : t.getMessage();
    }

    private static Object getSdkInstance() throws ReflectiveOperationException {
        if (sdkClass == null) sdkClass = findSdkClass();
        if (sdkClass == null) {
            throw new ClassNotFoundException("EZVIZ SDK class not found");
        }
        Method method = sdkClass.getMethod("getInstance");
        return method.invoke(null);
    }

    private static Class<?> findSdkClass() {
        for (String className : SDK_CLASS_NAMES) {
            try {
                return Class.forName(className);
            } catch (ClassNotFoundException ignored) {
            }
        }
        return null;
    }

    private static void invokeStaticIfExists(String methodName, Class<?>[] parameterTypes, Object... args) {
        if (sdkClass == null) return;
        try {
            Method method = sdkClass.getMethod(methodName, parameterTypes);
            method.invoke(null, args);
        } catch (Exception ignored) {
        }
    }

    private static void invokePlayerIfExists(Object player, String methodName) {
        if (player == null) return;
        try {
            Method method = player.getClass().getMethod(methodName);
            method.invoke(player);
        } catch (Exception ignored) {
        }
    }

    private static String readMetaData(Application application, String key) {
        try {
            ApplicationInfo info = application.getPackageManager().getApplicationInfo(
                    application.getPackageName(),
                    PackageManager.GET_META_DATA
            );
            if (info.metaData == null) return "";
            Object value = info.metaData.get(key);
            return value == null ? "" : String.valueOf(value).trim();
        } catch (Exception e) {
            return "";
        }
    }

    private static String readConfiguredAppKey(Application application) {
        String value = safeTrim(BuildConfig.EZVIZ_APP_KEY);
        return value.isEmpty() ? readMetaData(application, META_APP_KEY) : value;
    }

    private static String safeTrim(String value) {
        return value == null ? "" : value.trim();
    }
}
