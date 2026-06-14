package com.app.myapplication.data.model;

import com.google.gson.annotations.SerializedName;

import java.util.List;

/**
 * 系统全局设置数据模型
 * 与 Web 端 SettingsView.tsx 中的 SystemSettings 接口对齐
 */
public class SystemSettings {

    // ==================== 通用设置 ====================
    @SerializedName("systemName")
    private String systemName = "中铁一局智能安全管理系统";

    @SerializedName("theme")
    private String theme = "dark";

    @SerializedName("language")
    private String language = "zh";

    @SerializedName("timezone")
    private String timezone = "Asia/Shanghai";

    @SerializedName("tablePageSize")
    private int tablePageSize = 20;

    @SerializedName("autoLogoutMinutes")
    private int autoLogoutMinutes = 30;

    @SerializedName("confirmBeforeDelete")
    private boolean confirmBeforeDelete = true;

    @SerializedName("coordinatePrecision")
    private int coordinatePrecision = 6;

    // ==================== 告警设置 ====================
    @SerializedName("alarmPopup")
    private boolean alarmPopup = true;

    @SerializedName("alarmSound")
    private boolean alarmSound = true;

    @SerializedName("alarmSoundType")
    private String alarmSoundType = "standard";

    @SerializedName("alarmRepeatInterval")
    private int alarmRepeatInterval = 5;

    @SerializedName("alarmAutoResolve")
    private boolean alarmAutoResolve = false;

    @SerializedName("alarmRetentionDays")
    private int alarmRetentionDays = 30;

    @SerializedName("safetyProductionDays")
    private int safetyProductionDays = 0;

    @SerializedName("safetyProductionUpdatedDate")
    private String safetyProductionUpdatedDate = "";

    @SerializedName("alarmSevereFlash")
    private boolean alarmSevereFlash = true;

    @SerializedName("alarmSevereUpgrade")
    private String alarmSevereUpgrade = "sound";

    // 告警分级开关
    @SerializedName("alarmSosEnabled")
    private boolean alarmSosEnabled = true;

    @SerializedName("alarmFenceEnabled")
    private boolean alarmFenceEnabled = true;

    @SerializedName("alarmLowBatteryEnabled")
    private boolean alarmLowBatteryEnabled = true;

    @SerializedName("alarmOfflineEnabled")
    private boolean alarmOfflineEnabled = true;

    // 告警升级规则
    @SerializedName("alarmEscalationEnabled")
    private boolean alarmEscalationEnabled = true;

    @SerializedName("alarmEscalationMinutes")
    private int alarmEscalationMinutes = 5;

    // ==================== 视频设置 ====================
    @SerializedName("videoRetentionDays")
    private int videoRetentionDays = 15;

    @SerializedName("videoQuality")
    private String videoQuality = "high";

    @SerializedName("videoSegmentMinutes")
    private int videoSegmentMinutes = 30;

    @SerializedName("videoStorageType")
    private String videoStorageType = "local";

    @SerializedName("videoStoragePath")
    private String videoStoragePath = "./backend/static";

    @SerializedName("alarmVideoRetentionDays")
    private int alarmVideoRetentionDays = 90;

    @SerializedName("alarmVideoSurroundMinutes")
    private double alarmVideoSurroundMinutes = 1;

    @SerializedName("alarmScreenshotRetentionDays")
    private int alarmScreenshotRetentionDays = 90;

    // ==================== 存储空间管理 ====================
    @SerializedName("storageMaxSizeGB")
    private int storageMaxSizeGB = 500;

    @SerializedName("storageWarningThreshold")
    private int storageWarningThreshold = 80;

    @SerializedName("storageCriticalThreshold")
    private int storageCriticalThreshold = 95;

    @SerializedName("storageAutoCleanup")
    private boolean storageAutoCleanup = true;

    @SerializedName("storageCleanupStrategy")
    private String storageCleanupStrategy = "both";

    // ==================== 围栏设置 ====================
    @SerializedName("fenceDetectionInterval")
    private int fenceDetectionInterval = 3;

    @SerializedName("fenceDefaultRadius")
    private int fenceDefaultRadius = 50;

    @SerializedName("fenceRetentionDays")
    private int fenceRetentionDays = 365;

    @SerializedName("fenceGracePeriod")
    private int fenceGracePeriod = 0;

    @SerializedName("fenceAlarmSilenceMinutes")
    private int fenceAlarmSilenceMinutes = 1;

