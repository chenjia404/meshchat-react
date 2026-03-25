import type { PublicChannelListEntry } from "../types";

const STORAGE_KEY = "react_chat_public_channels_v1";

export function loadPublicChannelEntries(): PublicChannelListEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: PublicChannelListEntry[] = [];
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const channelId = typeof r.channelId === "string" ? r.channelId.trim() : "";
      if (!channelId) continue;
      out.push({
        channelId,
        name: typeof r.name === "string" ? r.name : "公开频道",
        ownerPeerId: typeof r.ownerPeerId === "string" ? r.ownerPeerId : "",
        isOwner: !!r.isOwner,
        updatedAtSec:
          typeof r.updatedAtSec === "number" && Number.isFinite(r.updatedAtSec)
            ? Math.floor(r.updatedAtSec)
            : Math.floor(Date.now() / 1000),
        lastMessagePreview:
          typeof r.lastMessagePreview === "string" ? r.lastMessagePreview : undefined
      });
    }
    return out;
  } catch {
    return [];
  }
}

export function savePublicChannelEntries(entries: PublicChannelListEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    /* ignore */
  }
}

export function upsertPublicChannelEntry(
  prev: PublicChannelListEntry[],
  next: PublicChannelListEntry
): PublicChannelListEntry[] {
  const map = new Map(prev.map(e => [e.channelId, e]));
  const old = map.get(next.channelId);
  map.set(next.channelId, {
    ...next,
    lastMessagePreview: next.lastMessagePreview ?? old?.lastMessagePreview
  });
  return Array.from(map.values());
}
