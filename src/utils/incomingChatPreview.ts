import { get } from "../api";
import type { DirectMessage, GroupMessage } from "../types";
import { normalizeList } from "./normalize";
import {
  pickLatestMessage,
  previewFromChatMessage
} from "./lastMessage";

/**
 * 依線程拉取訊息列表，取最新一則作為側欄預覽（對方來訊時列表 API 常無 last_message）
 */
export async function fetchLastMessagePreviewForThread(
  kind: "direct" | "group",
  id: string
): Promise<string> {
  if (kind === "group") {
    const resp = await get<unknown>(
      `/api/v1/groups/${encodeURIComponent(id)}/messages`
    );
    const list = normalizeList<GroupMessage>(resp);
    const last = pickLatestMessage(list);
    return last ? previewFromChatMessage(last) : "";
  }
  const resp = await get<unknown>(
    `/api/v1/chat/conversations/${encodeURIComponent(id)}/messages`
  );
  const list = normalizeList<DirectMessage>(resp);
  const last = pickLatestMessage(list);
  return last ? previewFromChatMessage(last) : "";
}
