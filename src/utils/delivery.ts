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

/**
 * 群聊 delivery_summary：後端常為成員送達統計物件，轉成短句，避免顯示原始 JSON。
 * 例：{ total, pending, delivered_remote, failed, ... }
 */
export function formatDeliverySummary(summary: unknown): string {
  if (summary == null) return "";
  if (typeof summary === "string") {
    const t = summary.trim();
    if (t.startsWith("{")) {
      try {
        return formatDeliverySummary(JSON.parse(t) as unknown);
      } catch {
        return t;
      }
    }
    return t;
  }
  if (typeof summary === "number" || typeof summary === "boolean") {
    return String(summary);
  }
  if (typeof summary === "object" && summary !== null) {
    const o = summary as Record<string, unknown>;
    const num = (v: unknown): number | undefined => {
      if (typeof v === "number" && Number.isFinite(v)) return v;
      if (typeof v === "string" && v.trim() !== "") {
        const n = Number(v);
        return Number.isFinite(n) ? n : undefined;
      }
      return undefined;
    };
    const total = num(o.total);
    const deliveredRemote = num(o.delivered_remote);
    const pending = num(o.pending);
    const failed = num(o.failed);

    if (total !== undefined && total > 0) {
      const dr = deliveredRemote ?? 0;
      const pend = pending ?? 0;
      const fail = failed ?? 0;
      const parts: string[] = [];
      parts.push(`已送达 ${dr}/${total}`);
      if (pend > 0) parts.push(`待送 ${pend}`);
      if (fail > 0) parts.push(`失败 ${fail}`);
      return parts.join(" · ");
    }
  }
  return "";
}
