# MongoDB 数据库集合总览

本文档按当前项目代码结构整理，目标是"尽量少改当前集合名，同时把数据库结构梳理清楚"。当前默认数据库为 `smart_helmet_mongo`。

> **⚠️ 重要说明**：本文档已完全从 MySQL 迁移到 MongoDB。所有集合均已在代码中实现并使用。

## 实现状态图例

- ✅ **已实现** - 集合已在代码中使用
- ⚠️ **部分实现** - 集合存在但字段与文档有差异
- 📝 **文档字段** - 文档中定义但实际代码中可能未使用
- 🔧 **实际字段** - 代码中实际使用的字段

## 命名原则

- 优先沿用当前代码中已经使用的集合名，例如 `device`、`grid`、`video_device`、`alarm_record`。
- 对历史兼容集合不强制迁移，但不建议作为新业务主集合继续扩展。
- 轨迹数据当前在 `device.trajectory` 中使用，短期可以继续；如果后续设备多、轨迹点多，建议新增 `device_track` 或 `device_location_history` 存长期轨迹。
- 所有集合默认包含 MongoDB 自带 `_id` 字段。

## 必须集合

### 1. `users` ✅

后台管理端、安卓端登录账号及权限数据。

| 字段 | 类型 | 中文说明 | 状态 |
|---|---|---|---|
| `_id` | ObjectId | MongoDB 主键 | ✅ |
| `id` | Number/String | 业务自增用户 ID | ✅ |
| `username` | String | 登录用户名 | ✅ |
| `hashed_password` | String | 登录密码或密码哈希，当前项目兼容明文 | ✅ |
| `password` | String | 兼容字段，当前部分代码会读取 | 📝 |
| `full_name` | String | 用户姓名 | ✅ |
| `role` | String | 用户角色，如 `HQ`、`BRANCH`、`PROJECT`、`TEAM` | ✅ |
| `permission_level` | String | 权限等级，如 `headquarters_admin`、`branch_admin` | 📝 |
| `permissions` | Array<String> | 具体权限码列表 | 📝 |
| `phone` | String | 联系电话 | ✅ |
| `department` | String | 所属部门/分公司名称 | ✅ |
| `department_id` | Number/String | 所属部门或分公司 ID | ✅ |
| `parent_id` | Number/String | 上级用户 ID | ✅ |
| `status` | String | 账号状态，如 `pending`、`active` | 📝 |
| `company` | String | 所属公司/分公司 | 📝 |
| `branch_id` | String | 所属分公司 ID | 📝 |
| `project` | String | 所属项目名称 | 📝 |
| `project_id` | String | 所属项目 ID | 📝 |
| `grid_id` | String | 所属网格 ID | 📝 |
| `grid_ids` | Array<String> | 可管理网格 ID 列表 | 📝 |
| `grid_role` | String | 网格内角色 | 📝 |
| `team` | String | 所属班组名称 | 📝 |
| `team_id` | String | 所属班组 ID | 📝 |
| `work_team` | String | 作业班组 | 📝 |
| `responsibility_unit_id` | String | 责任单元 ID | 📝 |
| `responsibility_level` | String | 责任层级 | 📝 |
| `personnel_id` | String | 关联人员档案 ID | 📝 |
| `employee_code` | String | 员工编号 | 📝 |
| `id_card` | String | 身份证号 | 📝 |
| `created_at` | Date | 创建时间 | 📝 |
| `updated_at` | Date | 更新时间 | 📝 |

**实际代码中使用的主要字段**：`id`, `username`, `hashed_password`, `full_name`, `role`, `phone`, `department`, `department_id`, `parent_id`

建议索引：`username` 唯一索引，`id` 普通索引，`project_id`、`grid_id`、`team_id`、`branch_id` 普通索引。

### 2. `auth_sessions` ✅

登录会话和 token 存储。

| 字段 | 类型 | 中文说明 | 状态 |
|---|---|---|---|
| `_id` | ObjectId | MongoDB 主键 | ✅ |
| `token` | String | 登录 token | ✅ |
| `username` | String | token 对应用户名 | ✅ |
| `created_at` | Date | 创建时间 | ✅ |
| `expires_at` | Date | 过期时间 | ✅ |

