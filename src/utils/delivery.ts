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
