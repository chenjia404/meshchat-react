export interface Me {
  peer_id: string;
  nickname?: string;
  /** 後端部分實作用此欄位表示「自己的暱稱」 */
  remote_nickname?: string;
  chat_kex_pub?: string;
  avatar?: string;
  bio?: string;
}

export interface ContactRaw {
  peer_id: string;
  /** 本地備註（後端欄位 nickname） */
  nickname?: string;
  /** 對方在遠端設定的暱稱（後端欄位 remote_nickname） */
  remote_nickname?: string;
  avatar?: string;
  bio?: string;
  chat_kex_pub?: string;
  last_seen_at?: string;
  blocked?: boolean;
}

export interface ConversationRaw {
  conversation_id: string;
  peer_id: string;
  state?: string;
  updated_at?: string;
  last_message?: { plaintext?: string };
  retention_minutes?: number;
  /** 最後一次訊息實際傳輸路徑（後端欄位，與 index.html 一致） */
  last_transport_mode?: string;
}

export interface FriendRequestRaw {
  request_id: string;
  from_peer_id?: string;
  to_peer_id?: string;
  state?: string;
  created_at?: string;
  intro_text?: string;
  /** 請求方遠端暱稱（與 contacts 語意一致時優先） */
  remote_nickname?: string;
  nickname?: string;
  bio?: string;
  avatar?: string;
  retention_minutes?: number;
}

export interface DirectMessage {
  msg_id: string;
  direction: "inbound" | "outbound";
  msg_type?: string;
  sender_peer_id?: string;
  receiver_peer_id?: string;
  conversation_id?: string;
  state?: string;
  delivered_at?: string;
  plaintext?: string;
  mime_type?: string;
  file_name?: string;
  created_at?: string;
}

export interface GroupMessage {
  msg_id: string;
  sender_peer_id: string;
  group_id?: string;
  msg_type?: string;
  state?: string;
  delivered_at?: string;
  plaintext?: string;
  mime_type?: string;
  file_name?: string;
  created_at?: string;
}

export interface GroupDetails {
  group?: { group_id: string; retention_minutes?: number };
  members?: Array<{
    peer_id: string;
    role?: string;
    state?: string;
  }>;
}
