import { relativeTime } from "./time";

export function deliveryStatusText(state?: string, deliveredAt?: string): string {
  const s = (state || "").trim();
  if (!s) return "";

  let label = "";
  switch (s) {
    case "sent":
      label = "已送出";
      break;
    case "delivered_local":
      label = "已投递";
      break;
    case "delivered_remote":
    case "delivered":
      label = "已送达";
      break;
    case "read_remote":
    case "read":
      label = "已读";
      break;
    default:
      label = "";
  }

  if (!label) return "";
  if (deliveredAt) {
    const rt = relativeTime(deliveredAt);
    if (rt) return `${label} · ${rt}`;
  }
  return label;
}

/** 群聊 delivery_summary 簡短展示 */
export function formatDeliverySummary(summary: unknown): string {
  if (summary == null) return "";
  if (typeof summary === "string") return summary.trim();
  if (typeof summary === "number" || typeof summary === "boolean") {
    return String(summary);
  }
  try {
    const s = JSON.stringify(summary);
    return s.length > 120 ? s.slice(0, 120) + "…" : s;
  } catch {
    return "";
  }
}
