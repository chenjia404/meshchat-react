import type { ConversationRaw } from "../types/chat";
import type { GroupRaw } from "../types/group";

/** 從單則訊息產生側欄預覽（文字 / 檔名） */
export function previewFromChatMessage(msg: {
  plaintext?: string;
  file_name?: string;
  mime_type?: string;
}): string {
  const pt = (msg.plaintext || "").trim();
  if (pt) return pt;
  const fn = (msg.file_name || "").trim();
  if (fn) return `[文件] ${fn}`;
  return "";
}

/** 訊息列表中選最新一則（優先依 created_at） */
export function pickLatestMessage<T extends { created_at?: string }>(
  list: T[]
): T | null {
  if (!list.length) return null;
  const hasTime = list.some(m => !!m.created_at);
  if (!hasTime) return list[list.length - 1] ?? null;
  return list.reduce((a, b) => {
    const ta = Date.parse(a.created_at || "") || 0;
    const tb = Date.parse(b.created_at || "") || 0;
    return tb >= ta ? b : a;
  });
}

/** WebSocket payload 內可能直接帶預覽欄位 */
export function extractInlinePreviewFromWsPayload(
  raw: Record<string, unknown>
): string {
  for (const k of ["plaintext", "text", "preview", "body", "content"] as const) {
    const v = raw[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return peekLastMessagePlaintext(raw.last_message);
}

/**
 * 列表 API 若無 last_message，刷新時勿覆蓋本地已補上的預覽（否則對方來訊後又變「暂无消息」）
 */
export function mergeConversationsPreservePreview(
  prev: ConversationRaw[],
  next: ConversationRaw[]
): ConversationRaw[] {
  return next.map(n => {
    if (peekConversationPreview(n as ConversationRaw & Record<string, unknown>))
      return n;
    const o = prev.find(c => c.conversation_id === n.conversation_id);
    if (o && peekConversationPreview(o as ConversationRaw & Record<string, unknown>)) {
      return {
        ...n,
        last_message: o.last_message
      };
    }
    return n;
  });
}

export function mergeGroupsPreservePreview(
  prev: GroupRaw[],
  next: GroupRaw[]
): GroupRaw[] {
  return next.map(n => {
    if (peekGroupPreview(n as GroupRaw & Record<string, unknown>)) return n;
    const o = prev.find(g => g.group_id === n.group_id);
    if (o && peekGroupPreview(o as GroupRaw & Record<string, unknown>)) {
      return {
        ...n,
        last_message: o.last_message,
        last_message_at: n.last_message_at ?? o.last_message_at
      };
    }
    return n;
  });
}

/** 從 last_message 物件或字串取出預覽文字（相容不同後端欄位名） */
export function peekLastMessagePlaintext(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string") return raw.trim();
  if (typeof raw === "object" && raw !== null) {
    const o = raw as Record<string, unknown>;
    const keys = [
      "plaintext",
      "text",
      "body",
      "content",
      "message",
      "summary",
      "Plaintext",
      "Text"
    ];
    for (const k of keys) {
      const v = o[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  return "";
}

/** 會話列表項：last_message + 少數頂層預覽欄位 */
export function peekConversationPreview(
  conv: ConversationRaw & Record<string, unknown>
): string {
  const nested = peekLastMessagePlaintext(conv.last_message);
  if (nested) return nested;
  for (const k of ["last_message_text", "last_preview", "preview", "summary"]) {
    const v = conv[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/** 群列表項 */
export function peekGroupPreview(g: GroupRaw & Record<string, unknown>): string {
  const nested = peekLastMessagePlaintext(g.last_message);
  if (nested) return nested;
  for (const k of ["last_message_text", "last_preview", "preview", "summary"]) {
    const v = g[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/** 發送後若列表 API 仍無預覽，用本地內容補上（避免側欄一直「暂无消息」） */
export function withOptimisticConversationPreview(
  list: ConversationRaw[],
  conversationId: string,
  plaintext: string
): ConversationRaw[] {
  const t = plaintext.trim();
  if (!t) return list;
  return list.map(c => {
    if (c.conversation_id !== conversationId) return c;
    if (peekConversationPreview(c as ConversationRaw & Record<string, unknown>)) return c;
    return {
      ...c,
      last_message: { plaintext: t },
      updated_at: new Date().toISOString()
    };
  });
}

export function withOptimisticGroupPreview(
  list: GroupRaw[],
  groupId: string,
  plaintext: string
): GroupRaw[] {
  const t = plaintext.trim();
  if (!t) return list;
  return list.map(g => {
    if (g.group_id !== groupId) return g;
    if (peekGroupPreview(g as GroupRaw & Record<string, unknown>)) return g;
    return {
      ...g,
      last_message: { plaintext: t },
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  });
}

/** 對方來訊等場景：一律寫入最新預覽（覆蓋舊預覽） */
export function setConversationLastMessagePreview(
  list: ConversationRaw[],
  conversationId: string,
  plaintext: string
): ConversationRaw[] {
  const t = plaintext.trim();
  if (!t) return list;
  const now = new Date().toISOString();
  return list.map(c =>
    c.conversation_id === conversationId
      ? { ...c, last_message: { plaintext: t }, updated_at: now }
      : c
  );
}

export function setGroupLastMessagePreview(
  list: GroupRaw[],
  groupId: string,
  plaintext: string
): GroupRaw[] {
  const t = plaintext.trim();
  if (!t) return list;
  const now = new Date().toISOString();
  return list.map(g =>
    g.group_id === groupId
      ? {
          ...g,
          last_message: { plaintext: t },
          last_message_at: now,
          updated_at: now
        }
      : g
  );
}