    @SerializedName("fenceDefaultBehavior")
    private String fenceDefaultBehavior = "No Entry";

    @SerializedName("fenceDefaultSeverity")
    private String fenceDefaultSeverity = "normal";

    @SerializedName("trackRetentionDays")
    private int trackRetentionDays = 30;

    @SerializedName("trackSimplifyPrecision")
    private int trackSimplifyPrecision = 5;

    @SerializedName("trackRecordInterval")
    private int trackRecordInterval = 10;

    @SerializedName("stationaryReminderEnabled")
    private boolean stationaryReminderEnabled = false;

    @SerializedName("stationaryReminderMinutes")
    private int stationaryReminderMinutes = 30;

    @SerializedName("passwordExpireDays")
    private int passwordExpireDays = 90;

    // ==================== 日志设置 ====================
    @SerializedName("logRetentionDays")
    private int logRetentionDays = 90;

    @SerializedName("logAutoClean")
    private boolean logAutoClean = true;

    @SerializedName("logLevel")
    private String logLevel = "all";

    @SerializedName("logOperation")
    private boolean logOperation = true;

    @SerializedName("logLogin")
    private boolean logLogin = true;

    @SerializedName("logAlarm")
    private boolean logAlarm = true;

    @SerializedName("logConfig")
    private boolean logConfig = true;

    @SerializedName("logAuditEnabled")
    private boolean logAuditEnabled = true;

    @SerializedName("logDiffEnabled")
    private boolean logDiffEnabled = false;

    @SerializedName("logExportEncoding")
    private String logExportEncoding = "utf8";

    @SerializedName("logLoginFailedAlert")
    private int logLoginFailedAlert = 5;

    @SerializedName("logErrorReport")
    private boolean logErrorReport = true;

    @SerializedName("logAutoCompress")
    private boolean logAutoCompress = true;

    // ==================== 通知设置 ====================
    @SerializedName("smsNotification")
    private boolean smsNotification = false;

    @SerializedName("callNotification")
    private boolean callNotification = false;

    @SerializedName("smsApiUrl")
    private String smsApiUrl = "https://sms.example.com/api";

    @SerializedName("smsApiKey")
    private String smsApiKey = "";

    @SerializedName("smsSign")
    private String smsSign = "【安全管理系统】";

    @SerializedName("smsTemplateId")
    private String smsTemplateId = "SMS_123456";

    @SerializedName("callApiUrl")
    private String callApiUrl = "https://call.example.com/api";

    @SerializedName("callApiKey")
    private String callApiKey = "";

    @SerializedName("notifySevereBySms")
    private boolean notifySevereBySms = true;

    @SerializedName("notifySevereByCall")
    private boolean notifySevereByCall = true;

    @SerializedName("notifyMediumBySms")
    private boolean notifyMediumBySms = false;

    @SerializedName("notifyMediumByCall")
    private boolean notifyMediumByCall = false;

    @SerializedName("notifyLowBySms")
    private boolean notifyLowBySms = false;

    @SerializedName("notifyLowByCall")
    private boolean notifyLowByCall = false;

    // ==================== 备份设置 ====================
    @SerializedName("autoBackup")
    private boolean autoBackup = true;

    @SerializedName("backupFrequency")
    private String backupFrequency = "daily";

    @SerializedName("backupTime")
    private String backupTime = "02:00";

    @SerializedName("backupRetention")
    private int backupRetention = 7;

    // ==================== 账号安全 ====================
    @SerializedName("forceInitialPasswordChange")
    private boolean forceInitialPasswordChange = true;

    @SerializedName("passwordMinLength")
    private int passwordMinLength = 8;

    @SerializedName("passwordRequireComplexity")
    private boolean passwordRequireComplexity = true;

    @SerializedName("loginAttempts")
    private int loginAttempts = 5;

    @SerializedName("lockoutDuration")
    private int lockoutDuration = 30;

    @SerializedName("maxConcurrentSessions")
    private int maxConcurrentSessions = 3;

    // ==================== 各级管理员默认权限 ====================
    @SerializedName("hqAdminPermissions")
    private List<String> hqAdminPermissions;

    @SerializedName("branchAdminPermissions")
    private List<String> branchAdminPermissions;

    @SerializedName("projectAdminPermissions")
    private List<String> projectAdminPermissions;

    @SerializedName("gridAdminPermissions")
    private List<String> gridAdminPermissions;

    @SerializedName("teamAdminPermissions")
    private List<String> teamAdminPermissions;