建议索引：`token` 唯一索引，`expires_at` TTL 或普通索引。

### 3. `personnel` ✅

人员档案，区别于 `users`。`personnel` 是人员信息，`users` 是登录账号。

| 字段 | 类型 | 中文说明 | 状态 |
|---|---|---|---|
| `_id` | ObjectId | MongoDB 主键 | ✅ |
| `id` | Number/String | 业务自增 ID | 🔧 |
| `username` | String | 人员姓名 | ✅ |
| `dept` | String | 部门 | 📝 |
| `phone` | String | 联系电话 | ✅ |
| `password` | String | 兼容字段，部分人员可同步为登录账号 | 📝 |
| `role` | String | 人员角色，如 Worker、Safety Officer | ✅ |
| `parentId` | String | 上级人员 ID | 📝 |
| `faceImage` | String | 人脸图片地址 | 📝 |
| `loginUsername` | String | 登录用户名 | 📝 |
| `loginPassword` | String | 登录密码 | 📝 |
| `permissionLevel` | String | 权限等级 | 📝 |
| `gridRole` | String | 网格角色 | 📝 |
| `gridIds` | Array<String> | 关联网格 ID 列表 | 📝 |
| `responsibilityUnitId` | String | 责任单元 ID | 📝 |
| `employeeId` | String | 员工编号 | ✅ |
| `idCard` | String | 身份证号 | 📝 |
| `company` | String | 所属公司/分公司 | 📝 |
| `branchId` | String | 所属分公司 ID | 📝 |
| `projectId` | String | 所属项目 ID | 📝 |
| `gridId` | String | 所属网格 ID | 📝 |
| `teamId` | String | 所属班组 ID | 📝 |
| `isResponsibilityPerson` | Boolean | 是否责任人 | 📝 |
| `responsibilityLevel` | String | 责任级别 | 📝 |
| `project` | String | 项目名称 | 📝 |
| `workType` | String | 工种 | 📝 |
| `workTeam` | String | 作业班组 | 📝 |
| `team` | String | 班组名称 | 📝 |
| `entryDate` | String | 入场日期 | 📝 |
| `status` | String | 人员状态，如 `active` | ✅ |
| `emergencyContact` | String | 紧急联系人 | 📝 |
| `addedDate` | String | 添加日期 | 📝 |
| `created_at` | Date | 创建时间 | ✅ |
| `updated_at` | Date | 更新时间 | ✅ |

**实际代码中使用的主要字段**：`id`, `username`, `phone`, `role`, `employeeId`, `status`, `created_at`, `updated_at`

建议索引：`phone`、`employeeId`、`projectId`、`gridId`、`teamId`、`branchId`。

### 4. `branch`

分公司/组织机构。当前代码主要用 `branch`，也有兼容 `branches` 的地方。为少变动，主集合建议继续用 `branch`，`branches` 仅作为历史兼容。

| 字段 | 类型 | 中文说明 |
|---|---|---|
| `_id` | ObjectId | MongoDB 主键 |
| `id` | Number/String | 分公司业务 ID |
| `province` | String | 省份 |
| `name` | String | 分公司名称 |
| `lng` | Number | 经度 |
| `lat` | Number | 纬度 |
| `address` | String | 地址 |
| `project` | String | 关联项目名称 |
| `manager` | String | 负责人 |
| `phone` | String | 联系电话 |
| `device_count` | Number | 设备数量 |
| `status` | String | 状态，如 `normal` |
| `remark` | String | 备注 |
| `updated_at` | Date | 更新时间 |

建议索引：`id`、`name`。

### 5. `project`

项目管理。当前代码同时出现 `project` 和 `projects`，为少变动，主集合建议用 `project`，`projects` 作为兼容查询来源。

| 字段 | 类型 | 中文说明 |
|---|---|---|
| `_id` | ObjectId | MongoDB 主键 |
| `id` | Number/String | 项目业务 ID |
| `name` | String | 项目名称 |
| `description` | String | 项目描述 |
| `manager` | String | 项目经理 |
| `status` | String | 项目状态，如 `active`、`paused`、`completed` |
| `remark` | String | 备注 |
| `branch_id` | Number/String | 所属分公司 ID |
| `user_ids` | Array<Number/String> | 关联用户 ID 列表 |
| `device_ids` | Array<String> | 关联设备 ID 列表 |
| `region_ids` | Array<Number/String> | 关联项目区域 ID 列表 |
| `created_at` | Date | 创建时间 |
| `updated_at` | Date | 更新时间 |

