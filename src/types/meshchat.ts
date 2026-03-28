/** MeshChat Server 消息（与 docs/API.md 对齐的常用字段） */
export interface MeshchatUserRef {
  id?: number;
  username?: string;
  display_name?: string;
  avatar_cid?: string;
}

export interface MeshchatMessage {
  group_id?: string;
  message_id?: string;
  seq?: number;
  content_type?: string;
  payload?: Record<string, unknown>;
  sender?: MeshchatUserRef;
  status?: string;
  created_at?: string;
  reply_to_message_id?: string | null;
}

export interface MeshchatGroupSummary {
  group_id?: string;
  title?: string;
  about?: string;
  avatar_cid?: string;
  join_mode?: string;
  status?: string;
  /** ?????????????????? */
  my_role?: string;
  role?: string;
  owner_user_id?: number;
  is_admin?: boolean;
  can_manage?: boolean;
  membership?: { role?: string };
}

/** 本地持久化的超级群条目 */
export interface MeshchatSuperGroupListEntry {
  serverBase: string;
  groupId: string;
  threadId: string;
  title: string;
  avatarCid?: string;
  myUserId?: number;
  updatedAtSec: number;
  lastMessagePreview?: string;
}

/** 会话列表 / 运行时线程上下文 */
export interface MeshchatSuperGroupThread {
  kind: "meshchat_super_group";
  threadId: string;
  serverBase: string;
  groupId: string;
  title: string;
  avatarCid?: string;
  myUserId?: number;
}
