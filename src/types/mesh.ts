// --- meshserver 中心化群（channel） ---
export interface MeshserverConnectionRaw {
  name: string; // connection.name
  peer_id: string;
  user_id?: string;
}

export interface MeshserverServerRaw {
  id: string;
  name: string;
  avatar_url?: string;
  description?: string;
  visibility?: number;
  member_count?: number;
  allow_channel_creation?: boolean;
}

export interface MeshserverChannelRaw {
  channel_id: string;
  server_id: string;
  type: number; // 1=GROUP, 2=BROADCAST
  name: string;
  description?: string;
  visibility?: number;
  slow_mode_seconds?: number;
  last_seq?: number;
  can_view?: boolean;
  can_send_message?: boolean;
  can_send_image?: boolean;
  can_send_file?: boolean;
}

export interface MeshserverGroupThread {
  kind: "meshserver_group";
  threadId: string; // channel_id
  channel_id: string;
  server_id: string;
  title: string;
  subtitle?: string;
  avatarUrl?: string;
  connectionName: string; // connection.name
  myUserId?: string;
}

export interface MeshserverSyncMessage {
  channel_id: string;
  message_id: string;
  seq?: number;
  sender_user_id?: string;
  message_type?: number;
  content?: {
    text?: string;
    image_url?: string;
    url?: string;
    images?: Array<{
      url?: string;
      mime_type?: string;
      inline_data?: string;
      media_id?: string;
      original_name?: string;
    }>;
    files?: Array<{
      url?: string;
      mime_type?: string;
      inline_data?: string;
      media_id?: string;
      file_name?: string;
    }>;
  };
  created_at_ms?: number;
}