建议索引：`id`、`name`、`branch_id`、`status`。

### 6. `grid`

网格管理。用于项目下的网格、作业面、班组区域等。

| 字段 | 类型 | 中文说明 |
|---|---|---|
| `_id` | ObjectId | MongoDB 主键 |
| `grid_id` | String | 网格编号，如 `GRID-001` |
| `name` | String | 网格名称 |
| `level` | String | 网格层级，如 `project`、`workshop`、`team`、`workface` |
| `project_id` | String | 所属项目 ID |
| `description` | String | 网格描述 |
| `bounds_json` | String | 网格边界 JSON，通常为坐标数组 |
| `parent_id` | String | 上级网格 ID 或对象 ID |
| `status` | String | 网格状态，如 `normal`、`warning`、`alarm` |
| `area` | Number | 网格面积，单位平方米 |
| `created_at` | String/Date | 创建时间 |
| `updated_at` | String/Date | 更新时间 |

建议索引：`grid_id` 唯一索引，`project_id`、`level`、`status`。

### 7. `team`

班组/工队管理。

| 字段 | 类型 | 中文说明 |
|---|---|---|
| `_id` | ObjectId | MongoDB 主键 |
| `team_id` | String | 班组业务 ID |
| `name` | String | 班组名称 |
| `color` | String | 班组展示颜色 |
| `company` | String | 所属公司 |
| `project` | String | 所属项目名称 |
| `project_id` | String | 所属项目 ID |
| `grid_id` | String | 所属网格 ID |
| `fence_ids` | Array<String> | 关联围栏 ID 列表 |
| `createdAt` | String | 创建时间 |
| `updatedAt` | String | 更新时间 |

建议索引：`team_id` 唯一索引，`project_id`、`grid_id`。

### 8. `responsibility_unit`

穿透式责任管理组织树。

| 字段 | 类型 | 中文说明 |
|---|---|---|
| `_id` | ObjectId | MongoDB 主键 |
| `unit_id` | String | 责任单元编号 |
| `name` | String | 责任单元名称 |
| `type` | String | 单元类型，如 `project`、`safety_office`、`grid`、`team`、`personnel` |
| `parent_id` | String | 父级责任单元 ID |
| `project_id` | String | 关联项目 ID |
| `grid_id` | String | 关联网格 ID |
| `team_id` | String | 关联班组 ID |
| `personnel_id` | String | 关联人员 ID |
| `responsible_person_id` | String | 责任人 ID |
| `responsible_person_name` | String | 责任人姓名 |
| `safety_office_role` | String | 安全办公室角色 |
| `level` | Number | 树层级 |
| `is_under_construction` | Boolean | 是否在建 |
| `sort_order` | Number | 同级排序 |
| `created_at` | String/Date | 创建时间 |
| `updated_at` | String/Date | 更新时间 |

建议索引：`unit_id` 唯一索引，`parent_id`、`project_id`、`grid_id`、`team_id`、`personnel_id`。

### 9. `device`

安全帽/定位设备集合。当前轨迹回放主要读取该集合的 `trajectory` 字段。

| 字段 | 类型 | 中文说明 |
|---|---|---|
| `_id` | ObjectId | MongoDB 主键 |
| `device_id` | String | 设备编号 |
| `name` | String | 设备名称 |
| `lat` | Number | 当前纬度 |
| `lng` | Number | 当前经度 |
| `company` | String | 所属公司 |
| `project` | String | 所属项目名称 |
| `type` | String | 设备类型，如安全帽、定位终端 |
| `team` | String | 所属班组 |
| `status` | String | 设备状态，如在线、离线、告警 |
| `holder` | String | 持有人姓名 |
| `holderPhone` | String | 持有人电话或终端手机号 |
| `remark` | String | 备注 |
| `lastUpdate` | String | 最后位置更新时间 |
| `createdAt` | String | 创建时间 |
| `updatedAt` | String | 更新时间 |
| `trajectory` | Array<Object> | 轨迹点数组 |

