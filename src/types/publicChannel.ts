/** GET /api/v1/public-channels/subscriptions 单条摘要（与 mesh-proxy 对齐） */
export interface ChannelSummary {
  channel_id: string;
  name?: string;
  owner_peer_id?: string;
  /** 是否 owner（可发布）；未返回时用 me.peer_id 与 owner_peer_id 比较 */
  is_owner?: boolean;
  /** 本地库 public_channels.id，用于同 updated_at 下排序 */
  id?: number;
  /** public_channel_sync_state.updated_at（秒） */
  sync_updated_at?: number;
}

/** GET /api/v1/public-channels/{id} 简介页展示用（在列表项基础上增加资料字段） */
export interface PublicChannelProfileDetail {
  channelId: string;
  name: string;
  ownerPeerId: string;
  bio: string;
  updatedAtSec: number;
  createdAtSec?: number;
  ownerVersion?: number;
  profileVersion?: number;
  /** 资料签名（Base64），只读展示 */
  signatureBase64?: string;
}

/** 去中心化公开频道（/api/v1/public-channels）本地列表项 */
export interface PublicChannelListEntry {
  channelId: string;
  name: string;
  ownerPeerId: string;
  /** 是否当前用户为 owner（可发布） */
  isOwner: boolean;
  /** 秒级时间戳，用于排序与列表时间（优先 sync.updated_at） */
  updatedAtSec: number;
  lastMessagePreview?: string;
  /** 来自 GET /subscriptions 的序号，用于同秒下与服务端排序一致 */
  subscriptionOrder?: number;
}

/** GET messages 返回的单条消息（与协议文档对齐的精简视图） */
export interface PublicChannelMessage {
  channel_id?: string;
  message_id: number;
  version?: number;
  seq?: number;
  author_peer_id?: string;
  creator_peer_id?: string;
  created_at: number;
  updated_at?: number;
  is_deleted?: boolean;
  message_type?: string;
  content?: {
    text?: string;
    images?: Array<Record<string, unknown>>;
    files?: Array<Record<string, unknown>>;
  };
}
