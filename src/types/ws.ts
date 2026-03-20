import type { ThreadKind } from "./thread";

/** `/api/v1/chat/ws` 推送事件（精簡欄位 + 可選完整訊息正文，與 mesh-proxy ChatEvent 對齊）。 */
export type WsChatEvent = {
  type?: string;
  kind?: ThreadKind | string;
  conversation_id?: string;
  msg_id?: string;
  msg_type?: string;
  /** 群訊息時部分後端用此欄位 */
  group_id?: string;
  request_id?: string;
  from_peer_id?: string;
  to_peer_id?: string;
  state?: string;
  at_unix_millis?: number;
  plaintext?: string;
  text?: string;
  preview?: string;
  last_message?: unknown;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
  sender_peer_id?: string;
  receiver_peer_id?: string;
  direction?: string;
  counter?: number;
  transport_mode?: string;
  message_state?: string;
  /** 私聊送達時間（Unix 毫秒，見 mesh-proxy chat.md） */
  delivered_at_unix_millis?: number;
  delivered_at?: string;
  /** 群聊成員送達彙總 */
  delivery_summary?: unknown;
  created_at_unix_millis?: number;
  epoch?: number;
  sender_seq?: number;
};