`trajectory` 子字段：

| 字段 | 类型 | 中文说明 |
|---|---|---|
| `timestamp` | String | 轨迹点时间 |
| `lat` | Number | 纬度 |
| `lng` | Number | 经度 |
| `speed` | Number | 速度 |
| `direction` | Number | 方向角 |

建议索引：`device_id` 唯一索引，`holderPhone`、`project`、`team`、`status`。

### 10. `video_device` ✅

摄像头/视频设备集合。

| 字段 | 类型 | 中文说明 | 状态 |
|---|---|---|---|
| `_id` | ObjectId | MongoDB 主键 | ✅ |
| `id` | Number/String | 视频设备业务 ID | ✅ |
| `name` | String | 摄像头名称 | ✅ |
| `ip_address` | String | 设备 IP 地址 | ✅ |
| `port` | Number | 服务端口 | ✅ |
| `username` | String | 设备登录用户名 | ✅ |
| `password` | String | 设备登录密码 | ✅ |
| `stream_url` | String | 视频流地址 | ✅ |
| `rtsp_url` | String | RTSP 地址 | ✅ |
| `stream_protocol` | String | 拉流协议，如 `ezopen`、`hls`、`rtmp`、`flv` | ✅ |
| `platform_type` | String | 平台类型，如 `onvif`、`ezviz` | ✅ |
| `access_source` | String | 访问来源，如 `local`、`cloud` | ✅ |
| `ptz_source` | String | 云台控制来源 | ✅ |
| `device_serial` | String | 萤石/云平台设备序列号 | ✅ |
| `channel_no` | Number | 通道号 | ✅ |
| `supports_ptz` | Number | 是否支持云台，1 是，0 否 | ✅ |
| `supports_preset` | Number | 是否支持预置点 | ✅ |
| `supports_cruise` | Number | 是否支持巡航 | ✅ |
| `supports_zoom` | Number | 是否支持变焦 | ✅ |
| `supports_focus` | Number | 是否支持焦距 | ✅ |
| `latitude` | Number | 摄像头纬度 | ✅ |
| `longitude` | Number | 摄像头经度 | ✅ |
| `status` | String | 视频设备状态，如 `online`、`offline` | ✅ |
| `remark` | String | 备注 | ✅ |
| `is_active` | Number | 是否启用，1 启用，0 禁用 | ✅ |
| `company` | String | 所属公司 | 🔧 |
| `project` | String | 所属项目 | 🔧 |
| `grid` | String | 所属网格名称 | 🔧 |
| `grid_id` | String | 所属网格 ID | 📝 |
| `team` | String | 所属班组名称 | 🔧 |
| `team_id` | String | 所属班组 ID | 📝 |
| `device_type` | String | 设备类型 | 📝 |
| `holder` | String | 持有人 | 📝 |
| `holder_id` | String | 持有人 ID | 📝 |
| `holder_name` | String | 持有人姓名 | 📝 |
| `responsible_person` | String | 责任人 ID | 📝 |
| `responsible_person_name` | String | 责任人姓名 | 📝 |
| `manager_name` | String | 管理人员姓名 | 📝 |
| `cruise_preset_tokens_json` | String | 当前巡航预置点 token JSON | ✅ |
| `cruise_dwell_seconds` | Number | 巡航停留秒数 | ✅ |
| `cruise_rounds` | Number | 巡航轮数，空表示持续巡航 | ✅ |

**新增字段说明**：`company`, `project`, `grid`, `team` 为穿透式责任管理组织架构字段，在代码中已实际添加。

建议索引：`id`、`device_serial`、`status`、`project`、`grid_id`、`team_id`。

### 11. `fence` ⚠️

电子围栏集合。