    // ==================== AI 助手设置 ====================
    @SerializedName("aiServiceUrl")
    private String aiServiceUrl = "/api/ai";

    @SerializedName("aiEnableRAG")
    private boolean aiEnableRAG = true;

    @SerializedName("aiKbName")
    private String aiKbName = "default";

    @SerializedName("aiModelName")
    private String aiModelName = "DeepSeek-R1-Distill-Qwen-7B-F16";

    @SerializedName("aiVectorDbPath")
    private String aiVectorDbPath = "./vector_db";

    // AI检测行为告警等级配置
    @SerializedName("aiAlarmLevelConfigs")
    private List<AIAlgorithmConfig> aiAlarmLevelConfigs;

    // AI助手额外配置
    @SerializedName("aiApiUrl")
    private String aiApiUrl = "";

    @SerializedName("aiApiKey")
    private String aiApiKey = "";

    @SerializedName("aiTemperature")
    private float aiTemperature = 0.7f;

    @SerializedName("aiMaxTokens")
    private int aiMaxTokens = 2048;

    @SerializedName("aiContextRounds")
    private int aiContextRounds = 10;

    @SerializedName("aiSystemPrompt")
    private String aiSystemPrompt = "";

    // 日志设置别名（用于兼容性）
    @SerializedName("logAudit")
    private boolean logAudit = true;

    @SerializedName("logDiff")
    private boolean logDiff = false;

    @SerializedName("logEncoding")
    private String logEncoding = "UTF-8";

    @SerializedName("loginFailedAlertThreshold")
    private int loginFailedAlertThreshold = 5;

    // 通知设置别名
    @SerializedName("smsNotificationEnabled")
    private boolean smsNotificationEnabled = false;

    @SerializedName("callNotificationEnabled")
    private boolean callNotificationEnabled = false;

    @SerializedName("severeSmsEnabled")
    private boolean severeSmsEnabled = true;

    @SerializedName("severeCallEnabled")
    private boolean severeCallEnabled = true;

    @SerializedName("mediumSmsEnabled")
    private boolean mediumSmsEnabled = false;

    @SerializedName("mediumCallEnabled")
    private boolean mediumCallEnabled = false;

    @SerializedName("lowSmsEnabled")
    private boolean lowSmsEnabled = false;

    @SerializedName("lowCallEnabled")
    private boolean lowCallEnabled = false;

    // 备份设置别名
    @SerializedName("autoBackupEnabled")
    private boolean autoBackupEnabled = true;

    @SerializedName("backupRetentionCount")
    private int backupRetentionCount = 7;

    // 账号安全设置别名
    @SerializedName("forcePasswordChange")
    private boolean forcePasswordChange = true;

    @SerializedName("passwordComplexity")
    private boolean passwordComplexity = true;

    @SerializedName("maxLoginAttempts")
    private int maxLoginAttempts = 5;

    // ==================== 构造函数和 Getter/Setter ====================

    public SystemSettings() {
        // 设置默认权限
        hqAdminPermissions = java.util.Arrays.asList("dashboard", "monitor", "fence", "device", "personnel", "alarm", "system");
        branchAdminPermissions = java.util.Arrays.asList("dashboard", "monitor", "fence", "device", "personnel", "alarm");
        projectAdminPermissions = java.util.Arrays.asList("dashboard", "monitor", "fence", "device.view", "personnel.view", "alarm");
        gridAdminPermissions = java.util.Arrays.asList("dashboard", "monitor", "fence", "device.view", "personnel.view", "alarm.view");
        teamAdminPermissions = java.util.Arrays.asList("dashboard", "monitor.view", "personnel.view", "alarm.view");
    }

    // Getters and Setters
    public String getSystemName() { return systemName; }
    public void setSystemName(String systemName) { this.systemName = systemName; }

    public String getTheme() { return theme; }
    public void setTheme(String theme) { this.theme = theme; }

    public String getLanguage() { return language; }
    public void setLanguage(String language) { this.language = language; }

    public String getTimezone() { return timezone; }
    public void setTimezone(String timezone) { this.timezone = timezone; }

    public int getTablePageSize() { return tablePageSize; }
    public void setTablePageSize(int tablePageSize) { this.tablePageSize = tablePageSize; }

    public int getAutoLogoutMinutes() { return autoLogoutMinutes; }
    public void setAutoLogoutMinutes(int autoLogoutMinutes) { this.autoLogoutMinutes = autoLogoutMinutes; }

