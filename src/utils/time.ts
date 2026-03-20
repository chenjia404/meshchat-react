export function shortPeer(peerID: string | undefined | null): string {
  if (!peerID) return "-";
  return peerID.length > 20 ? peerID.slice(0, 20) + "…" : peerID;
}

export function formatTime(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.valueOf())) return "";
  return d.toLocaleString();
}

export function formatTimeFromMs(value?: number | null): string {
  if (value == null) return "";
  const d = new Date(value);
  if (Number.isNaN(d.valueOf())) return "";
  return d.toLocaleString();
}

export function relativeTime(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  const stamp = d.valueOf();
  if (Number.isNaN(stamp)) return "";
  const diff = Date.now() - stamp;
  const abs = Math.abs(diff);
  if (abs < 60 * 1000) return diff >= 0 ? "刚刚" : "即将";
  if (abs < 60 * 60 * 1000) {
    return `${Math.round(abs / (60 * 1000))} 分钟${diff >= 0 ? "前" : "后"}`;
  }
  if (abs < 24 * 60 * 60 * 1000) {
    return `${Math.round(abs / (60 * 60 * 1000))} 小时${diff >= 0 ? "前" : "后"}`;
  }
  return `${Math.round(abs / (24 * 60 * 60 * 1000))} 天${diff >= 0 ? "前" : "后"}`;
}
