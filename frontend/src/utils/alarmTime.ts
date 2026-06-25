const ALARM_TIME_FIELDS = [
  "alarm_time",
  "detection_time",
  "trigger_time",
  "snapshot_time",
  "image_time",
  "capture_time",
  "timestamp",
  "created_at",
] as const;

export const getAlarmDisplayTime = (alarm: Record<string, unknown> | null | undefined): string => {
  if (!alarm) return "";

  for (const field of ALARM_TIME_FIELDS) {
    const value = alarm[field];
    if (value !== null && value !== undefined && String(value).trim()) {
      return String(value).trim();
    }
  }

  return "";
};

export const parseAlarmTimeValue = (value?: string | null) => {
  const raw = String(value || "").trim();
  if (!raw) return new Date(NaN);

  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const normalized = hasTimezone ? raw : raw.replace(" ", "T");
  return new Date(normalized);
};

export const formatAlarmDisplayTime = (value?: string | null) => {
  const raw = String(value || "").trim();
  if (!raw) return "--";

  const date = parseAlarmTimeValue(raw);
  if (Number.isNaN(date.getTime())) return raw.replace("T", " ").slice(0, 19);

  return date.toLocaleString("zh-CN", {
    hour12: false,
  });
};