    public boolean isConfirmBeforeDelete() { return confirmBeforeDelete; }
    public void setConfirmBeforeDelete(boolean confirmBeforeDelete) { this.confirmBeforeDelete = confirmBeforeDelete; }

    public int getCoordinatePrecision() { return coordinatePrecision; }
    public void setCoordinatePrecision(int coordinatePrecision) { this.coordinatePrecision = coordinatePrecision; }

    public boolean isAlarmPopup() { return alarmPopup; }
    public void setAlarmPopup(boolean alarmPopup) { this.alarmPopup = alarmPopup; }

    public boolean isAlarmSound() { return alarmSound; }
    public void setAlarmSound(boolean alarmSound) { this.alarmSound = alarmSound; }

    public String getAlarmSoundType() { return alarmSoundType; }
    public void setAlarmSoundType(String alarmSoundType) { this.alarmSoundType = alarmSoundType; }

    public int getAlarmRepeatInterval() { return alarmRepeatInterval; }
    public void setAlarmRepeatInterval(int alarmRepeatInterval) { this.alarmRepeatInterval = alarmRepeatInterval; }

    public boolean isAlarmAutoResolve() { return alarmAutoResolve; }
    public void setAlarmAutoResolve(boolean alarmAutoResolve) { this.alarmAutoResolve = alarmAutoResolve; }

    public int getAlarmRetentionDays() { return alarmRetentionDays; }
    public void setAlarmRetentionDays(int alarmRetentionDays) { this.alarmRetentionDays = alarmRetentionDays; }

    public int getSafetyProductionDays() { return safetyProductionDays; }
    public void setSafetyProductionDays(int safetyProductionDays) { this.safetyProductionDays = safetyProductionDays; }

    public String getSafetyProductionUpdatedDate() { return safetyProductionUpdatedDate; }
    public void setSafetyProductionUpdatedDate(String safetyProductionUpdatedDate) { this.safetyProductionUpdatedDate = safetyProductionUpdatedDate; }

    public boolean isAlarmSevereFlash() { return alarmSevereFlash; }
    public void setAlarmSevereFlash(boolean alarmSevereFlash) { this.alarmSevereFlash = alarmSevereFlash; }

    public String getAlarmSevereUpgrade() { return alarmSevereUpgrade; }
    public void setAlarmSevereUpgrade(String alarmSevereUpgrade) { this.alarmSevereUpgrade = alarmSevereUpgrade; }

    public boolean isAlarmSosEnabled() { return alarmSosEnabled; }
    public void setAlarmSosEnabled(boolean alarmSosEnabled) { this.alarmSosEnabled = alarmSosEnabled; }

    public boolean isAlarmFenceEnabled() { return alarmFenceEnabled; }
    public void setAlarmFenceEnabled(boolean alarmFenceEnabled) { this.alarmFenceEnabled = alarmFenceEnabled; }

    public boolean isAlarmLowBatteryEnabled() { return alarmLowBatteryEnabled; }
    public void setAlarmLowBatteryEnabled(boolean alarmLowBatteryEnabled) { this.alarmLowBatteryEnabled = alarmLowBatteryEnabled; }

    public boolean isAlarmOfflineEnabled() { return alarmOfflineEnabled; }
    public void setAlarmOfflineEnabled(boolean alarmOfflineEnabled) { this.alarmOfflineEnabled = alarmOfflineEnabled; }

    public boolean isAlarmEscalationEnabled() { return alarmEscalationEnabled; }
    public void setAlarmEscalationEnabled(boolean alarmEscalationEnabled) { this.alarmEscalationEnabled = alarmEscalationEnabled; }

    public int getAlarmEscalationMinutes() { return alarmEscalationMinutes; }
    public void setAlarmEscalationMinutes(int alarmEscalationMinutes) { this.alarmEscalationMinutes = alarmEscalationMinutes; }

    public int getVideoRetentionDays() { return videoRetentionDays; }
    public void setVideoRetentionDays(int videoRetentionDays) { this.videoRetentionDays = videoRetentionDays; }

    public String getVideoQuality() { return videoQuality; }
    public void setVideoQuality(String videoQuality) { this.videoQuality = videoQuality; }

    public int getVideoSegmentMinutes() { return videoSegmentMinutes; }
    public void setVideoSegmentMinutes(int videoSegmentMinutes) { this.videoSegmentMinutes = videoSegmentMinutes; }

    public String getVideoStorageType() { return videoStorageType; }
    public void setVideoStorageType(String videoStorageType) { this.videoStorageType = videoStorageType; }