| 字段 | 类型 | 中文说明 | 状态 |
|---|---|---|---|
| `_id` | ObjectId | MongoDB 主键 | ✅ |
| `fence_id` | String | 围栏业务 ID（时间戳生成） | 🔧 |
| `name` | String | 围栏名称 | ✅ |
| `company` | String | 所属公司 | 🔧 |
| `project` | String | 所属项目名称 | 🔧 |
| `project_id` | String/Number | 所属项目 ID（遗留字段，现主要用 `project`） | 📝 |
| `project_region_id` | String/Number | 所属项目区域 ID | ✅ |
| `shape` | String | 围栏形状，如 `polygon`、`circle` | ✅ |
| `behavior` | String | 管控类型，如 `No Entry`、`No Exit` | ✅ |
| `severity` | String | 告警严重等级，如 `high`、`medium`、`low`、`severe` | 🔧 |
| `geometry` | Object | 几何数据：`{center: [lat, lng], radius: number}` 或 `{points: [[lat, lng], ...]}` | 🔧 |
| `schedule` | Object | 生效时间段：`{start: ISO时间, end: ISO时间}` | 🔧 |
| `effective_time` | String | 每日生效时间，如 `00:00-23:59` | ✅ |
| `worker_count` | Number | 当前相关人员数量 | ✅ |
| `remark` | String | 备注 | ✅ |
| `alarm_type` | String | 告警等级，如 `high`、`medium`、`low` | ✅ |
| `is_active` | Boolean | 是否启用，`true` 启用，`false` 禁用 | 🔧 |
| `createdAt` | String/Date | 创建时间（ISO 格式） | 🔧 |
| `updatedAt` | String/Date | 更新时间（ISO 格式） | 🔧 |

**废弃字段说明**：
- `coordinates_json`：已废弃，坐标数据现存储在 `geometry` 对象中
- `radius`：已废弃，圆形半径现存储在 `geometry.radius` 中

**新增字段说明**：
- `fence_id`：代码实际使用的业务 ID 字段（替代文档中的 `id`）
- `company`、`project`：穿透式责任管理组织架构字段
- `severity`：与 `alarm_type` 并存的严重等级字段
- `geometry`：统一的几何数据对象，支持圆形（center + radius）和多边形（points）
- `schedule`：生效时间段对象，替代原有的单一时间字段

建议索引：`fence_id`、`project`、`project_region_id`、`is_active`。

### 12. `project_region`

项目区域集合，用于电子围栏和项目区域管理。

| 字段 | 类型 | 中文说明 |
|---|---|---|
| `_id` | ObjectId | MongoDB 主键 |
| `id` | Number/String | 区域业务 ID |
| `name` | String | 区域名称 |
| `coordinates_json` | String | 区域坐标 JSON |
| `remark` | String | 备注 |
| `project_id` | String/Number | 所属项目 ID |
| `created_at` | Date/String | 创建时间 |
| `updated_at` | Date/String | 更新时间 |

建议索引：`id`、`project_id`。

### 13. `alarm_record`

告警记录集合。

| 字段 | 类型 | 中文说明 |
|---|---|---|
| `_id` | ObjectId | MongoDB 主键 |
| `id` | Number/String | 告警业务 ID |
| `device_id` | String | 触发设备 ID |
| `device_name` | String | 触发设备名称 |
| `fence_id` | Number/String | 关联围栏 ID |
| `project_id` | Number/String | 关联项目 ID |
| `grid_id` | String | 关联网格 ID |
| `team_id` | String | 关联班组 ID |
| `alarm_type` | String | 告警类型 |
| `severity` | String | 告警等级，如 `low`、`medium`、`high` |
| `timestamp` | Date/String | 告警时间 |
| `description` | String | 告警描述 |
| `status` | String | 处理状态，如 `pending`、`resolved` |
| `handled_at` | Date/String | 处理时间 |
| `handler` | String | 处理人 |
| `remark` | String | 处理备注 |
| `location` | String | 告警位置描述 |
| `recording_path` | String | 告警录像路径 |
| `recording_status` | String | 录像状态，如 `pending`、`success`、`failed` |
| `recording_error` | String | 录像错误信息 |
| `alarm_image_path` | String | 告警图片路径 |
| `personnel_id` | String | 关联人员 ID |
| `person_name` | String | 关联人员姓名 |
| `source_type` | String | 告警来源，如 `fence`、`video`、`ai` |

建议索引：`id`、`device_id`、`project_id`、`fence_id`、`timestamp`、`status`、`source_type`。

### 14. `system_log`

系统操作日志集合。

