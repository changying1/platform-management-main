package com.app.myapplication.data.api;

import com.app.myapplication.data.model.manage.GridItem;
import com.app.myapplication.data.model.manage.GridPersonnel;
import com.app.myapplication.data.model.manage.LocationDevice;
import com.app.myapplication.data.model.manage.Personnel;
import com.app.myapplication.data.model.manage.ProjectItem;
import com.app.myapplication.data.model.manage.ResponsibilityUnit;

import java.util.List;
import java.util.Map;

import retrofit2.Call;
import retrofit2.http.Body;
import retrofit2.http.DELETE;
import retrofit2.http.GET;
import retrofit2.http.POST;
import retrofit2.http.PUT;
import retrofit2.http.Path;
import retrofit2.http.Query;

public interface ManagementApi {

    // ==================== 项目管理 ====================
    @GET("projects/")
    Call<List<ProjectItem>> getProjects(@Query("search") String search, @Query("branch_id") Integer branchId);

    @GET("projects/{project_id}")
    Call<ProjectItem> getProjectDetail(@Path("project_id") int projectId);

    @DELETE("projects/{project_id}")
    Call<Map<String, Object>> deleteProject(@Path("project_id") int projectId);

    // ==================== 网格管理 ====================
    @GET("api/grids/")
    Call<List<GridItem>> getGrids(@Query("level") String level, @Query("status") String status);

    @GET("api/grids/{grid_id}")
    Call<GridItem> getGridById(@Path("grid_id") String gridId);

    @POST("api/grids/")
    Call<GridItem> createGrid(@Body GridItem grid);

    @PUT("api/grids/{grid_id}")
    Call<GridItem> updateGrid(@Path("grid_id") String gridId, @Body GridItem grid);

    @DELETE("api/grids/{grid_id}")
    Call<Map<String, Object>> deleteGrid(@Path("grid_id") String gridId);

    // ==================== 人员管理 ====================
    @GET("api/personnel/")
    Call<List<Personnel>> getPersonnel();

    @POST("api/personnel/")
    Call<Personnel> createPersonnel(@Body Personnel personnel);

    @PUT("api/personnel/{personnel_id}")
    Call<Personnel> updatePersonnel(@Path("personnel_id") String personnelId, @Body Personnel personnel);

    @DELETE("api/personnel/{personnel_id}")
    Call<Map<String, Object>> deletePersonnel(@Path("personnel_id") String personnelId);

    // ==================== 定位设备管理 ====================
    @GET("device/list")
    Call<List<LocationDevice>> getLocationDevices();

    @POST("device/add")
    Call<LocationDevice> addLocationDevice(@Body LocationDevice device);

    @PUT("device/update/{device_id}")
    Call<LocationDevice> updateLocationDevice(@Path("device_id") String deviceId, @Body LocationDevice device);

    @DELETE("device/delete/{device_id}")
    Call<Map<String, Object>> deleteLocationDevice(@Path("device_id") String deviceId);

    // ==================== 责任人员管理 ====================
    @GET("api/grid-personnel/")
    Call<List<GridPersonnel>> getGridPersonnel(@Query("role") String role, @Query("department") String department);

    @GET("api/grid-personnel/{personnel_id}")
    Call<GridPersonnel> getGridPersonnelById(@Path("personnel_id") String personnelId);

    @POST("api/grid-personnel/")
    Call<GridPersonnel> createGridPersonnel(@Body GridPersonnel personnel);

    @PUT("api/grid-personnel/{personnel_id}")
    Call<GridPersonnel> updateGridPersonnel(@Path("personnel_id") String personnelId, @Body GridPersonnel personnel);

    @DELETE("api/grid-personnel/{personnel_id}")
    Call<Map<String, Object>> deleteGridPersonnel(@Path("personnel_id") String personnelId);

    @POST("api/grid-personnel/{personnel_id}/assign-grid/{grid_id}")
    Call<GridPersonnel> assignGridToPersonnel(@Path("personnel_id") String personnelId, @Path("grid_id") String gridId);

    @DELETE("api/grid-personnel/{personnel_id}/assign-grid/{grid_id}")
    Call<GridPersonnel> removeGridFromPersonnel(@Path("personnel_id") String personnelId, @Path("grid_id") String gridId);

    // ==================== 责任单元管理 ====================
    @GET("api/responsibility-units/")
    Call<List<ResponsibilityUnit>> getResponsibilityUnits(@Query("unit_type") String unitType, @Query("parent_id") String parentId);

    @GET("api/responsibility-units/tree")
    Call<List<ResponsibilityUnit>> getResponsibilityUnitTree();

    @GET("api/responsibility-units/{unit_id}")
    Call<ResponsibilityUnit> getResponsibilityUnitById(@Path("unit_id") String unitId);

    @POST("api/responsibility-units/")
    Call<ResponsibilityUnit> createResponsibilityUnit(@Body ResponsibilityUnit unit);

    @PUT("api/responsibility-units/{unit_id}")
    Call<ResponsibilityUnit> updateResponsibilityUnit(@Path("unit_id") String unitId, @Body ResponsibilityUnit unit);

    @DELETE("api/responsibility-units/{unit_id}")
    Call<Map<String, Object>> deleteResponsibilityUnit(@Path("unit_id") String unitId);

    // ==================== 摄像头管理 (复用 VideoApi) ====================
}
