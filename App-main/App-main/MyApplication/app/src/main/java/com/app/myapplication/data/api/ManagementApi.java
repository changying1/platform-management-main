package com.app.myapplication.data.api;

import com.app.myapplication.data.model.Project;
import com.app.myapplication.data.model.Grid;
import com.app.myapplication.data.model.Team;
import com.app.myapplication.data.model.Person;
import com.app.myapplication.data.model.ResponsibilityUnit;
import com.app.myapplication.data.model.CameraDevice;
import com.app.myapplication.data.model.LocationDevice;
import com.google.gson.JsonObject;

import java.util.List;
import java.util.Map;

import retrofit2.Call;
import retrofit2.http.Body;
import retrofit2.http.DELETE;
import retrofit2.http.GET;
import retrofit2.http.HeaderMap;
import retrofit2.http.POST;
import retrofit2.http.PUT;
import retrofit2.http.Path;
import retrofit2.http.Query;

/**
 * 管理中心 API 接口
 * 与 Web 端对齐
 */
public interface ManagementApi {

    // ==================== 项目管理 ====================
    
    /**
     * 获取项目列表 - 对应 Web 端 /projects/
     */
    @GET("projects/")
    Call<List<JsonObject>> getProjects(
        @HeaderMap Map<String, String> headers
    );

    // ==================== 网格管理 ====================
    
    /**
     * 获取网格列表 - 对应 Web 端 /api/grids/
     */
    @GET("api/grids/")
    Call<List<JsonObject>> getGrids(
        @HeaderMap Map<String, String> headers
    );

    // ==================== 工队管理 ====================
    
    /**
     * 获取工队列表 - 对应 Web 端 /team/list
     */
    @GET("team/list")
    Call<List<JsonObject>> getTeams(
        @HeaderMap Map<String, String> headers
    );

    // ==================== 人员管理 ====================
    
    /**
     * 获取人员列表 - 对应 Web 端 /api/personnel/
     */
    @GET("api/personnel/")
    Call<List<JsonObject>> getPersonnel(
        @HeaderMap Map<String, String> headers
    );

    /**
     * 更新人员
     */
    @PUT("api/personnel/{id}")
    Call<JsonObject> updatePerson(
        @HeaderMap Map<String, String> headers,
        @Path("id") String id,
        @Body JsonObject person
    );

    /**
     * 创建人员
     */
    @POST("api/personnel/")
    Call<JsonObject> createPerson(
        @HeaderMap Map<String, String> headers,
        @Body JsonObject person
    );

    // ==================== 设备管理 ====================
    
    /**
     * 获取视频设备列表 - 对应 Web 端 /video/
     */
    @GET("video/?limit=500")
    Call<List<JsonObject>> getVideos(
        @HeaderMap Map<String, String> headers
    );
    
    /**
     * 获取定位设备列表 - 对应 Web 端 /device/list
     */
    @GET("device/list")
    Call<List<JsonObject>> getLocationDevices(
        @HeaderMap Map<String, String> headers
    );

    @POST("device/add")
    Call<JsonObject> addLocationDevice(
        @HeaderMap Map<String, String> headers,
        @Body JsonObject device
    );
    
    /**
     * 获取设备列表 - 对应 Web 端 /api/devices
     */
    @GET("api/devices")
    Call<List<JsonObject>> getDevices(
        @HeaderMap Map<String, String> headers
    );

    /**
     * 获取仪表盘概览 - 对应 Web 端 /api/dashboard/overview
     */
    @GET("api/dashboard/overview")
    Call<JsonObject> getDashboardOverview(
        @HeaderMap Map<String, String> headers
    );

    // ==================== 权限管理 ====================
    
    /**
     * 获取角色列表 - 对应 Web 端 /api/permissions/roles
     */
    @GET("api/permissions/roles")
    Call<List<JsonObject>> getRoles(
        @HeaderMap Map<String, String> headers
    );

    /**
     * 获取账号列表 - 对应 Web 端 /api/permissions/accounts
     */
    @GET("api/permissions/accounts")
    Call<List<JsonObject>> getAccounts(
        @HeaderMap Map<String, String> headers
    );

    /**
     * 更新角色权限 - 对应 Web 端 /api/permissions/roles/{level}
     */
    @PUT("api/permissions/roles/{level}")
    Call<Void> updateRolePermissions(
        @HeaderMap Map<String, String> headers,
        @Path("level") String level,
        @Body JsonObject permissions
    );

    // ==================== 责任管理 ====================
    
    /**
     * 获取责任单元树 - 对应 Web 端 /api/responsibility-units/tree
     */
    @GET("api/responsibility-units/tree")
    Call<List<JsonObject>> getResponsibilityTree(
        @HeaderMap Map<String, String> headers
    );

    // ==================== 删除操作 ====================
    
    @DELETE("api/devices/{id}")
    Call<Void> deleteDevice(@HeaderMap Map<String, String> headers, @Path("id") String id);
    
    @DELETE("api/personnel/{id}")
    Call<Void> deletePersonnel(@HeaderMap Map<String, String> headers, @Path("id") String id);
    
    @DELETE("projects/{id}")
    Call<Void> deleteProject(@HeaderMap Map<String, String> headers, @Path("id") int id);
    
    @DELETE("api/grids/{id}")
    Call<Void> deleteGrid(@HeaderMap Map<String, String> headers, @Path("id") String id);
    
    // ==================== 辅助数据 ====================
    
    /**
     * 获取分公司列表 - 对应 Web 端 /api/dashboard/branches
     */
    @GET("api/dashboard/branches")
    Call<List<JsonObject>> getBranches(
        @HeaderMap Map<String, String> headers
    );
    
    /**
     * 获取网格人员
     */
    @GET("api/grids/{id}/personnel")
    Call<List<JsonObject>> getGridPersonnel(
        @HeaderMap Map<String, String> headers,
        @Path("id") String id
    );
}