| 字段 | 类型 | 中文说明 |
|---|---|---|
| `_id` | ObjectId | MongoDB 主键 |
| `id` | Number/String | 日志业务 ID |
| `operator` | String | 操作人 |
| `action` | String | 操作行为 |
| `target_type` | String | 操作对象类型 |
| `target_name` | String | 操作对象名称 |
| `details` | String | 操作详情 |
| `company` | String | 所属公司 |
| `project` | String | 所属项目 |
| `team` | String | 所属班组 |
| `extra` | Object | 扩展信息 |
| `time` | Date | 操作时间 |

建议索引：`time`、`operator`、`target_type`。

### 15. `role_permissions`

角色权限配置集合。

| 字段 | 类型 | 中文说明 |
|---|---|---|
| `_id` | ObjectId | MongoDB 主键 |
| `level` | String | 权限等级 |
| `name` | String | 权限等级中文名称 |
| `permissions` | Array<String> | 权限码列表 |
| `created_at` | Date | 创建时间 |
| `updated_at` | Date | 更新时间 |

建议索引：`level` 唯一索引。

### 16. `counters`

自增 ID 序列集合。

| 字段 | 类型 | 中文说明 |
|---|---|---|
| `_id` | String | 序列名称，如 `user_id`、`alarm_record_id` |
| `seq` | Number | 当前序列值 |

## 通信与通话集合

### 17. `tts_message_job`

TTS 语音播报任务队列。

| 字段 | 类型 | 中文说明 |
|---|---|---|
| `_id` | ObjectId | MongoDB 主键 |
| `batch_id` | String | 批次 ID |
| `device_phone` | String | 目标终端手机号 |
| `device_name` | String | 目标设备名称 |
| `text` | String | 播报文本 |
| `status` | String | 任务状态，如 `queued`、`sending`、`acked`、`retry_wait`、`failed` |
| `priority` | Number | 优先级 |
| `retry_count` | Number | 已重试次数 |
| `max_retries` | Number | 最大重试次数 |
| `next_retry_at` | Date | 下次重试时间 |
| `request_source` | String | 请求来源，如 `group_call` |
| `operator` | String | 操作人 |
| `jt808_sequence` | Number | JT808 消息序号 |
| `sent_at` | Date | 发送时间 |
| `acked_at` | Date | 确认时间 |
| `finished_at` | Date | 完成时间 |
| `last_error` | String | 最后错误信息 |
| `created_at` | Date | 创建时间 |
| `updated_at` | Date | 更新时间 |

建议索引：`batch_id`、`device_phone`、`status`、`created_at`、`next_retry_at`。

### 18. `group_calls`

旧版群组通话会话。当前可保留兼容，后续可以逐步由 `app_voice_call_rooms` 替代。

| 字段 | 类型 | 中文说明 |
|---|---|---|
| `_id` | ObjectId | MongoDB 主键 |
| `id` | Number/String | 会话业务 ID |
| `room_id` | String | 房间 ID |
| `initiator_id` | Number/String | 发起人 ID |
| `member_ids` | Array/String | 成员 ID 列表 |
| `start_time` | Date | 开始时间 |
| `end_time` | Date | 结束时间 |
| `status` | String | 状态，如 `ACTIVE`、`ENDED` |

### 19. `voice_records`

语音记录集合。

| 字段 | 类型 | 中文说明 |
|---|---|---|
| `_id` | ObjectId | MongoDB 主键 |
| `room_id` | String | 房间 ID |
| `initiator_id` | String | 发起人 ID |
| `member_ids` | Array<String> | 成员 ID 列表 |
| `start_time` | Date | 开始时间 |
| `end_time` | Date | 结束时间 |
| `duration_seconds` | Number | 通话时长，单位秒 |
| `status` | String | 通话状态 |
| `created_at` | Date | 创建时间 |

### 20. `app_voice_call_rooms`

安卓/网页实时语音通话房间。