    public String getVideoStoragePath() { return videoStoragePath; }
    public void setVideoStoragePath(String videoStoragePath) { this.videoStoragePath = videoStoragePath; }

    public int getAlarmVideoRetentionDays() { return alarmVideoRetentionDays; }
    public void setAlarmVideoRetentionDays(int alarmVideoRetentionDays) { this.alarmVideoRetentionDays = alarmVideoRetentionDays; }

    public double getAlarmVideoSurroundMinutes() { return alarmVideoSurroundMinutes; }
    public void setAlarmVideoSurroundMinutes(double alarmVideoSurroundMinutes) { this.alarmVideoSurroundMinutes = alarmVideoSurroundMinutes; }

    public int getAlarmScreenshotRetentionDays() { return alarmScreenshotRetentionDays; }
    public void setAlarmScreenshotRetentionDays(int alarmScreenshotRetentionDays) { this.alarmScreenshotRetentionDays = alarmScreenshotRetentionDays; }

    public int getStorageMaxSizeGB() { return storageMaxSizeGB; }
    public void setStorageMaxSizeGB(int storageMaxSizeGB) { this.storageMaxSizeGB = storageMaxSizeGB; }

    public int getStorageWarningThreshold() { return storageWarningThreshold; }
    public void setStorageWarningThreshold(int storageWarningThreshold) { this.storageWarningThreshold = storageWarningThreshold; }

    public int getStorageCriticalThreshold() { return storageCriticalThreshold; }
    public void setStorageCriticalThreshold(int storageCriticalThreshold) { this.storageCriticalThreshold = storageCriticalThreshold; }

    public boolean isStorageAutoCleanup() { return storageAutoCleanup; }
    public void setStorageAutoCleanup(boolean storageAutoCleanup) { this.storageAutoCleanup = storageAutoCleanup; }

    public String getStorageCleanupStrategy() { return storageCleanupStrategy; }
    public void setStorageCleanupStrategy(String storageCleanupStrategy) { this.storageCleanupStrategy = storageCleanupStrategy; }

    public int getFenceDetectionInterval() { return fenceDetectionInterval; }
    public void setFenceDetectionInterval(int fenceDetectionInterval) { this.fenceDetectionInterval = fenceDetectionInterval; }

    public int getFenceDefaultRadius() { return fenceDefaultRadius; }
    public void setFenceDefaultRadius(int fenceDefaultRadius) { this.fenceDefaultRadius = fenceDefaultRadius; }

    public int getFenceRetentionDays() { return fenceRetentionDays; }
    public void setFenceRetentionDays(int fenceRetentionDays) { this.fenceRetentionDays = fenceRetentionDays; }

    public int getFenceGracePeriod() { return fenceGracePeriod; }
    public void setFenceGracePeriod(int fenceGracePeriod) { this.fenceGracePeriod = fenceGracePeriod; }

    public int getFenceAlarmSilenceMinutes() { return fenceAlarmSilenceMinutes; }
    public void setFenceAlarmSilenceMinutes(int fenceAlarmSilenceMinutes) { this.fenceAlarmSilenceMinutes = fenceAlarmSilenceMinutes; }

    public String getFenceDefaultBehavior() { return fenceDefaultBehavior; }
    public void setFenceDefaultBehavior(String fenceDefaultBehavior) { this.fenceDefaultBehavior = fenceDefaultBehavior; }

    public String getFenceDefaultSeverity() { return fenceDefaultSeverity; }
    public void setFenceDefaultSeverity(String fenceDefaultSeverity) { this.fenceDefaultSeverity = fenceDefaultSeverity; }

    public int getTrackRetentionDays() { return trackRetentionDays; }
    public void setTrackRetentionDays(int trackRetentionDays) { this.trackRetentionDays = trackRetentionDays; }

    public int getTrackSimplifyPrecision() { return trackSimplifyPrecision; }
    public void setTrackSimplifyPrecision(int trackSimplifyPrecision) { this.trackSimplifyPrecision = trackSimplifyPrecision; }

    public int getTrackRecordInterval() { return trackRecordInterval; }
    public void setTrackRecordInterval(int trackRecordInterval) { this.trackRecordInterval = trackRecordInterval; }

    public boolean isStationaryReminderEnabled() { return stationaryReminderEnabled; }
    public void setStationaryReminderEnabled(boolean stationaryReminderEnabled) { this.stationaryReminderEnabled = stationaryReminderEnabled; }

