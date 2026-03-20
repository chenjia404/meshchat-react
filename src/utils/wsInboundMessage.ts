import type { DirectMessage, GroupMessage } from "../types/chat";

/** 後端 WS 是否帶有足夠欄位，可直接併入當前訊息列表（無需再 silent 拉全量） */
export function wsPayloadHasFullMessage(raw: Record<string, unknown>): boolean {
  const msgId = raw.msg_id;
  if (typeof msgId !== "string" || !msgId.trim()) return false;
  const pt = typeof raw.plaintext === "string" ? raw.plaintext.trim() : "";
  const fn = typeof raw.file_name === "string" ? raw.file_name.trim() : "";
  const mt = typeof raw.msg_type === "string" ? raw.msg_type : "";
  if (pt) return true;
  if (fn) return true;
  if (mt === "chat_file" || mt === "group_chat_file") return true;
  return false;
}

function createdAtFromWs(raw: Record<string, unknown>): string {
  const ms = raw.created_at_unix_millis;
  if (typeof ms === "number" && Number.isFinite(ms)) {
    return new Date(ms).toISOString();
  }
  return new Date().toISOString();
}

export function directMessageFromWsPayload(
  raw: Record<string, unknown>
): DirectMessage | null {
  const msgId = raw.msg_id;
  if (typeof msgId !== "string" || !msgId.trim()) return null;
  const conv = raw.conversation_id;
  if (typeof conv !== "string" || !conv.trim()) return null;
  return {
    msg_id: msgId,
    conversation_id: conv,
    direction: "inbound",
    msg_type: typeof raw.msg_type === "string" ? raw.msg_type : undefined,
    sender_peer_id:
      typeof raw.sender_peer_id === "string" ? raw.sender_peer_id : undefined,
    receiver_peer_id:
      typeof raw.receiver_peer_id === "string" ? raw.receiver_peer_id : undefined,
    state:
      typeof raw.message_state === "string" ? raw.message_state : undefined,
    plaintext: typeof raw.plaintext === "string" ? raw.plaintext : "",
    mime_type: typeof raw.mime_type === "string" ? raw.mime_type : undefined,
    file_name: typeof raw.file_name === "string" ? raw.file_name : undefined,
    created_at: createdAtFromWs(raw)
  };
}

export function groupMessageFromWsPayload(
  raw: Record<string, unknown>
): GroupMessage | null {
  const msgId = raw.msg_id;
  if (typeof msgId !== "string" || !msgId.trim()) return null;
  const groupId = raw.conversation_id;
  if (typeof groupId !== "string" || !groupId.trim()) return null;
  const sender = raw.sender_peer_id;
  return {
    msg_id: msgId,
    group_id: groupId,
    sender_peer_id: typeof sender === "string" ? sender : "",
    msg_type: typeof raw.msg_type === "string" ? raw.msg_type : undefined,
    state:
      typeof raw.message_state === "string" ? raw.message_state : undefined,
    plaintext: typeof raw.plaintext === "string" ? raw.plaintext : "",
    mime_type: typeof raw.mime_type === "string" ? raw.mime_type : undefined,
    file_name: typeof raw.file_name === "string" ? raw.file_name : undefined,
    created_at: createdAtFromWs(raw)
  };
}

/** 依 created_at 合併一則訊息並排序（與 API 列表時間序一致） */
export function mergeMessagesByTime<T extends { msg_id: string; created_at?: string }>(
  prev: T[],
  next: T
): T[] {
  if (prev.some(m => m.msg_id === next.msg_id)) return prev;
  const merged = [...prev, next];
  merged.sort((a, b) => {
    const ta = Date.parse(a.created_at || "") || 0;
    const tb = Date.parse(b.created_at || "") || 0;
    return ta - tb;
  });
  return merged;
}
