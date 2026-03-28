import type { MeshchatSuperGroupListEntry } from "../types";

const STORAGE_KEY = "react_chat_meshchat_super_v1";

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s.trim()
  );
}

export function makeMeshchatThreadId(serverBase: string, groupId: string): string {
  const sb = serverBase.trim().replace(/\/+$/, "");
  const gid = groupId.trim();
  return `meshchat::${encodeURIComponent(sb)}::${gid}`;
}

export function parseMeshchatThreadId(threadId: string): { serverBase: string; groupId: string } | null {
  const prefix = "meshchat::";
  if (!threadId.startsWith(prefix)) return null;
  const rest = threadId.slice(prefix.length);
  const idx = rest.indexOf("::");
  if (idx <= 0) return null;
  try {
    const serverBase = decodeURIComponent(rest.slice(0, idx));
    const groupId = rest.slice(idx + 2);
    if (!serverBase || !isUuid(groupId)) return null;
    return { serverBase, groupId };
  } catch {
    return null;
  }
}

export function loadMeshchatSuperGroupEntries(): MeshchatSuperGroupListEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: MeshchatSuperGroupListEntry[] = [];
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const serverBase = typeof r.serverBase === "string" ? r.serverBase.trim() : "";
      const groupId = typeof r.groupId === "string" ? r.groupId.trim() : "";
      if (!serverBase || !isUuid(groupId)) continue;
      const threadId =
        typeof r.threadId === "string" && r.threadId.trim()
          ? r.threadId.trim()
          : makeMeshchatThreadId(serverBase, groupId);
      out.push({
        serverBase,
        groupId,
        threadId,
        title: typeof r.title === "string" && r.title.trim() ? r.title : "超级群聊",
        avatarCid: typeof r.avatarCid === "string" ? r.avatarCid : undefined,
        myUserId:
          typeof r.myUserId === "number" && Number.isFinite(r.myUserId)
            ? Math.floor(r.myUserId)
            : undefined,
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

export function saveMeshchatSuperGroupEntries(entries: MeshchatSuperGroupListEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    /* ignore */
  }
}

export function upsertMeshchatSuperGroupEntry(
  prev: MeshchatSuperGroupListEntry[],
  next: MeshchatSuperGroupListEntry
): MeshchatSuperGroupListEntry[] {
  const map = new Map(prev.map(e => [e.threadId, e]));
  const old = map.get(next.threadId);
  map.set(next.threadId, {
    ...next,
    lastMessagePreview: next.lastMessagePreview ?? old?.lastMessagePreview
  });
  return Array.from(map.values());
}

export function removeMeshchatSuperGroupEntry(
  prev: MeshchatSuperGroupListEntry[],
  threadId: string
): MeshchatSuperGroupListEntry[] {
  const id = threadId.trim();
  if (!id) return prev;
  return prev.filter(e => e.threadId !== id);
}