    public int getStationaryReminderMinutes() { return stationaryReminderMinutes; }
    public void setStationaryReminderMinutes(int stationaryReminderMinutes) { this.stationaryReminderMinutes = stationaryReminderMinutes; }

    public int getPasswordExpireDays() { return passwordExpireDays; }
    public void setPasswordExpireDays(int passwordExpireDays) { this.passwordExpireDays = passwordExpireDays; }

    public int getLogRetentionDays() { return logRetentionDays; }
    public void setLogRetentionDays(int logRetentionDays) { this.logRetentionDays = logRetentionDays; }

    public boolean isLogAutoClean() { return logAutoClean; }
    public void setLogAutoClean(boolean logAutoClean) { this.logAutoClean = logAutoClean; }

    public String getLogLevel() { return logLevel; }
    public void setLogLevel(String logLevel) { this.logLevel = logLevel; }

    public boolean isLogOperation() { return logOperation; }
    public void setLogOperation(boolean logOperation) { this.logOperation = logOperation; }

    public boolean isLogLogin() { return logLogin; }
    public void setLogLogin(boolean logLogin) { this.logLogin = logLogin; }

    public boolean isLogAlarm() { return logAlarm; }
    public void setLogAlarm(boolean logAlarm) { this.logAlarm = logAlarm; }

    public boolean isLogConfig() { return logConfig; }
    public void setLogConfig(boolean logConfig) { this.logConfig = logConfig; }

    public boolean isLogAuditEnabled() { return logAuditEnabled; }
    public void setLogAuditEnabled(boolean logAuditEnabled) { this.logAuditEnabled = logAuditEnabled; }

    public boolean isLogDiffEnabled() { return logDiffEnabled; }
    public void setLogDiffEnabled(boolean logDiffEnabled) { this.logDiffEnabled = logDiffEnabled; }

    public String getLogExportEncoding() { return logExportEncoding; }
    public void setLogExportEncoding(String logExportEncoding) { this.logExportEncoding = logExportEncoding; }

    public int getLogLoginFailedAlert() { return logLoginFailedAlert; }
    public void setLogLoginFailedAlert(int logLoginFailedAlert) { this.logLoginFailedAlert = logLoginFailedAlert; }

    public boolean isLogErrorReport() { return logErrorReport; }
    public void setLogErrorReport(boolean logErrorReport) { this.logErrorReport = logErrorReport; }

    public boolean isLogAutoCompress() { return logAutoCompress; }
    public void setLogAutoCompress(boolean logAutoCompress) { this.logAutoCompress = logAutoCompress; }

    public boolean isSmsNotification() { return smsNotification; }
    public void setSmsNotification(boolean smsNotification) { this.smsNotification = smsNotification; }

    public boolean isCallNotification() { return callNotification; }
    public void setCallNotification(boolean callNotification) { this.callNotification = callNotification; }

    public String getSmsApiUrl() { return smsApiUrl; }
    public void setSmsApiUrl(String smsApiUrl) { this.smsApiUrl = smsApiUrl; }

    public String getSmsApiKey() { return smsApiKey; }
    public void setSmsApiKey(String smsApiKey) { this.smsApiKey = smsApiKey; }

    public String getSmsSign() { return smsSign; }
    public void setSmsSign(String smsSign) { this.smsSign = smsSign; }

    public String getSmsTemplateId() { return smsTemplateId; }
    public void setSmsTemplateId(String smsTemplateId) { this.smsTemplateId = smsTemplateId; }

    public String getCallApiUrl() { return callApiUrl; }
    public void setCallApiUrl(String callApiUrl) { this.callApiUrl = callApiUrl; }

    public String getCallApiKey() { return callApiKey; }
    public void setCallApiKey(String callApiKey) { this.callApiKey = callApiKey; }

    public boolean isNotifySevereBySms() { return notifySevereBySms; }
    public void setNotifySevereBySms(boolean notifySevereBySms) { this.notifySevereBySms = notifySevereBySms; }

    public boolean isNotifySevereByCall() { return notifySevereByCall; }
    public void setNotifySevereByCall(boolean notifySevereByCall) { this.notifySevereByCall = notifySevereByCall; }

    public boolean isNotifyMediumBySms() { return notifyMediumBySms; }
    public void setNotifyMediumBySms(boolean notifyMediumBySms) { this.notifyMediumBySms = notifyMediumBySms; }

    public boolean isNotifyMediumByCall() { return notifyMediumByCall; }
    public void setNotifyMediumByCall(boolean notifyMediumByCall) { this.notifyMediumByCall = notifyMediumByCall; }