| 字段 | 类型 | 中文说明 |
|---|---|---|
| `_id` | ObjectId | MongoDB 主键 |
| `room_id` | String | 房间 ID |
| `agora_channel` | String | Agora 频道名 |
| `title` | String | 通话标题 |
| `type` | String | 通话类型，如 `agora_voice_call` |
| `status` | String | 房间状态，如 `calling`、`active`、`ended`、`cancelled`、`missed` |
| `initiator_id` | String | 发起人 ID |
| `members` | Array<Object> | 成员列表 |
| `created_at` | Date | 创建时间 |
| `updated_at` | Date | 更新时间 |
| `started_at` | Date | 开始时间 |
| `ended_at` | Date | 结束时间 |

`members` 子字段：

| 字段 | 类型 | 中文说明 |
|---|---|---|
| `user_id` | String | 用户 ID |
| `name` | String | 用户姓名 |
| `client_type` | String | 客户端类型，如 `app`、`web` |
| `role` | String | 通话角色，如 `initiator`、`member` |
| `status` | String | 成员状态，如 `invited`、`ringing`、`joined`、`rejected`、`left`、`missed` |
| `agora_uid` | Number | Agora UID |
| `muted` | Boolean | 是否静音 |
| `invited_at` | Date | 邀请时间 |
| `joined_at` | Date | 加入时间 |
| `left_at` | Date | 离开时间 |
| `rejected_at` | Date | 拒绝时间 |

建议索引：`room_id` 唯一索引，`status`、`initiator_id`、`created_at`。

### 21. `app_voice_call_records`

安卓/网页语音通话归档记录。

| 字段 | 类型 | 中文说明 |
|---|---|---|
| `_id` | ObjectId | MongoDB 主键 |
| `room_id` | String | 房间 ID |
| `title` | String | 通话标题 |
| `initiator_id` | String | 发起人 ID |
| `status` | String | 最终状态 |
| `members` | Array<Object> | 成员列表 |
| `started_at` | Date | 开始时间 |
| `ended_at` | Date | 结束时间 |
| `created_at` | Date | 创建时间 |
| `updated_at` | Date | 更新时间 |

建议索引：`room_id` 唯一索引，`initiator_id`、`started_at`。

### 22. `app_voice_call_uid_map`

Agora UID 映射集合。

| 字段 | 类型 | 中文说明 |
|---|---|---|
| `_id` | ObjectId | MongoDB 主键 |
| `identity_key` | String | 用户与客户端组合键 |
| `user_id` | String | 用户 ID |
| `client_type` | String | 客户端类型 |
| `agora_uid` | Number | Agora UID |
| `created_at` | Date | 创建时间 |
| `updated_at` | Date | 更新时间 |

建议索引：`identity_key` 唯一索引，`agora_uid` 唯一索引。

## 可选或兼容集合

这些集合当前代码中可能出现，但不建议作为新业务的主要集合继续扩展。

| 集合 | 处理建议 | 说明 |
|---|---|---|
| `worker` | 可选兼容 | 与 `personnel` 职责重叠 |
| `branches` | 兼容保留 | 与 `branch` 重复，当前建议主用 `branch` |
| `projects` | 兼容保留 | 与 `project` 重复，当前建议主用 `project` |
| `project_device` / `project_devices` | 可选 | 项目与设备多对多关系表，如需要精细绑定可保留 |
| `device_location_history` | 可选增强 | 可作为长期轨迹集合；当前轨迹主要在 `device.trajectory` |
| `sql_personnel` | 迁移兼容 | SQL 迁移遗留数据 |
| `sql_devices` | 迁移兼容 | SQL 迁移遗留数据 |
| `sql_projects` | 迁移兼容 | SQL 迁移遗留数据 |
| `sql_branches` | 迁移兼容 | SQL 迁移遗留数据 |

## 代码中新增但未在文档中的集合

以下集合在实际代码中已使用，但本文档之前未包含：

### `attendance_record` ✅
考勤记录集合。

| 字段 | 类型 | 中文说明 |
|---|---|---|
| `_id` | ObjectId | MongoDB 主键 |
| `personnel_id` | String | 人员 ID |
| `device_id` | String | 设备 ID |
| `check_in_time` | Date | 签到时间 |
| `check_out_time` | Date | 签退时间 |
| `status` | String | 考勤状态 |
| `created_at` | Date | 创建时间 |

### `fence_device` ✅
围栏设备关联集合。

