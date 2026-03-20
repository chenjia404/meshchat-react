import { post } from "./client";
import type { ConversationRaw } from "../types/chat";

/** POST /api/v1/chat/conversations/{id}/read — 成功回傳更新後會話（含 unread_count: 0） */
export async function markConversationRead(
  conversationId: string
): Promise<ConversationRaw> {
  return post<ConversationRaw>(
    `/api/v1/chat/conversations/${encodeURIComponent(conversationId)}/read`,
    {}
  );
}
