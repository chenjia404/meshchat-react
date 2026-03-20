export function retentionMinutesFrom(
  unit: "month" | "week" | "day" | "hour" | "minute" | "off",
  value: number
): number {
  if (unit === "off") return 0;
  const v = Math.max(0, Math.floor(Number(value) || 0));
  if (v <= 0) return 0;
  if (unit === "minute") return v;
  if (unit === "hour") return v * 60;
  if (unit === "day") return v * 24 * 60;
  if (unit === "week") return v * 7 * 24 * 60;
  // month：后端只保证“分钟”，这里用 1 月=30 天作为近似
  return v * 30 * 24 * 60;
}

export function retentionUnitValueFromMinutes(minutes?: number | null): {
  unit: "month" | "week" | "day" | "hour" | "minute" | "off";
  value: number;
} {
  const m = Math.max(0, Math.floor(Number(minutes) || 0));
  if (!m) return { unit: "off", value: 0 };
  const hour = 60;
  const day = 24 * hour;
  const month = 30 * day;
  const week = 7 * day;
  if (m >= month) {
    return { unit: "month", value: Math.max(1, Math.round(m / month)) };
  }
  if (m >= week) {
    return { unit: "week", value: Math.max(1, Math.round(m / week)) };
  }
  if (m >= day) {
    return { unit: "day", value: Math.max(1, Math.round(m / day)) };
  }
  // 能整除为整小时时用“小时”，否则用“分钟”精确展示（如 45 分钟、90 分钟）
  if (m >= hour && m % hour === 0) {
    return { unit: "hour", value: Math.max(1, m / hour) };
  }
  return { unit: "minute", value: Math.max(1, m) };
}