| 字段 | 类型 | 中文说明 |
|---|---|---|
| `_id` | ObjectId | MongoDB 主键 |
| `fence_id` | String | 围栏 ID |
| `device_id` | String | 设备 ID |
| `created_at` | Date | 创建时间 |

### `auth_login_state` ✅
登录状态集合。

| 字段 | 类型 | 中文说明 |
|---|---|---|
| `_id` | ObjectId | MongoDB 主键 |
| `username` | String | 用户名 |
| `login_time` | Date | 登录时间 |
| `ip_address` | String | IP 地址 |
| `status` | String | 状态 |

## 推荐索引汇总

```javascript
db.users.createIndex({ username: 1 }, { unique: true })
db.auth_sessions.createIndex({ token: 1 }, { unique: true })
db.auth_sessions.createIndex({ expires_at: 1 })

db.personnel.createIndex({ phone: 1 })
db.personnel.createIndex({ employeeId: 1 })
db.personnel.createIndex({ projectId: 1, gridId: 1, teamId: 1 })

db.branch.createIndex({ id: 1 })
db.branch.createIndex({ name: 1 })

db.project.createIndex({ id: 1 })
db.project.createIndex({ branch_id: 1 })
db.project.createIndex({ status: 1 })

db.grid.createIndex({ grid_id: 1 }, { unique: true })
db.grid.createIndex({ project_id: 1, level: 1 })
db.grid.createIndex({ status: 1 })

db.team.createIndex({ team_id: 1 }, { unique: true })
db.team.createIndex({ project_id: 1, grid_id: 1 })

db.responsibility_unit.createIndex({ unit_id: 1 }, { unique: true })
db.responsibility_unit.createIndex({ parent_id: 1 })
db.responsibility_unit.createIndex({ project_id: 1, grid_id: 1, team_id: 1 })

db.device.createIndex({ device_id: 1 }, { unique: true })
db.device.createIndex({ holderPhone: 1 })
db.device.createIndex({ project: 1, team: 1, status: 1 })

db.video_device.createIndex({ id: 1 })
db.video_device.createIndex({ device_serial: 1 })
db.video_device.createIndex({ project: 1, grid_id: 1, team_id: 1 })
db.video_device.createIndex({ status: 1 })

db.fence.createIndex({ id: 1 })
db.fence.createIndex({ project_id: 1, is_active: 1 })

db.alarm_record.createIndex({ id: 1 })
db.alarm_record.createIndex({ device_id: 1, timestamp: -1 })
db.alarm_record.createIndex({ project_id: 1, status: 1, timestamp: -1 })
db.alarm_record.createIndex({ source_type: 1 })

db.system_log.createIndex({ time: -1 })
db.system_log.createIndex({ operator: 1 })

db.role_permissions.createIndex({ level: 1 }, { unique: true })

db.tts_message_job.createIndex({ batch_id: 1 })
db.tts_message_job.createIndex({ status: 1, next_retry_at: 1 })
db.tts_message_job.createIndex({ device_phone: 1 })

db.app_voice_call_rooms.createIndex({ room_id: 1 }, { unique: true })
db.app_voice_call_rooms.createIndex({ status: 1, created_at: -1 })
db.app_voice_call_records.createIndex({ room_id: 1 }, { unique: true })
db.app_voice_call_records.createIndex({ initiator_id: 1, started_at: -1 })
db.app_voice_call_uid_map.createIndex({ identity_key: 1 }, { unique: true })
db.app_voice_call_uid_map.createIndex({ agora_uid: 1 }, { unique: true })
```

## 后续优化建议

1. 短期不改代码时，继续使用当前集合名：`device`、`grid`、`video_device`、`fence`、`alarm_record`。
2. 中期可把 `branch/branches`、`project/projects` 这类重复集合统一，避免同一业务数据散落两处。
3. 轨迹数据量增长后，应从 `device.trajectory` 拆出独立集合，例如 `device_location_history`，字段包含 `device_id`、`lat`、`lng`、`speed`、`direction`、`timestamp`。
4. 密码字段后续应只保留 `hashed_password`，不要长期保留明文 `password`。
5. 告警、日志、轨迹、TTS 任务等高增长集合建议定期归档或设置冷热数据策略。
