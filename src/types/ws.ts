import type { ThreadKind } from "./thread";

/** `/api/v1/chat/ws` 推送事件（精簡欄位）。 */
export type WsChatEvent = {
  type?: string;
  kind?: ThreadKind | string;
  conversation_id?: string;
  request_id?: string;
  from_peer_id?: string;
  to_peer_id?: string;
  state?: string;
  at_unix_millis?: number;
};