    public boolean isNotifyLowBySms() { return notifyLowBySms; }
    public void setNotifyLowBySms(boolean notifyLowBySms) { this.notifyLowBySms = notifyLowBySms; }

    public boolean isNotifyLowByCall() { return notifyLowByCall; }
    public void setNotifyLowByCall(boolean notifyLowByCall) { this.notifyLowByCall = notifyLowByCall; }

    public boolean isAutoBackup() { return autoBackup; }
    public void setAutoBackup(boolean autoBackup) { this.autoBackup = autoBackup; }

    public String getBackupFrequency() { return backupFrequency; }
    public void setBackupFrequency(String backupFrequency) { this.backupFrequency = backupFrequency; }

    public String getBackupTime() { return backupTime; }
    public void setBackupTime(String backupTime) { this.backupTime = backupTime; }

    public int getBackupRetention() { return backupRetention; }
    public void setBackupRetention(int backupRetention) { this.backupRetention = backupRetention; }

    public boolean isForceInitialPasswordChange() { return forceInitialPasswordChange; }
    public void setForceInitialPasswordChange(boolean forceInitialPasswordChange) { this.forceInitialPasswordChange = forceInitialPasswordChange; }

    public int getPasswordMinLength() { return passwordMinLength; }
    public void setPasswordMinLength(int passwordMinLength) { this.passwordMinLength = passwordMinLength; }

    public boolean isPasswordRequireComplexity() { return passwordRequireComplexity; }
    public void setPasswordRequireComplexity(boolean passwordRequireComplexity) { this.passwordRequireComplexity = passwordRequireComplexity; }

    public int getLoginAttempts() { return loginAttempts; }
    public void setLoginAttempts(int loginAttempts) { this.loginAttempts = loginAttempts; }

    public int getLockoutDuration() { return lockoutDuration; }
    public void setLockoutDuration(int lockoutDuration) { this.lockoutDuration = lockoutDuration; }

    public int getMaxConcurrentSessions() { return maxConcurrentSessions; }
    public void setMaxConcurrentSessions(int maxConcurrentSessions) { this.maxConcurrentSessions = maxConcurrentSessions; }

    public List<String> getHqAdminPermissions() { return hqAdminPermissions; }
    public void setHqAdminPermissions(List<String> hqAdminPermissions) { this.hqAdminPermissions = hqAdminPermissions; }

    public List<String> getBranchAdminPermissions() { return branchAdminPermissions; }
    public void setBranchAdminPermissions(List<String> branchAdminPermissions) { this.branchAdminPermissions = branchAdminPermissions; }

    public List<String> getProjectAdminPermissions() { return projectAdminPermissions; }
    public void setProjectAdminPermissions(List<String> projectAdminPermissions) { this.projectAdminPermissions = projectAdminPermissions; }

    public List<String> getGridAdminPermissions() { return gridAdminPermissions; }
    public void setGridAdminPermissions(List<String> gridAdminPermissions) { this.gridAdminPermissions = gridAdminPermissions; }

    public List<String> getTeamAdminPermissions() { return teamAdminPermissions; }
    public void setTeamAdminPermissions(List<String> teamAdminPermissions) { this.teamAdminPermissions = teamAdminPermissions; }

    public String getAiServiceUrl() { return aiServiceUrl; }
    public void setAiServiceUrl(String aiServiceUrl) { this.aiServiceUrl = aiServiceUrl; }

    public boolean isAiEnableRAG() { return aiEnableRAG; }
    public void setAiEnableRAG(boolean aiEnableRAG) { this.aiEnableRAG = aiEnableRAG; }

    public String getAiKbName() { return aiKbName; }
    public void setAiKbName(String aiKbName) { this.aiKbName = aiKbName; }

    public String getAiModelName() { return aiModelName; }
    public void setAiModelName(String aiModelName) { this.aiModelName = aiModelName; }

    public String getAiVectorDbPath() { return aiVectorDbPath; }
    public void setAiVectorDbPath(String aiVectorDbPath) { this.aiVectorDbPath = aiVectorDbPath; }

    // AI算法配置
    public List<AIAlgorithmConfig> getAiAlarmLevelConfigs() { return aiAlarmLevelConfigs; }
    public void setAiAlarmLevelConfigs(List<AIAlgorithmConfig> aiAlarmLevelConfigs) { this.aiAlarmLevelConfigs = aiAlarmLevelConfigs; }

    // AI助手额外配置
    public String getAiApiUrl() { return aiApiUrl; }
    public void setAiApiUrl(String aiApiUrl) { this.aiApiUrl = aiApiUrl; }

    public String getAiApiKey() { return aiApiKey; }
    public void setAiApiKey(String aiApiKey) { this.aiApiKey = aiApiKey; }

    public float getAiTemperature() { return aiTemperature; }
    public void setAiTemperature(float aiTemperature) { this.aiTemperature = aiTemperature; }

    public int getAiMaxTokens() { return aiMaxTokens; }
    public void setAiMaxTokens(int aiMaxTokens) { this.aiMaxTokens = aiMaxTokens; }

    public int getAiContextRounds() { return aiContextRounds; }
    public void setAiContextRounds(int aiContextRounds) { this.aiContextRounds = aiContextRounds; }

    public String getAiSystemPrompt() { return aiSystemPrompt; }
    public void setAiSystemPrompt(String aiSystemPrompt) { this.aiSystemPrompt = aiSystemPrompt; }

    // 日志设置别名
    public boolean isLogAudit() { return logAudit; }
    public void setLogAudit(boolean logAudit) { this.logAudit = logAudit; }

    public boolean isLogDiff() { return logDiff; }
    public void setLogDiff(boolean logDiff) { this.logDiff = logDiff; }

    public String getLogEncoding() { return logEncoding; }
    public void setLogEncoding(String logEncoding) { this.logEncoding = logEncoding; }

    public int getLoginFailedAlertThreshold() { return loginFailedAlertThreshold; }
    public void setLoginFailedAlertThreshold(int loginFailedAlertThreshold) { this.loginFailedAlertThreshold = loginFailedAlertThreshold; }

    // 通知设置别名
    public boolean isSmsNotificationEnabled() { return smsNotificationEnabled; }
    public void setSmsNotificationEnabled(boolean smsNotificationEnabled) { this.smsNotificationEnabled = smsNotificationEnabled; }

    public boolean isCallNotificationEnabled() { return callNotificationEnabled; }
    public void setCallNotificationEnabled(boolean callNotificationEnabled) { this.callNotificationEnabled = callNotificationEnabled; }

    public boolean isSevereSmsEnabled() { return severeSmsEnabled; }
    public void setSevereSmsEnabled(boolean severeSmsEnabled) { this.severeSmsEnabled = severeSmsEnabled; }

    public boolean isSevereCallEnabled() { return severeCallEnabled; }
    public void setSevereCallEnabled(boolean severeCallEnabled) { this.severeCallEnabled = severeCallEnabled; }

    public boolean isMediumSmsEnabled() { return mediumSmsEnabled; }
    public void setMediumSmsEnabled(boolean mediumSmsEnabled) { this.mediumSmsEnabled = mediumSmsEnabled; }

    public boolean isMediumCallEnabled() { return mediumCallEnabled; }
    public void setMediumCallEnabled(boolean mediumCallEnabled) { this.mediumCallEnabled = mediumCallEnabled; }

    public boolean isLowSmsEnabled() { return lowSmsEnabled; }
    public void setLowSmsEnabled(boolean lowSmsEnabled) { this.lowSmsEnabled = lowSmsEnabled; }

    public boolean isLowCallEnabled() { return lowCallEnabled; }
    public void setLowCallEnabled(boolean lowCallEnabled) { this.lowCallEnabled = lowCallEnabled; }

    // 备份设置别名
    public boolean isAutoBackupEnabled() { return autoBackupEnabled; }
    public void setAutoBackupEnabled(boolean autoBackupEnabled) { this.autoBackupEnabled = autoBackupEnabled; }

    public int getBackupRetentionCount() { return backupRetentionCount; }
    public void setBackupRetentionCount(int backupRetentionCount) { this.backupRetentionCount = backupRetentionCount; }

    // 账号安全设置别名
    public boolean isForcePasswordChange() { return forcePasswordChange; }
    public void setForcePasswordChange(boolean forcePasswordChange) { this.forcePasswordChange = forcePasswordChange; }

    public boolean isPasswordComplexity() { return passwordComplexity; }
    public void setPasswordComplexity(boolean passwordComplexity) { this.passwordComplexity = passwordComplexity; }

    public int getMaxLoginAttempts() { return maxLoginAttempts; }
    public void setMaxLoginAttempts(int maxLoginAttempts) { this.maxLoginAttempts = maxLoginAttempts; }
}
