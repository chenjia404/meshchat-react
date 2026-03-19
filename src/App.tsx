import React, { useEffect, useMemo, useState } from "react";
import "@chatscope/chat-ui-kit-styles/dist/default/styles.min.css";
import {
  MainContainer,
  ChatContainer,
  Sidebar,
  ConversationList,
  Conversation,
  Avatar,
  MessageList,
  Message,
  MessageInput,
  TypingIndicator
} from "@chatscope/chat-ui-kit-react";

type ThreadKind = "direct" | "group" | "meshserver_group";

interface Me {
  peer_id: string;
  nickname?: string;
  chat_kex_pub?: string;
  avatar?: string;
  bio?: string;
}

interface ContactRaw {
  peer_id: string;
  nickname?: string;
  avatar?: string;
  bio?: string;
  last_seen_at?: string;
  blocked?: boolean;
}

interface ConversationRaw {
  conversation_id: string;
  peer_id: string;
  updated_at?: string;
  last_message?: { plaintext?: string };
  retention_minutes?: number;
}

interface GroupRaw {
  group_id: string;
  title?: string;
  member_count?: number;
  updated_at?: string;
  last_message_at?: string;
  last_message?: { plaintext?: string };
  retention_minutes?: number;
}

interface FriendRequestRaw {
  request_id: string;
  from_peer_id?: string;
  to_peer_id?: string;
  state?: string;
  created_at?: string;
  intro_text?: string;
  nickname?: string;
  bio?: string;
  avatar?: string;
  retention_minutes?: number;
}

// --- meshserver 中心化群（channel） ---
interface MeshserverConnectionRaw {
  name: string; // connection.name
  peer_id: string;
  user_id?: string;
}

interface MeshserverServerRaw {
  id: string;
  name: string;
  avatar_url?: string;
  description?: string;
  visibility?: number;
  member_count?: number;
  allow_channel_creation?: boolean;
}

interface MeshserverChannelRaw {
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

interface MeshserverGroupThread {
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

interface MeshserverSyncMessage {
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

interface DirectMessage {
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

interface GroupMessage {
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

interface GroupDetails {
  group?: { group_id: string; retention_minutes?: number };
  members?: Array<{
    peer_id: string;
    role?: string;
    state?: string;
  }>;
}

function normalizeList<T = any>(value: any): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && Array.isArray(value.messages)) return value.messages as T[];
  if (value && Array.isArray(value.items)) return value.items as T[];
  if (value && Array.isArray(value.data)) return value.data as T[];
  return [];
}

function normalizeEntityList<T = any>(value: any, keys: string[]): T[] {
  if (Array.isArray(value)) return value as T[];
  if (!value || typeof value !== "object") return [];
  for (const k of keys) {
    const v = (value as any)[k];
    if (Array.isArray(v)) return v as T[];
  }
  // 兼容一些通用包裹格式
  return normalizeList<T>(value);
}

function safeJsonParse<T = any>(value: unknown): T | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function retentionMinutesFrom(
  unit: "month" | "week" | "day" | "hour" | "off",
  value: number
): number {
  if (unit === "off") return 0;
  const v = Math.max(0, Math.floor(Number(value) || 0));
  if (v <= 0) return 0;
  if (unit === "hour") return v * 60;
  if (unit === "day") return v * 24 * 60;
  if (unit === "week") return v * 7 * 24 * 60;
  // month：后端只保证“分钟”，这里用 1 月=30 天作为近似
  return v * 30 * 24 * 60;
}

function retentionUnitValueFromMinutes(minutes?: number | null): {
  unit: "month" | "week" | "day" | "hour" | "off";
  value: number;
} {
  const m = Math.max(0, Math.floor(Number(minutes) || 0));
  if (!m) return { unit: "off", value: 0 };
  const hour = 60;
  const day = 24 * hour;
  const month = 30 * day;
  const week = 7 * day;
  if (m >= month) {
    return { unit: "month", value: Math.max(1, Math.round(m / month)) };
  }
  if (m >= week) {
    return { unit: "week", value: Math.max(1, Math.round(m / week)) };
  }
  if (m >= day) {
    return { unit: "day", value: Math.max(1, Math.round(m / day)) };
  }
  return { unit: "hour", value: Math.max(1, Math.round(m / hour)) };
}

// API 基地址：优先从 Vite env 读取；没有配置时使用相对路径（更适合 WebView/静态部署）。
// 例如：VITE_API_BASE=http://127.0.0.1:19082 或 https://your-host
const API_BASE = import.meta.env.VITE_API_BASE || "";

function api(path: string) {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  if (!API_BASE) return cleanPath; // 形如 /api/v1/... 的相对请求
  return `${API_BASE}${cleanPath}`;
}

function avatarUrl(avatar?: string | null): string | undefined {
  const v = (avatar || "").trim();
  if (!v) return undefined;
  return api(`/api/v1/chat/avatars/${encodeURIComponent(v)}`);
}

function directFileUrl(conversationId: string, msgId: string): string {
  return api(
    `/api/v1/chat/conversations/${encodeURIComponent(
      conversationId
    )}/messages/${encodeURIComponent(msgId)}/file`
  );
}

function groupFileUrl(groupId: string, msgId: string): string {
  return api(
    `/api/v1/groups/${encodeURIComponent(groupId)}/messages/${encodeURIComponent(
      msgId
    )}/file`
  );
}

function isImageMime(mime?: string) {
  return !!mime && /^image\//.test(mime);
}

function isVideoMime(mime?: string) {
  return !!mime && /^video\//.test(mime);
}

async function get<T = any>(path: string): Promise<T> {
  const r = await fetch(api(path));
  const data = (await r.json().catch(() => ({}))) as any;
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data as T;
}

async function post<T = any>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(api(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = (await r.json().catch(() => ({}))) as any;
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data as T;
}

function shortPeer(peerID: string | undefined | null): string {
  if (!peerID) return "-";
  return peerID.length > 20 ? peerID.slice(0, 20) + "…" : peerID;
}

function formatTime(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.valueOf())) return "";
  return d.toLocaleString();
}

function formatTimeFromMs(value?: number | null): string {
  if (value == null) return "";
  const d = new Date(value);
  if (Number.isNaN(d.valueOf())) return "";
  return d.toLocaleString();
}

function resolveMeshserverAssetUrl(candidate?: string | null): string | undefined {
  const v = (candidate || "").trim();
  if (!v) return undefined;
  if (v.startsWith("data:image/")) return v;
  if (v.startsWith("http://") || v.startsWith("https://")) return v;
  // 后端可能返回 /blobs/xxx 或相对路径，这里交给 api() 处理相对拼接
  return api(v);
}

function looksLikeImageSrc(text?: string | null): boolean {
  const v = (text || "").trim();
  if (!v) return false;
  if (v.startsWith("data:image/")) return true;
  if (v.startsWith("http://") || v.startsWith("https://")) return true;
  if (v.startsWith("/")) return true;
  return false;
}

function extractMeshserverImageSrc(m: MeshserverSyncMessage): string | undefined {
  const anyMsg = m as any;
  const contentAny = (anyMsg?.content || {}) as any;

  const images = contentAny?.images;
  const files = contentAny?.files;

  // 按文档：image(2) 优先使用 content.images[0]
  if (Array.isArray(images) && images.length > 0) {
    const first = images[0] || {};
    const url = first?.url;
    const mimeType = first?.mime_type || first?.mimeType || "image/jpeg";
    const inline = first?.inline_data || first?.inlineData;

    if (looksLikeImageSrc(url)) return resolveMeshserverAssetUrl(url);
    if (inline && typeof inline === "string" && inline.trim()) {
      return `data:${mimeType};base64,${inline.trim()}`;
    }
  }

  // 有些实现把图片放到 files 里（兜底）
  if (Array.isArray(files) && files.length > 0) {
    const first = files[0] || {};
    const url = first?.url;
    const mimeType = first?.mime_type || first?.mimeType || "application/octet-stream";
    const inline = first?.inline_data || first?.inlineData;

    if (looksLikeImageSrc(url)) return resolveMeshserverAssetUrl(url);
    if (inline && typeof inline === "string" && inline.trim()) {
      return `data:${mimeType};base64,${inline.trim()}`;
    }
  }

  // 旧字段兼容（可能是 url/base64 直接挂在 content 上）
  const candidates: Array<string | null | undefined> = [
    contentAny?.image_url,
    contentAny?.imageUrl,
    contentAny?.url,
    contentAny?.image,
    contentAny?.file_url,
    contentAny?.fileUrl,
    contentAny?.data_url,
    contentAny?.dataUrl,
    contentAny?.base64,
    contentAny?.base64_image,
    anyMsg?.image_url,
    anyMsg?.imageUrl,
    anyMsg?.url,
    anyMsg?.image,
    contentAny?.media?.image_url,
    contentAny?.media?.imageUrl,
    contentAny?.media?.url,
    contentAny?.text
  ];

  for (const c of candidates) {
    if (looksLikeImageSrc(c)) return resolveMeshserverAssetUrl(c || undefined);
  }

  // base64 without data prefix: best-effort
  const base64 = String(contentAny?.base64 || contentAny?.base64_image || "").trim();
  const looksBase64 =
    base64.length > 100 && /^[A-Za-z0-9+/]+={0,2}$/.test(base64) && !base64.includes(" ");
  if (looksBase64) {
    const mime = String(contentAny?.mime_type || contentAny?.mime || "image/jpeg").trim();
    return `data:${mime};base64,${base64}`;
  }

  return undefined;
}

function deliveryStatusText(state?: string, deliveredAt?: string): string {
  const s = (state || "").trim();
  if (!s) return "";
  const label =
    s === "sent"
      ? "已送出"
      : s === "delivered_local"
        ? "已投递"
        : s === "delivered_remote" || s === "delivered"
          ? "已送达"
          : s === "read_remote" || s === "read"
            ? "已读"
            : "";
  if (!label) return "";
  if (deliveredAt) {
    const rt = relativeTime(deliveredAt);
    if (rt) return `${label} · ${rt}`;
  }
  return label;
}

function relativeTime(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  const stamp = d.valueOf();
  if (Number.isNaN(stamp)) return "";
  const diff = Date.now() - stamp;
  const abs = Math.abs(diff);
  if (abs < 60 * 1000) return diff >= 0 ? "刚刚" : "即将";
  if (abs < 60 * 60 * 1000) {
    return `${Math.round(abs / (60 * 1000))} 分钟${diff >= 0 ? "前" : "后"}`;
  }
  if (abs < 24 * 60 * 60 * 1000) {
    return `${Math.round(abs / (60 * 60 * 1000))} 小时${diff >= 0 ? "前" : "后"}`;
  }
  return `${Math.round(abs / (24 * 60 * 60 * 1000))} 天${diff >= 0 ? "前" : "后"}`;
}

function displayName(contacts: ContactRaw[], peerID: string, fallback?: string): string {
  const contact = contacts.find(c => c.peer_id === peerID);
  if (contact && contact.nickname) return contact.nickname;
  return fallback || shortPeer(peerID);
}

function textAvatarLetter(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  return trimmed.charAt(0).toUpperCase();
}

type AvatarSize = "sm" | "md" | "lg";

function avatarPx(size?: AvatarSize): number {
  if (size === "sm") return 32;
  if (size === "lg") return 48;
  return 40; // md / default
}

const FallbackAvatar: React.FC<{
  name: string;
  src?: string;
  size?: AvatarSize;
}> = ({ name, src, size = "md" }) => {
  const letter = textAvatarLetter(name);
  const px = avatarPx(size);
  const hasSrc = !!(src && src.trim());

  if (hasSrc) {
    return <Avatar name={name} src={src} size={size as any} />;
  }

  return (
    <div
      aria-label={name}
      title={name}
      style={{
        width: px,
        height: px,
        borderRadius: "50%",
        background: "#1f2933",
        color: "#e5e7eb",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.max(12, Math.floor(px * 0.42)),
        fontWeight: 700,
        flexShrink: 0,
        userSelect: "none"
      }}
    >
      {letter}
    </div>
  );
};

interface BottomTabItemProps {
  active: boolean;
  label: string;
  onClick: () => void;
}

const BottomTabItem: React.FC<BottomTabItemProps> = ({ active, label, onClick }) => (
  <button
    onClick={onClick}
    style={{
      flex: 1,
      border: "none",
      background: "transparent",
      color: active ? "#58a6ff" : "#9ca3af",
      fontSize: 13,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer"
    }}
  >
    <span style={{ marginBottom: 2 }}>{label}</span>
    <div
      style={{
        width: 24,
        height: 2,
        borderRadius: 999,
        background: active ? "#58a6ff" : "transparent"
      }}
    />
  </button>
);

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"chat" | "contacts" | "me">("chat");

  const [me, setMe] = useState<Me | null>(null);
  const [meNicknameDraft, setMeNicknameDraft] = useState("");
  const [meBioDraft, setMeBioDraft] = useState("");

  const [contactsRaw, setContactsRaw] = useState<ContactRaw[]>([]);
  const [conversations, setConversations] = useState<ConversationRaw[]>([]);
  const [groups, setGroups] = useState<GroupRaw[]>([]);
  const [meshGroups, setMeshGroups] = useState<MeshserverGroupThread[]>([]);
  const [requestsRaw, setRequestsRaw] = useState<FriendRequestRaw[]>([]);

  const [messages, setMessages] = useState<
    Array<DirectMessage | GroupMessage | MeshserverSyncMessage>
  >([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const [badAvatarUrls, setBadAvatarUrls] = useState<Set<string>>(new Set());
  const [goodAvatarUrls, setGoodAvatarUrls] = useState<Set<string>>(new Set());
  const loadedAvatarUrlsRef = React.useRef<Set<string>>(new Set());

  const contactAvatarMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of contactsRaw) {
      const url = avatarUrl(c.avatar);
      if (url) map.set(c.peer_id, url);
    }
    return map;
  }, [contactsRaw]);

  const contacts = useMemo(
    () =>
      contactsRaw.map(c => ({
        id: c.peer_id,
        name: c.nickname || shortPeer(c.peer_id),
        remark: c.nickname || "",
        avatarUrl: avatarUrl(c.avatar),
        bio: c.bio || "",
        lastSeen: formatTime(c.last_seen_at),
        blocked: !!c.blocked
      })),
    [contactsRaw]
  );
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);

  const threads = useMemo(
    () =>
      [
        ...conversations.map(conv => ({
          id: conv.conversation_id,
          kind: "direct" as ThreadKind,
          peerId: conv.peer_id,
          title: displayName(contactsRaw, conv.peer_id, shortPeer(conv.peer_id)),
          subtitle: shortPeer(conv.peer_id),
          avatarUrl: contactAvatarMap.get(conv.peer_id),
          lastMessage: conv.last_message?.plaintext || "",
          lastTime: relativeTime(conv.updated_at),
          unread: 0
        })),
        ...groups.map(g => ({
          id: g.group_id,
          kind: "group" as ThreadKind,
          title: g.title || "未命名群",
          subtitle: `成员 ${g.member_count || 0}`,
          lastMessage: g.last_message?.plaintext || "",
          lastTime: relativeTime(g.last_message_at || g.updated_at),
          unread: 0
        })),
        ...meshGroups.map(mg => ({
          id: mg.threadId,
          kind: "meshserver_group" as ThreadKind,
          title: mg.title,
          subtitle: "中心化群",
          lastMessage: "",
          lastTime: "",
          unread: 0,
          connectionName: mg.connectionName,
          myUserId: mg.myUserId
        }))
      ],
    [conversations, groups, meshGroups, contactsRaw, contactAvatarMap]
  );

  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [selectedThreadKind, setSelectedThreadKind] = useState<ThreadKind>("direct");
  const [isMobile, setIsMobile] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  const [contactsMobileView, setContactsMobileView] = useState<"list" | "detail">(
    "list"
  );
  const [fileSending, setFileSending] = useState<null | { text: string; error?: boolean }>(
    null
  );
  const [msgMenu, setMsgMenu] = useState<null | {
    x: number;
    y: number;
    kind: ThreadKind;
    threadId: string;
    msgId: string;
  }>(null);
  const [selectedGroupDetails, setSelectedGroupDetails] = useState<GroupDetails | null>(
    null
  );
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [addFriendOpen, setAddFriendOpen] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [meshJoinOpen, setMeshJoinOpen] = useState(false);
  const [meshJoinStep, setMeshJoinStep] = useState<"peer" | "server" | "channel">("peer");
  const [meshPeerIdDraft, setMeshPeerIdDraft] = useState("");
  const [meshConnection, setMeshConnection] = useState<MeshserverConnectionRaw | null>(null);
  const [meshServers, setMeshServers] = useState<MeshserverServerRaw[]>([]);
  const [meshChannels, setMeshChannels] = useState<MeshserverChannelRaw[]>([]);
  const [meshSelectedSpaceId, setMeshSelectedSpaceId] = useState<string>("");
  const [meshMyPermissions, setMeshMyPermissions] = useState<{
    can_create_channel?: boolean;
  } | null>(null);
  const [meshCanCreateSpace, setMeshCanCreateSpace] = useState<boolean | null>(null);
  const [meshCreateSpaceName, setMeshCreateSpaceName] = useState("");
  const [meshCreateSpaceDesc, setMeshCreateSpaceDesc] = useState("");
  const [meshCreateSpaceVisibility, setMeshCreateSpaceVisibility] = useState<"public" | "private">(
    "public"
  );
  const [meshCreateChannelType, setMeshCreateChannelType] = useState<1 | 2>(1);
  const [meshCreateChannelName, setMeshCreateChannelName] = useState("");
  const [meshCreateChannelDesc, setMeshCreateChannelDesc] = useState("");
  const [meshCreateChannelVisibility, setMeshCreateChannelVisibility] = useState<"public" | "private">("public");
  const [meshCreateChannelSlowModeSeconds, setMeshCreateChannelSlowModeSeconds] = useState<number>(0);
  const [addFriendPeerId, setAddFriendPeerId] = useState("");
  const [addFriendIntro, setAddFriendIntro] = useState("你好，我想和你开始聊天。");
  const [createGroupTitle, setCreateGroupTitle] = useState("");
  const [createGroupMemberIds, setCreateGroupMemberIds] = useState<Set<string>>(
    new Set()
  );
  const [createGroupMemberQuery, setCreateGroupMemberQuery] = useState("");
  const [actionBusy, setActionBusy] = useState<null | string>(null);

  // 群资料（管理员可改名/解散/邀请）
  const [groupProfileOpen, setGroupProfileOpen] = useState(false);
  const [groupTitleDraft, setGroupTitleDraft] = useState("");
  const [groupInviteQuery, setGroupInviteQuery] = useState("");
  const [groupInviteIds, setGroupInviteIds] = useState<Set<string>>(new Set());
  const [groupDissolveReason, setGroupDissolveReason] = useState("");

  // 自动删除（retention）选择弹窗
  const [retentionModalOpen, setRetentionModalOpen] = useState(false);
  const [retentionUnit, setRetentionUnit] = useState<
    "month" | "week" | "day" | "hour" | "off"
  >(
    "off"
  );
  const [retentionValue, setRetentionValue] = useState<number>(1);
  const [retentionSaving, setRetentionSaving] = useState(false);
  const [retentionTarget, setRetentionTarget] = useState<
    null | { kind: ThreadKind; id: string }
  >(null);

  const selectedThread = useMemo(
    () =>
      threads.find(
        t => t.id === selectedThreadId && t.kind === selectedThreadKind
      ) || null,
    [threads, selectedThreadId, selectedThreadKind]
  );

  const selectedConversation = useMemo(() => {
    if (selectedThreadKind !== "direct" || !selectedThreadId) return null;
    return conversations.find(c => c.conversation_id === selectedThreadId) || null;
  }, [selectedThreadKind, selectedThreadId, conversations]);

  const selectedGroup = useMemo(() => {
    if (selectedThreadKind !== "group" || !selectedThreadId) return null;
    return groups.find(g => g.group_id === selectedThreadId) || null;
  }, [selectedThreadKind, selectedThreadId, groups]);

  const openRetentionModal = () => {
    if (!selectedConversation?.conversation_id) return;
    setRetentionTarget({ kind: "direct", id: selectedConversation.conversation_id });
    const minutes = selectedConversation.retention_minutes ?? 0;
    const preset = retentionUnitValueFromMinutes(minutes);
    setRetentionUnit(preset.unit);
    setRetentionValue(preset.value);
    setRetentionModalOpen(true);
  };

  const saveRetention = async () => {
    if (!retentionTarget?.id) return;
    const minutes = retentionMinutesFrom(retentionUnit, retentionValue);
    if (minutes < 0 || minutes > 525600) {
      alert("自动删除时间必须是 0 或 1~525600 分钟");
      return;
    }
    setRetentionSaving(true);
    try {
      if (retentionTarget.kind === "direct") {
        await post(
          `/api/v1/chat/conversations/${encodeURIComponent(
            retentionTarget.id
          )}/retention`,
          { retention_minutes: minutes }
        );
        const convs = await get<ConversationRaw[]>(
          "/api/v1/chat/conversations"
        );
      setConversations(
        normalizeEntityList<ConversationRaw>(convs, ["conversations"])
      );
      } else {
        await post(
          `/api/v1/groups/${encodeURIComponent(retentionTarget.id)}/retention`,
          { retention_minutes: minutes }
        );
        const grps = await get<GroupRaw[]>("/api/v1/groups");
        setGroups(normalizeEntityList<GroupRaw>(grps, ["groups"]));
        await loadThreadMessages("group", retentionTarget.id);
      }
      setRetentionModalOpen(false);
    } catch (err: any) {
      console.error("保存自动删除失败:", err);
      alert("保存自动删除失败：" + (err?.message || String(err)));
    } finally {
      setRetentionSaving(false);
    }
  };

  const selectedThreadAvatarUrl = useMemo(() => {
    if (!selectedThread) return undefined;
    if (selectedThread.kind !== "direct") return (selectedThread as any).avatarUrl as
      | string
      | undefined;
    const peerId = (selectedThread as any).peerId as string | undefined;
    if (!peerId) return (selectedThread as any).avatarUrl as string | undefined;
    return contactAvatarMap.get(peerId) || (selectedThread as any).avatarUrl;
  }, [selectedThread, contactAvatarMap]);

  const resolveAvatarSrc = (src?: string) => {
    const s = (src || "").trim();
    if (!s) return undefined;
    if (badAvatarUrls.has(s)) return undefined;
    // 只有成功载入过的图片才交给 Avatar，避免 broken 图示
    return goodAvatarUrls.has(s) ? s : undefined;
  };

  const selectedContact = useMemo(
    () => contacts.find(c => c.id === selectedContactId) || null,
    [contacts, selectedContactId]
  );

  const [contactRemarkDraft, setContactRemarkDraft] = useState("");
  const [contactRemarkSaving, setContactRemarkSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [meRes, contactsRes, convs, grps, requestsRes] = await Promise.all([
          get<Me>("/api/v1/chat/me"),
          get<ContactRaw[]>("/api/v1/chat/contacts"),
          get<ConversationRaw[]>("/api/v1/chat/conversations"),
          get<GroupRaw[]>("/api/v1/groups"),
          get<FriendRequestRaw[]>("/api/v1/chat/requests")
        ]);
        setMe(meRes || null);
        setMeNicknameDraft(meRes?.nickname || "");
        setMeBioDraft(meRes?.bio || "");
        setContactsRaw(normalizeEntityList<ContactRaw>(contactsRes, ["contacts"]));
        setConversations(
          normalizeEntityList<ConversationRaw>(convs, ["conversations"])
        );
        setGroups(normalizeEntityList<GroupRaw>(grps, ["groups"]));
        setRequestsRaw(normalizeEntityList<FriendRequestRaw>(requestsRes, ["requests"]));

        if (Array.isArray(contactsRes) && contactsRes.length > 0) {
          setSelectedContactId(contactsRes[0].peer_id);
        }
      if (Array.isArray(convs) && convs.length > 0) {
          setSelectedThreadId(convs[0].conversation_id);
          setSelectedThreadKind("direct");
        } else if (Array.isArray(grps) && grps.length > 0) {
          setSelectedThreadId(grps[0].group_id);
          setSelectedThreadKind("group");
        }

        // meshserver：开机自动拉取已加入的频道，用于会话列表展示
        try {
          const connResp = await get<any>("/api/v1/meshserver/connections").catch(() => null);
          const connections: any[] = Array.isArray(connResp?.connections) ? connResp.connections : [];
          const activeConn = connections[0] || null;
          const connectionName: string | undefined = activeConn?.name;
          const myUserId: string | undefined = activeConn?.user_id;

          if (connectionName) {
            const q = `?connection=${encodeURIComponent(connectionName)}`;

            // 1) 先读取用户加入的 space 列表（文档：my_servers）
            const myServersResp = await get<any>(
              `/api/v1/meshserver/my_servers${q}`
            ).catch(() => null);

            const myServers: any[] = Array.isArray(myServersResp?.servers)
              ? myServersResp.servers
              : [];

            const spaceIds = myServers
              .map(e => e?.space?.space_id || e?.space_id || e?.server_id || "")
              .filter(Boolean);

            // 2) 再读取每个 space 下当前用户加入的 group（文档：my_groups）
            const nextThreads: MeshserverGroupThread[] = [];

            for (const spaceId of spaceIds) {
              const groupsResp = await get<any>(
                `/api/v1/meshserver/spaces/${encodeURIComponent(spaceId)}/my_groups${q}`
              ).catch(() => null);

              const groups = normalizeEntityList<any>(groupsResp, ["groups"]);

              for (const g of groups) {
                const channelId =
                  g?.channel_id || g?.channelId || g?.id || "";
                if (!channelId) continue;
                if ((g as any)?.can_view === false) continue;
                nextThreads.push({
                  kind: "meshserver_group",
                  threadId: channelId,
                  channel_id: channelId,
                  server_id: spaceId,
                  title: g?.name || "未命名群",
                  subtitle: "中心化群",
                  connectionName,
                  myUserId
                });
              }
            }

            if (nextThreads.length) {
              setMeshGroups(prev => {
                const map = new Map(prev.map(t => [t.threadId, t]));
                for (const t of nextThreads) map.set(t.threadId, t);
                return Array.from(map.values());
              });
            }
          }
        } catch (meshErr) {
          // 非关键：meshserver 异常不影响原聊天
          console.error("meshserver 初始化失败:", meshErr);
        }
      } catch (err) {
        console.error("初始化失败:", err);
      }
    })();
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const apply = () => {
      setIsMobile(mq.matches);
    };
    if (!mq) {
      setIsMobile(false);
      return;
    }
    apply();
    try {
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    } catch {
      // 某些 WebView 可能不支持 addEventListener(change)
      window.onresize = () => apply();
      return () => {
        window.onresize = null;
      };
    }
  }, []);

  useEffect(() => {
    if (!isMobile) return;
    // 手机端：没有选中会话时回到列表；选中后默认进聊天页
    if (!selectedThreadId) {
      setMobileView("list");
    }
  }, [isMobile, selectedThreadId]);

  useEffect(() => {
    if (!isMobile) return;
    if (activeTab !== "contacts") return;
    if (!selectedContactId) {
      setContactsMobileView("list");
    }
  }, [isMobile, activeTab, selectedContactId]);

  useEffect(() => {
    setContactRemarkDraft(selectedContact?.remark || "");
  }, [selectedContactId, selectedContact?.remark]);

  useEffect(() => {
    const candidates: string[] = [];
    for (const url of contactAvatarMap.values()) candidates.push(url);
    const myUrl = avatarUrl(me?.avatar);
    if (myUrl) candidates.push(myUrl);

    for (const url of candidates) {
      if (loadedAvatarUrlsRef.current.has(url)) continue;
      loadedAvatarUrlsRef.current.add(url);

      const img = new Image();
      img.onload = () => {
        setGoodAvatarUrls(prev => {
          if (prev.has(url)) return prev;
          const next = new Set(prev);
          next.add(url);
          return next;
        });
      };
      img.onerror = () => {
        setBadAvatarUrls(prev => {
          const next = new Set(prev);
          next.add(url);
          return next;
        });
      };
      img.src = url;
    }
  }, [contactAvatarMap, me?.avatar]);

  const loadThreadMessages = React.useCallback(
    async (kind: ThreadKind, id: string) => {
      try {
        setMessagesLoading(true);
        if (kind === "group") {
          // 同步拉取群详细资料，用于权限（admin 可撤回所有人）
          const details = await get<GroupDetails>(
            `/api/v1/groups/${encodeURIComponent(id)}`
          ).catch(() => null);
          setSelectedGroupDetails(details);
          const resp = await get<any>(
            `/api/v1/groups/${encodeURIComponent(id)}/messages`
          );
          setMessages(normalizeList<GroupMessage>(resp));
        } else if (kind === "meshserver_group") {
          setSelectedGroupDetails(null);
          const thread = meshGroups.find(t => t.threadId === id) || null;
          const connectionName = thread?.connectionName;
          if (!thread || !connectionName) {
            setMessages([]);
            return;
          }

          const resp = await get<any>(
            `/api/v1/meshserver/channels/${encodeURIComponent(
              id
            )}/sync?connection=${encodeURIComponent(
              connectionName
            )}&after_seq=0&limit=200`
          ).catch(() => ({ messages: [] }));

          const list = Array.isArray(resp?.messages) ? resp.messages : [];
          setMessages(list as MeshserverSyncMessage[]);
        } else {
          setSelectedGroupDetails(null);
          const resp = await get<any>(
            `/api/v1/chat/conversations/${encodeURIComponent(id)}/messages`
          );
          setMessages(normalizeList<DirectMessage>(resp));
        }
      } catch (err) {
        console.error("载入讯息失败:", err);
        setMessages([]);
      } finally {
        setMessagesLoading(false);
      }
    },
    [meshGroups]
  );

  useEffect(() => {
    if (!selectedThreadId) {
      setMessages([]);
      return;
    }
    loadThreadMessages(selectedThreadKind, selectedThreadId);
  }, [selectedThreadId, selectedThreadKind, loadThreadMessages]);

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || !selectedThreadId) return;
    setSending(true);
    try {
      if (selectedThreadKind === "meshserver_group") {
        const thread = meshGroups.find(t => t.threadId === selectedThreadId) || null;
        const connectionName = thread?.connectionName;
        if (!thread || !connectionName) {
          alert("未找到 meshserver 频道上下文");
          return;
        }
        await post(
          `/api/v1/meshserver/channels/${encodeURIComponent(
            selectedThreadId
          )}/messages?connection=${encodeURIComponent(connectionName)}`,
          {
            client_msg_id: `local-${Date.now()}`,
            message_type: "text",
            text
          }
        );
        await loadThreadMessages("meshserver_group", selectedThreadId);
      } else if (selectedThreadKind === "group") {
        await post(`/api/v1/groups/${encodeURIComponent(selectedThreadId)}/messages`, {
          text
        });
        const [list, grps] = await Promise.all([
          get<GroupMessage[]>(
            `/api/v1/groups/${encodeURIComponent(selectedThreadId)}/messages`
          ),
          get<GroupRaw[]>("/api/v1/groups")
        ]);
        setMessages(Array.isArray(list) ? list : []);
        setGroups(Array.isArray(grps) ? grps : []);
      } else {
        await post(
          `/api/v1/chat/conversations/${encodeURIComponent(
            selectedThreadId
          )}/messages`,
          { text }
        );
        const [list, convs] = await Promise.all([
          get<DirectMessage[]>(
            `/api/v1/chat/conversations/${encodeURIComponent(
              selectedThreadId
            )}/messages`
          ),
          get<ConversationRaw[]>("/api/v1/chat/conversations")
        ]);
        setMessages(Array.isArray(list) ? list : []);
        setConversations(Array.isArray(convs) ? convs : []);
      }
    } catch (err: any) {
      console.error("发送讯息失败:", err);
      alert("发送失败：" + (err?.message || String(err)));
    } finally {
      setSending(false);
    }
  };

  const sendFileForCurrentThread = async (file: File) => {
    if (!selectedThreadId) return;
    setFileSending({ text: `上传中：${file.name}` });
    try {
      if (selectedThreadKind === "meshserver_group") {
        const thread = meshGroups.find(t => t.threadId === selectedThreadId) || null;
        const connectionName = thread?.connectionName;
        if (!connectionName) {
          throw new Error("未找到 meshserver 频道上下文（connectionName）");
        }

        const form = new FormData();
        // 文档：/messages/image 接受字段 image（或 file）
        form.append("image", file);

        const url = `/api/v1/meshserver/channels/${encodeURIComponent(
          selectedThreadId
        )}/messages/image?connection=${encodeURIComponent(connectionName)}`;

        const resp = await fetch(api(url), { method: "POST", body: form });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error((data as any).error || resp.statusText);

        setFileSending(null);
        await loadThreadMessages("meshserver_group", selectedThreadId);
        return;
      }

      const form = new FormData();
      form.append("file", file);
      const path =
        selectedThreadKind === "group"
          ? `/api/v1/groups/${encodeURIComponent(selectedThreadId)}/files`
          : `/api/v1/chat/conversations/${encodeURIComponent(selectedThreadId)}/files`;

      const resp = await fetch(api(path), { method: "POST", body: form });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error((data as any).error || resp.statusText);

      setFileSending(null);
      await loadThreadMessages(selectedThreadKind, selectedThreadId);
      if (selectedThreadKind === "group") {
        const grps = await get<GroupRaw[]>("/api/v1/groups");
        setGroups(normalizeEntityList<GroupRaw>(grps, ["groups"]));
      } else {
        const convs = await get<ConversationRaw[]>(
          "/api/v1/chat/conversations"
        );
        setConversations(
          normalizeEntityList<ConversationRaw>(convs, ["conversations"])
        );
      }
    } catch (err: any) {
      console.error("发送文件失败:", err);
      setFileSending({ text: `发送文件失败：${err?.message || String(err)}`, error: true });
      setTimeout(() => setFileSending(null), 3500);
    }
  };

  const revokeDirectMessage = async (conversationId: string, msgId: string) => {
    if (!conversationId || !msgId) return;
    if (!window.confirm("确认撤回这条消息吗？撤回后双方都会删除这条消息。")) return;
    try {
      await post(
        `/api/v1/chat/conversations/${encodeURIComponent(
          conversationId
        )}/messages/${encodeURIComponent(msgId)}/revoke`
      );
      await loadThreadMessages("direct", conversationId);
      const convs = await get<ConversationRaw[]>("/api/v1/chat/conversations");
      setConversations(Array.isArray(convs) ? convs : []);
    } catch (err: any) {
      console.error("撤回失败:", err);
      alert("撤回失败：" + (err?.message || String(err)));
    }
  };

  const revokeGroupMessage = async (groupId: string, msgId: string) => {
    if (!groupId || !msgId) return;
    if (!window.confirm("确认撤回这条群消息吗？")) return;
    try {
      await post(
        `/api/v1/groups/${encodeURIComponent(groupId)}/messages/${encodeURIComponent(
          msgId
        )}/revoke`
      );
      await loadThreadMessages("group", groupId);
      const grps = await get<GroupRaw[]>("/api/v1/groups");
      setGroups(normalizeEntityList<GroupRaw>(grps, ["groups"]));
    } catch (err: any) {
      console.error("群消息撤回失败:", err);
      alert("撤回失败：" + (err?.message || String(err)));
    }
  };

  const closeMsgMenu = React.useCallback(() => setMsgMenu(null), []);

  useEffect(() => {
    if (!msgMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMsgMenu();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [msgMenu, closeMsgMenu]);

  useEffect(() => {
    if (!plusMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPlusMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [plusMenuOpen]);

  const openMsgMenuAt = React.useCallback(
    (x: number, y: number, kind: ThreadKind, threadId: string, msgId: string) => {
      const pad = 8;
      const w = 180;
      const h = 92;
      const maxX = Math.max(pad, window.innerWidth - w - pad);
      const maxY = Math.max(pad, window.innerHeight - h - pad);
      setMsgMenu({
        x: Math.min(Math.max(pad, x), maxX),
        y: Math.min(Math.max(pad, y), maxY),
        kind,
        threadId,
        msgId
      });
    },
    []
  );

  const createLongPressHandlers = React.useCallback(
    (
      kind: ThreadKind,
      threadId: string,
      msgId: string,
      enabled: boolean
    ): {
      onPointerDown: React.PointerEventHandler;
      onPointerUp: React.PointerEventHandler;
      onPointerCancel: React.PointerEventHandler;
      onPointerMove: React.PointerEventHandler;
      onContextMenu: React.MouseEventHandler;
    } => {
      let timer: number | null = null;
      let startX = 0;
      let startY = 0;

      const clear = () => {
        if (timer != null) {
          window.clearTimeout(timer);
          timer = null;
        }
      };

      return {
        onPointerDown: (e) => {
          if (!enabled) return;
          if (e.pointerType === "mouse") return; // 滑鼠用右键
          startX = e.clientX;
          startY = e.clientY;
          clear();
          timer = window.setTimeout(() => {
            openMsgMenuAt(e.clientX, e.clientY, kind, threadId, msgId);
            clear();
          }, 520);
        },
        onPointerUp: () => clear(),
        onPointerCancel: () => clear(),
        onPointerMove: (e) => {
          if (timer == null) return;
          const dx = Math.abs(e.clientX - startX);
          const dy = Math.abs(e.clientY - startY);
          if (dx > 10 || dy > 10) clear();
        },
        onContextMenu: (e) => {
          if (!enabled) return;
          e.preventDefault();
          openMsgMenuAt(e.clientX, e.clientY, kind, threadId, msgId);
        }
      };
    },
    [openMsgMenuAt]
  );

  const handlePasteMaybeSendImage = async (e: React.ClipboardEvent) => {
    const dt = e.clipboardData;
    if (!dt?.items?.length) return;
    const item = Array.from(dt.items).find(
      it => it.kind === "file" && isImageMime(it.type)
    );
    if (!item) return;
    const blob = item.getAsFile();
    if (!blob) return;
    e.preventDefault();
    const file = new File([blob], `pasted-image-${Date.now()}.png`, {
      type: blob.type || "image/png"
    });
    await sendFileForCurrentThread(file);
  };

  const connectPeer = async (peerId: string) => {
    const id = peerId.trim();
    if (!id) return;
    await post(`/api/v1/chat/peers/${encodeURIComponent(id)}/connect`);
  };

  const sendChatRequest = async () => {
    const toPeerId = addFriendPeerId.trim();
    if (!toPeerId) return;
    setActionBusy("addFriend");
    try {
      await connectPeer(toPeerId).catch(() => null);
      await post(`/api/v1/chat/requests`, {
        to_peer_id: toPeerId,
        intro_text: addFriendIntro.trim()
      });
      setAddFriendOpen(false);
      setPlusMenuOpen(false);
      alert("好友请求已发送");
    } catch (err: any) {
      alert("发送好友请求失败：" + (err?.message || String(err)));
    } finally {
      setActionBusy(null);
    }
  };

  const createGroup = async () => {
    const title = createGroupTitle.trim();
    const members = Array.from(createGroupMemberIds);
    if (!title) {
      alert("群标题不能为空");
      return;
    }
    setActionBusy("createGroup");
    try {
      const created = await post<{ group_id: string }>(`/api/v1/groups`, {
        title,
        members
      });
      setCreateGroupOpen(false);
      setPlusMenuOpen(false);
      setCreateGroupTitle("");
      setCreateGroupMemberIds(new Set());
      setCreateGroupMemberQuery("");
      const grps = await get<GroupRaw[]>("/api/v1/groups");
      setGroups(Array.isArray(grps) ? grps : []);
      if (created?.group_id) {
        await openGroupThread(created.group_id);
      }
      alert("群聊已建立");
    } catch (err: any) {
      alert("建立群聊失败：" + (err?.message || String(err)));
    } finally {
      setActionBusy(null);
    }
  };

  const openMeshJoin = () => {
    setPlusMenuOpen(false);
    setMeshJoinOpen(true);
    setMeshJoinStep("peer");
    setMeshPeerIdDraft("");
    setMeshConnection(null);
    setMeshServers([]);
    setMeshChannels([]);
    setMeshSelectedSpaceId("");
    setMeshMyPermissions(null);
    setMeshCanCreateSpace(null);
    setMeshCreateSpaceName("");
    setMeshCreateSpaceDesc("");
    setMeshCreateSpaceVisibility("public");
    setMeshCreateChannelType(1);
    setMeshCreateChannelName("");
    setMeshCreateChannelDesc("");
    setMeshCreateChannelVisibility("public");
    setMeshCreateChannelSlowModeSeconds(0);
  };

  const connectMeshserver = async (peerId: string) => {
    const id = peerId.trim();
    if (!id) throw new Error("meshserver peer_id 不能为空");
    const resp = await post<any>(`/api/v1/meshserver/connections`, {
      peer_id: id,
      client_agent: "meshproxy-client",
      protocol_id: "/meshserver/session/1.0.0"
    });
    const conn = resp?.connection as MeshserverConnectionRaw | undefined;
    if (!conn?.name) throw new Error("连接 meshserver 失败：connection.name 缺失");
    return conn;
  };

  const loadSpaces = async (connectionName: string) => {
    const resp = await get<any>(
      `/api/v1/meshserver/spaces?connection=${encodeURIComponent(connectionName)}`
    ).catch(() => ({}));

    // 只读取 resp.spaces；仍保留“包裹层级变化”（items/data/results 等）解析。
    let list: any[] = [];
    const spacesVal = resp?.spaces;
    const dataSpacesVal = resp?.data?.spaces;
    const resultSpacesVal = resp?.result?.spaces;

    const extractList = (v: any): any[] => {
      if (Array.isArray(v)) return v;
      if (!v || typeof v !== "object") return [];
      if (Array.isArray(v.items)) return v.items;
      if (Array.isArray(v.data)) return v.data;
      if (Array.isArray(v.results)) return v.results;
      if (Array.isArray(v.list)) return v.list;
      if (Array.isArray(v.rows)) return v.rows;
      if (Array.isArray(v.entries)) return v.entries;
      if (Array.isArray(v.records)) return v.records;
      if (Array.isArray(v.page?.items)) return v.page.items;
      if (Array.isArray(v.spaces)) return v.spaces;
      // 最後兜底：找对象里“第一個陣列”
      for (const k of Object.keys(v)) {
        const vv = (v as any)[k];
        if (Array.isArray(vv)) return vv;
      }
      return [];
    };

    list = extractList(spacesVal);
    if (!list.length) list = extractList(dataSpacesVal);
    if (!list.length) list = extractList(resultSpacesVal);
    if (!list.length) list = extractList(resp?.items);
    if (!list.length) list = normalizeEntityList<any>(resp, ["spaces"]);

    const mapped = (Array.isArray(list) ? list : []).map(item => {
      // item 可能是：{space:{...}} / {server:{...}} / {...}（直接就是 space）
      const spaceObj = (item && (item.space || item.server)) || item || {};

      // 你的后端现在统一使用 `id` 作为 space 标识
      const spaceId =
        spaceObj?.id ??
        spaceObj?.space_id ??
        spaceObj?.spaceId ??
        spaceObj?.spaceID ??
        spaceObj?.space_uuid ??
        spaceObj?.spaceUuid ??
        item?.id ??
        item?.space_id ??
        item?.spaceId ??
        item?.spaceID ??
        spaceObj?.server_id ??
        spaceObj?.serverId ??
        item?.server_id ??
        item?.serverId ??
        "";

      const name =
        spaceObj?.name ??
        spaceObj?.title ??
        spaceObj?.space_name ??
        spaceObj?.spaceName ??
        item?.name ??
        item?.title ??
        "";

      return {
        // 注意：spaceId 可能是數字 0；不能用 `|| ""` 否則會被當成 false 變成空字串
        id: String(spaceId ?? ""),
        name: String(name || ""),
        avatar_url:
          spaceObj?.avatar_url ?? spaceObj?.avatarUrl ?? spaceObj?.avatar ?? item?.avatar_url,
        description: spaceObj?.description ?? spaceObj?.desc ?? "",
        visibility: spaceObj?.visibility ?? spaceObj?.public ?? spaceObj?.is_public,
        member_count:
          spaceObj?.member_count ??
          spaceObj?.memberCount ??
          spaceObj?.members_count ??
          spaceObj?.membersCount,
        allow_channel_creation:
          spaceObj?.allow_channel_creation ??
          spaceObj?.allowChannelCreation ??
          spaceObj?.can_create_channel ??
          item?.allow_channel_creation
      } as MeshserverServerRaw;
    });

    setMeshServers(mapped.filter(s => (s.id ?? "") !== ""));
  };

  const loadMeshChannels = async (serverId: string, connectionName: string) => {
    const resp = await get<any>(
      `/api/v1/meshserver/spaces/${encodeURIComponent(serverId)}/channels?connection=${encodeURIComponent(connectionName)}`
    ).catch(() => ({}));
    setMeshChannels(normalizeEntityList<MeshserverChannelRaw>(resp, ["channels"]));
  };

  const loadMeshMyPermissions = async (serverId: string, connectionName: string) => {
    const resp = await get<any>(
      `/api/v1/meshserver/spaces/${encodeURIComponent(
        serverId
      )}/my_permissions?connection=${encodeURIComponent(connectionName)}`
    ).catch(() => null);
    setMeshMyPermissions(resp && typeof resp === "object" ? resp : null);
  };

  const loadMeshCanCreateSpace = async (connectionName: string) => {
    // 目前文档未覆盖 can_create_space 的字段名；这里做兼容解析。
    // 先读 my_servers（响应结构：{ servers: [{ space: {...}, role: ... }] }）
    const resp = await get<any>(
      `/api/v1/meshserver/my_servers?connection=${encodeURIComponent(connectionName)}`
    ).catch(() => null);

    const direct =
      resp?.can_create_space ??
      resp?.canCreateSpace ??
      resp?.permissions?.can_create_space ??
      resp?.permissions?.canCreateSpace;

    const servers: any[] = Array.isArray(resp?.servers) ? resp.servers : [];
    const nested = servers.some(s => {
      const v =
        s?.can_create_space ??
        s?.canCreateSpace ??
        s?.permissions?.can_create_space ??
        s?.permissions?.canCreateSpace ??
        s?.space?.can_create_space ??
        s?.space?.canCreateSpace ??
        s?.space?.allow_space_creation ??
        s?.space?.allowSpaceCreation;
      return !!v;
    });

    setMeshCanCreateSpace(Boolean(direct || nested));
  };

  const joinMeshChannel = async (channel: MeshserverChannelRaw) => {
    if (!meshConnection) return;
    const anyCh = channel as any;
    const channelId: string | undefined =
      anyCh?.channel_id || anyCh?.channelId || anyCh?.id;
    if (!channelId) return;
    const serverId: string | undefined = anyCh?.server_id || anyCh?.serverId;
    const channelName: string | undefined = anyCh?.name || anyCh?.title;
    const channelType: number = Number(anyCh?.type);
    setActionBusy("meshJoin");
    try {
      await post(
        `/api/v1/meshserver/channels/${encodeURIComponent(channelId)}/join?connection=${encodeURIComponent(meshConnection.name)}`,
        { last_seen_seq: 0 }
      );

      setMeshGroups(prev => {
        const exists = prev.some(t => t.threadId === channelId);
        if (exists) return prev;
        const next: MeshserverGroupThread = {
          kind: "meshserver_group",
          threadId: channelId,
          channel_id: channelId,
          server_id: serverId || "",
          title: channelName || "未命名频道",
          subtitle: channelType === 2 ? "中心化广播" : "中心化群",
          connectionName: meshConnection.name,
          myUserId: meshConnection.user_id
        };
        return [next, ...prev];
      });

      // 跳转聊天页
      setSelectedThreadKind("meshserver_group");
      setSelectedThreadId(channelId);
      setActiveTab("chat");
      setMeshJoinOpen(false);
      setMeshJoinStep("peer");
      if (isMobile) setMobileView("chat");
    } catch (err: any) {
      alert("加入群聊失败：" + (err?.message || String(err)));
    } finally {
      setActionBusy(null);
    }
  };

  const createMeshChannelAndMaybeJoin = async () => {
    if (!meshConnection) return;
    if (!meshSelectedSpaceId) return;
    const name = meshCreateChannelName.trim();
    if (!name) {
      alert("频道名称不能为空");
      return;
    }

    const description = meshCreateChannelDesc.trim();
    const slowMode = Number.isFinite(meshCreateChannelSlowModeSeconds)
      ? Math.max(0, Math.floor(meshCreateChannelSlowModeSeconds))
      : 0;

    setActionBusy("meshCreateChannel");
    try {
      const connectionName = meshConnection.name;
      const serverId = meshSelectedSpaceId;

      const resp = await (meshCreateChannelType === 1
        ? post<any>(
            `/api/v1/meshserver/spaces/${encodeURIComponent(
              serverId
            )}/groups?connection=${encodeURIComponent(connectionName)}`,
            {
              name,
              description,
              visibility: meshCreateChannelVisibility,
              slow_mode_seconds: slowMode
            }
          )
        : post<any>(
            `/api/v1/meshserver/spaces/${encodeURIComponent(
              serverId
            )}/channels?connection=${encodeURIComponent(connectionName)}`,
            {
              name,
              description,
              visibility: meshCreateChannelVisibility,
              slow_mode_seconds: slowMode
            }
          ));

      const createdChannelId =
        resp?.channel_id ||
        resp?.channel?.channel_id ||
        resp?.channel?.id ||
        "";

      if (!createdChannelId) {
        alert("创建成功但未返回 channel_id");
        // 至少刷新列表
        await loadMeshChannels(serverId, connectionName);
        return;
      }

      // 创建后直接加入
      await joinMeshChannel({
        channel_id: createdChannelId,
        server_id: resp?.channel?.server_id || serverId,
        type: meshCreateChannelType,
        name: resp?.channel?.name || name
      } as any);
    } catch (err: any) {
      alert("创建频道失败：" + (err?.message || String(err)));
    } finally {
      setActionBusy(null);
    }
  };

  const createMeshSpaceAndMaybeSelect = async () => {
    if (!meshConnection) return;
    const name = meshCreateSpaceName.trim();
    if (!name) {
      alert("space 名称不能为空");
      return;
    }

    setActionBusy("meshCreateSpace");
    try {
      const description = meshCreateSpaceDesc.trim();
      const payload = {
        name,
        description,
        visibility: meshCreateSpaceVisibility
      };

      // 这里的创建接口在文档中未出现；按约定使用 /meshserver/spaces。
      const resp = await post<any>(
        `/api/v1/meshserver/spaces?connection=${encodeURIComponent(
          meshConnection.name
        )}`,
        payload
      );

      const createdSpaceId =
        resp?.space_id ||
        resp?.server_id ||
        resp?.space?.space_id ||
        resp?.server?.server_id ||
        "";

      if (!createdSpaceId) {
        // 至少刷新列表
        await loadSpaces(meshConnection.name);
        alert("创建 space 成功，但未返回 space_id");
        return;
      }

      await loadSpaces(meshConnection.name);
      setMeshSelectedSpaceId(createdSpaceId);

      await loadMeshChannels(createdSpaceId, meshConnection.name);
      await loadMeshMyPermissions(createdSpaceId, meshConnection.name);
      setMeshJoinStep("channel");
    } catch (err: any) {
      alert("创建 space 失败：" + (err?.message || String(err)));
    } finally {
      setActionBusy(null);
    }
  };

  const renderPlusMenu = () => {
    if (!plusMenuOpen) return null;
    return (
      <div
        onClick={() => setPlusMenuOpen(false)}
        style={{ position: "fixed", inset: 0, zIndex: 9998 }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: "fixed",
            top: 54,
            right: 12,
            width: 200,
            borderRadius: 12,
            background: "rgba(17,24,39,0.98)",
            border: "1px solid rgba(255,255,255,0.12)",
            boxShadow: "0 18px 60px rgba(0,0,0,0.45)",
            padding: 6
          }}
        >
          <button
            type="button"
            onClick={() => {
              setAddFriendOpen(true);
              setPlusMenuOpen(false);
            }}
            style={{
              width: "100%",
              padding: "10px 10px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "transparent",
              color: "#e5e7eb",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 700,
              textAlign: "left"
            }}
          >
            添加朋友
          </button>
          <button
            type="button"
            onClick={() => {
              setCreateGroupOpen(true);
              setPlusMenuOpen(false);
            }}
            style={{
              width: "100%",
              marginTop: 6,
              padding: "10px 10px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "transparent",
              color: "#e5e7eb",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 700,
              textAlign: "left"
            }}
          >
            发起群聊
          </button>
          <button
            type="button"
            onClick={openMeshJoin}
            style={{
              width: "100%",
              marginTop: 6,
              padding: "10px 10px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "transparent",
              color: "#e5e7eb",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 700,
              textAlign: "left"
            }}
          >
            加入服务器
          </button>
        </div>
      </div>
    );
  };

  const renderModal = (open: boolean, onClose: () => void, title: string, body: React.ReactNode) => {
    if (!open) return null;
    return (
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.55)" }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            width: "min(560px, 92vw)",
            margin: "10vh auto 0",
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(17,24,39,0.98)",
            boxShadow: "0 22px 80px rgba(0,0,0,0.55)",
            overflow: "hidden"
          }}
        >
          <div style={{ padding: "12px 14px", fontWeight: 800, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            {title}
          </div>
          <div style={{ padding: 14 }}>{body}</div>
        </div>
      </div>
    );
  };

  const localGroupRole = useMemo(() => {
    if (!me?.peer_id) return "";
    const members = selectedGroupDetails?.members || [];
    const mine = members.find(m => m.peer_id === me.peer_id);
    return (mine?.role || "").toLowerCase();
  }, [me?.peer_id, selectedGroupDetails]);

  const openGroupRetentionModal = () => {
    if (!selectedGroup?.group_id) return;
    // 仅管理员可设置
    if (localGroupRole !== "admin") return;
    const minutes = selectedGroup.retention_minutes ?? 0;
    const preset = retentionUnitValueFromMinutes(minutes);
    setRetentionTarget({ kind: "group", id: selectedGroup.group_id });
    setRetentionUnit(preset.unit);
    setRetentionValue(preset.value);
    setRetentionModalOpen(true);
  };

  const canRevokeGroupMessage = (senderPeerId: string) => {
    if (!me?.peer_id) return false;
    if (senderPeerId === me.peer_id) return true;
    return localGroupRole === "admin" || localGroupRole === "controller";
  };

  const renderMsgMenu = () => {
    if (!msgMenu) return null;
    return (
      <div
        onClick={closeMsgMenu}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            left: msgMenu.x,
            top: msgMenu.y,
            width: 180,
            borderRadius: 12,
            background: "rgba(17,24,39,0.98)",
            border: "1px solid rgba(255,255,255,0.12)",
            boxShadow: "0 18px 60px rgba(0,0,0,0.45)",
            padding: 6
          }}
        >
          <button
            type="button"
            onClick={async () => {
              const { kind, threadId, msgId } = msgMenu;
              closeMsgMenu();
              if (kind === "group") {
                await revokeGroupMessage(threadId, msgId);
              } else {
                await revokeDirectMessage(threadId, msgId);
              }
            }}
            style={{
              width: "100%",
              padding: "10px 10px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(248,81,73,0.12)",
              color: "#fecaca",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 700,
              textAlign: "left"
            }}
          >
            撤回
          </button>
          <button
            type="button"
            onClick={closeMsgMenu}
            style={{
              width: "100%",
              marginTop: 6,
              padding: "10px 10px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "transparent",
              color: "#e5e7eb",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
              textAlign: "left"
            }}
          >
            取消
          </button>
        </div>
      </div>
    );
  };

  const openGroupThread = async (groupId: string) => {
    setSelectedThreadId(groupId);
    setSelectedThreadKind("group");
    if (isMobile) setMobileView("chat");
    await loadThreadMessages("group", groupId);
  };

  const joinGroup = async (groupId: string) => {
    try {
      await post(`/api/v1/groups/${encodeURIComponent(groupId)}/join`);
      const grps = await get<GroupRaw[]>("/api/v1/groups");
      setGroups(Array.isArray(grps) ? grps : []);
      await openGroupThread(groupId);
      alert("已加入群聊");
    } catch (err: any) {
      console.error("加入群聊失败:", err);
      alert("加入群聊失败：" + (err?.message || String(err)));
    }
  };

  const handleUpdateContactRemark = async (id: string, remark: string) => {
    setContactsRaw(prev =>
      prev.map(c => (c.peer_id === id ? { ...c, nickname: remark } : c))
    );
    try {
      await post(`/api/v1/chat/contacts/${encodeURIComponent(id)}/nickname`, {
        nickname: remark
      });
    } catch (err: any) {
      console.error("保存备注失败:", err);
      alert("保存备注失败：" + (err?.message || String(err)));
    }
  };

  const handleSaveContactRemark = async (id: string) => {
    setContactRemarkSaving(true);
    try {
      await handleUpdateContactRemark(id, contactRemarkDraft);
    } finally {
      setContactRemarkSaving(false);
    }
  };

  const handleToggleBlockContact = async (id: string) => {
    const target = contactsRaw.find(c => c.peer_id === id);
    const blocked = !(target && target.blocked);
    setContactsRaw(prev =>
      prev.map(c => (c.peer_id === id ? { ...c, blocked } : c))
    );
    try {
      await post(`/api/v1/chat/contacts/${encodeURIComponent(id)}/block`, {
        blocked
      });
    } catch (err: any) {
      console.error("更新拉黑状态失败:", err);
      alert("更新拉黑状态失败：" + (err?.message || String(err)));
    }
  };

  const handleStartChatFromContact = async (peerId: string) => {
    const existing = conversations.find(c => c.peer_id === peerId);
    if (existing) {
      setSelectedThreadId(existing.conversation_id);
      setSelectedThreadKind("direct");
      setActiveTab("chat");
      return;
    }
    try {
      await post(`/api/v1/chat/peers/${encodeURIComponent(peerId)}/connect`);
    } catch (err) {
      console.warn("connect 失败，可忽略:", err);
    }
    alert("暂未找到现成会话，请在原页面发起聊天请求或等待对方同意。");
  };

  const handleAcceptFriendRequest = async (req: FriendRequestRaw) => {
    if (!req?.request_id) return;
    const reqId = req.request_id;
    const peerId = req.from_peer_id || "";
    setActionBusy("acceptRequest");
    try {
      await post(`/api/v1/chat/requests/${encodeURIComponent(reqId)}/accept`, {});

      // 刷新：请求箱、联系人、会话列表
      const [nextReqs, nextContacts, nextConvs] = await Promise.all([
        get<FriendRequestRaw[]>("/api/v1/chat/requests").catch(() => []),
        get<ContactRaw[]>("/api/v1/chat/contacts").catch(() => []),
        get<ConversationRaw[]>("/api/v1/chat/conversations").catch(() => [])
      ]);

      setRequestsRaw(normalizeEntityList<FriendRequestRaw>(nextReqs, ["requests"]));
      setContactsRaw(normalizeEntityList<ContactRaw>(nextContacts, ["contacts"]));
      setConversations(normalizeEntityList<ConversationRaw>(nextConvs, ["conversations"]));

      if (peerId) {
        const existing = Array.isArray(nextConvs)
          ? nextConvs.find(c => c.peer_id === peerId)
          : undefined;
        if (existing?.conversation_id) {
          setSelectedThreadId(existing.conversation_id);
          setSelectedThreadKind("direct");
          setActiveTab("chat");
          if (isMobile) setMobileView("chat");
        } else {
          await handleStartChatFromContact(peerId);
        }
      }
    } catch (err: any) {
      alert("接受好友请求失败：" + (err?.message || String(err)));
    } finally {
      setActionBusy(null);
    }
  };

  const handleRejectFriendRequest = async (req: FriendRequestRaw) => {
    if (!req?.request_id) return;
    const reqId = req.request_id;
    setActionBusy("rejectRequest");
    try {
      await post(`/api/v1/chat/requests/${encodeURIComponent(reqId)}/reject`, {});
      const nextReqs = await get<FriendRequestRaw[]>("/api/v1/chat/requests").catch(() => []);
      setRequestsRaw(normalizeEntityList<FriendRequestRaw>(nextReqs, ["requests"]));
    } catch (err: any) {
      alert("拒绝好友请求失败：" + (err?.message || String(err)));
    } finally {
      setActionBusy(null);
    }
  };

  const openGroupProfile = async (groupId: string) => {
    if (!groupId) return;
    try {
      const details = await get<GroupDetails>(`/api/v1/groups/${encodeURIComponent(groupId)}`);
      setSelectedGroupDetails(details);
      const title =
        details?.group?.group_id && selectedGroup?.group_id === groupId
          ? (selectedGroup?.title || "")
          : "";
      // best-effort：以当前 groups 列表为准
      const g = groups.find(x => x.group_id === groupId);
      setGroupTitleDraft(g?.title || title || "");
    } catch (err) {
      // ignore
    } finally {
      setGroupInviteQuery("");
      setGroupInviteIds(new Set());
      setGroupDissolveReason("");
      setGroupProfileOpen(true);
    }
  };

  const handleUpdateGroupTitle = async (groupId: string) => {
    const title = groupTitleDraft.trim();
    if (!groupId) return;
    if (!title) {
      alert("群名称不能为空");
      return;
    }
    setActionBusy("groupTitle");
    try {
      await post(`/api/v1/groups/${encodeURIComponent(groupId)}/title`, { title });
      const grps = await get<GroupRaw[]>("/api/v1/groups");
      setGroups(normalizeEntityList<GroupRaw>(grps, ["groups"]));
      const details = await get<GroupDetails>(`/api/v1/groups/${encodeURIComponent(groupId)}`).catch(() => null);
      if (details) setSelectedGroupDetails(details);
      alert("群名称已更新");
    } catch (err: any) {
      alert("更新群名称失败：" + (err?.message || String(err)));
    } finally {
      setActionBusy(null);
    }
  };

  const handleInviteGroupMembers = async (groupId: string) => {
    if (!groupId) return;
    const ids = Array.from(groupInviteIds);
    if (ids.length === 0) {
      alert("请先从好友中选择要邀请的人");
      return;
    }
    setActionBusy("groupInvite");
    try {
      for (const peerId of ids) {
        await post(`/api/v1/groups/${encodeURIComponent(groupId)}/invite`, {
          peer_id: peerId,
          role: "member",
          invite_text: ""
        });
      }
      setGroupInviteIds(new Set());
      const details = await get<GroupDetails>(`/api/v1/groups/${encodeURIComponent(groupId)}`).catch(() => null);
      if (details) setSelectedGroupDetails(details);
      alert("已发送邀请");
    } catch (err: any) {
      alert("邀请失败：" + (err?.message || String(err)));
    } finally {
      setActionBusy(null);
    }
  };

  const handleDissolveGroup = async (groupId: string) => {
    if (!groupId) return;
    const ok = window.confirm("确定要解散该群吗？解散后将无法恢复。");
    if (!ok) return;
    setActionBusy("groupDissolve");
    try {
      await post(`/api/v1/groups/${encodeURIComponent(groupId)}/dissolve`, {
        reason: groupDissolveReason.trim()
      });
      const grps = await get<GroupRaw[]>("/api/v1/groups");
      setGroups(normalizeEntityList<GroupRaw>(grps, ["groups"]));
      setGroupProfileOpen(false);

      // 如果当前就在该群会话，退出到列表
      if (selectedThreadKind === "group" && selectedThreadId === groupId) {
        setSelectedThreadId(null);
        if (isMobile) setMobileView("list");
      }
      alert("群已解散");
    } catch (err: any) {
      alert("解散群失败：" + (err?.message || String(err)));
    } finally {
      setActionBusy(null);
    }
  };

  const handleSaveMyProfile = async () => {
    try {
      const updated = await post<Me>("/api/v1/chat/profile", {
        nickname: meNicknameDraft.trim(),
        bio: meBioDraft.trim()
      });
      setMe(updated || null);
      setMeNicknameDraft(updated?.nickname || "");
      setMeBioDraft(updated?.bio || "");
      alert("已更新我的名片");
    } catch (err: any) {
      console.error("保存名片失败:", err);
      alert("保存名片失败：" + (err?.message || String(err)));
    }
  };

  const renderChatTab = () => (
    <div style={{ height: "100%", position: "relative" }}>
      {(() => {
        const ListView = (
          <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "10px 12px", fontWeight: 700 }}>聊天</div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              {threads.map(thread => {
                const active =
                  thread.id === selectedThreadId && thread.kind === selectedThreadKind;
                const rawSrc =
                  thread.kind === "direct"
                    ? contactAvatarMap.get((thread as any).peerId as string) ||
                      (thread as any).avatarUrl
                    : (thread as any).avatarUrl;
                const src = resolveAvatarSrc(rawSrc);
                return (
                  <div
                    key={`${thread.kind}:${thread.id}`}
                    onClick={() => {
                      setSelectedThreadId(thread.id);
                      setSelectedThreadKind(thread.kind);
                      setMobileView(isMobile ? "chat" : mobileView);
                      if (thread.id) {
                        loadThreadMessages(thread.kind, thread.id);
                      }
                    }}
                    style={{
                      display: "flex",
                      gap: 10,
                      padding: "10px 12px",
                      cursor: "pointer",
                      background: active ? "rgba(88,166,255,0.10)" : "transparent",
                      borderLeft: active ? "3px solid #58a6ff" : "3px solid transparent"
                    }}
                  >
                    <FallbackAvatar name={thread.title} src={src} size="md" />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 8
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 600,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap"
                          }}
                          title={thread.title}
                        >
                          {thread.title}
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.7, flexShrink: 0 }}>
                          {thread.lastTime}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>
                        {thread.kind === "group" ? thread.subtitle : " "}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          opacity: 0.7,
                          marginTop: 2,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }}
                        title={thread.lastMessage || ""}
                      >
                        {thread.lastMessage || " "}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );

        const ChatView = (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              minWidth: 0,
              minHeight: 0,
              height: "100%",
              overflow: "hidden",
              background: "rgba(255,255,255,0.02)"
            }}
            onPaste={handlePasteMaybeSendImage}
          >
            {selectedThread ? (
              <>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "10px 12px",
                    borderBottom: "1px solid rgba(255,255,255,0.08)"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {isMobile ? (
                      <button
                        type="button"
                        onClick={() => setMobileView("list")}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 10,
                          border: "1px solid rgba(255,255,255,0.12)",
                          background: "transparent",
                          color: "#e5e7eb",
                          cursor: "pointer"
                        }}
                      >
                        返回
                      </button>
                    ) : null}
                    <div
                      onClick={() => {
                        if (selectedThread.kind === "direct") {
                          const peerId = (selectedThread as any).peerId as
                            | string
                            | undefined;
                          if (!peerId) return;
                          setSelectedContactId(peerId);
                          if (isMobile) setContactsMobileView("detail");
                          setActiveTab("contacts");
                          return;
                        }
                        if (selectedThread.kind === "group") {
                          openGroupProfile(selectedThread.id);
                        }
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        cursor:
                          selectedThread.kind === "direct" || selectedThread.kind === "group"
                            ? "pointer"
                            : "default"
                      }}
                      title={
                        selectedThread.kind === "direct"
                          ? "查看好友资料"
                          : selectedThread.kind === "group"
                            ? "查看群资料"
                            : ""
                      }
                      role={
                        selectedThread.kind === "direct" || selectedThread.kind === "group"
                          ? "button"
                          : undefined
                      }
                    >
                      <FallbackAvatar
                        name={selectedThread.title}
                        src={resolveAvatarSrc(selectedThreadAvatarUrl)}
                        size="md"
                      />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700 }}>{selectedThread.title}</div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                          {selectedThread.kind === "group"
                            ? `群聊 · ${selectedThread.subtitle || ""}`
                            : selectedThread.subtitle || ""}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.75, textAlign: "right", flexShrink: 0 }}>
                    {selectedThreadKind === "direct" ? (
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => openRetentionModal()}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") openRetentionModal();
                        }}
                        style={{ cursor: "pointer" }}
                      >
                        自动删除：
                        {selectedConversation?.retention_minutes
                          ? `${selectedConversation.retention_minutes} 分钟`
                          : "关闭"}
                      </div>
                    ) : selectedThreadKind === "group" ? (
                      <div
                        role={localGroupRole === "admin" ? "button" : undefined}
                        tabIndex={localGroupRole === "admin" ? 0 : undefined}
                        onClick={() => {
                          if (localGroupRole === "admin") openGroupRetentionModal();
                        }}
                        onKeyDown={(e) => {
                          if (localGroupRole === "admin" && (e.key === "Enter" || e.key === " ")) {
                            openGroupRetentionModal();
                          }
                        }}
                        style={{
                          cursor: localGroupRole === "admin" ? "pointer" : "default",
                          opacity: localGroupRole === "admin" ? 1 : 0.6
                        }}
                      >
                        自动删除：
                        {selectedGroup?.retention_minutes
                          ? `${selectedGroup.retention_minutes} 分钟`
                          : "关闭"}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div
                  style={{
                    flex: 1,
                    minHeight: 0,
                    minWidth: 0,
                    overflowY: "auto",
                    overflowX: "hidden",
                    padding: 12
                  }}
                >
                  {fileSending ? (
                    <div
                      style={{
                        padding: "8px 10px",
                        borderRadius: 10,
                        marginBottom: 10,
                        background: fileSending.error
                          ? "rgba(248,81,73,0.14)"
                          : "rgba(88,166,255,0.12)",
                        border: "1px solid rgba(255,255,255,0.10)",
                        color: fileSending.error ? "#fca5a5" : "#c7d2fe",
                        fontSize: 12
                      }}
                    >
                      {fileSending.text}
                    </div>
                  ) : null}
                {messagesLoading ? (
                  <div style={{ padding: 12, color: "#9ca3af", fontSize: 13 }}>
                    载入中…
                  </div>
                ) : messages.length === 0 ? (
                  <div style={{ padding: 12, color: "#9ca3af", fontSize: 13 }}>
                    暂无消息
                  </div>
                ) : selectedThreadKind === "meshserver_group" ? (
                  (messages as MeshserverSyncMessage[]).map(m => {
                    const thread = meshGroups.find(
                      t => t.threadId === selectedThreadId
                    );
                    const fromMe =
                      !!thread?.myUserId && m.sender_user_id === thread.myUserId;
                    const senderName = fromMe ? "我" : m.sender_user_id || "未知";
                    const letter = textAvatarLetter(senderName);
                    const isImage = Number((m as any).message_type) === 2;
                    const caption = m.content?.text || "";
                    const imageSrc = isImage ? extractMeshserverImageSrc(m) : undefined;
                    return (
                      <div
                        key={m.message_id}
                        style={{
                          display: "flex",
                          justifyContent: fromMe ? "flex-end" : "flex-start",
                          gap: 8,
                          marginBottom: 10
                        }}
                      >
                        {!fromMe && (
                          <div
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: "50%",
                              background: "#1f2933",
                              color: "#e5e7eb",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 13,
                              flexShrink: 0
                            }}
                          >
                            {letter}
                          </div>
                        )}
                        <div style={{ maxWidth: "78%" }}>
                          <div
                            style={{
                              fontSize: 12,
                              opacity: 0.7,
                              marginBottom: 4,
                              textAlign: fromMe ? "right" : "left"
                            }}
                          >
                            {senderName} · {formatTimeFromMs(m.created_at_ms)}
                          </div>
                          <div
                            style={{
                              padding: "10px 12px",
                              borderRadius: 12,
                              background: fromMe
                                ? "rgba(88,166,255,0.16)"
                                : "rgba(255,255,255,0.06)",
                              border: "1px solid rgba(255,255,255,0.10)",
                              whiteSpace: "pre-wrap",
                              overflowWrap: "anywhere",
                              wordBreak: "break-word"
                            }}
                          >
                            {isImage ? (
                              imageSrc ? (
                                <div>
                                  <img
                                    src={imageSrc}
                                    alt={caption || "image"}
                                    style={{
                                      maxWidth: "100%",
                                      borderRadius: 10,
                                      display: "block"
                                    }}
                                  />
                                  {caption ? (
                                    <div
                                      style={{
                                        marginTop: 6,
                                        fontSize: 12,
                                        opacity: 0.85,
                                        whiteSpace: "pre-wrap",
                                        overflowWrap: "anywhere",
                                        wordBreak: "break-word"
                                      }}
                                    >
                                      {caption}
                                    </div>
                                  ) : null}
                                </div>
                              ) : caption ? (
                                caption
                              ) : (
                                "[圖片消息]"
                              )
                            ) : caption ? (
                              caption
                            ) : (
                              "[非文本消息]"
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : selectedThreadKind === "group" ? (
                  (messages as GroupMessage[]).map(m => {
                    const fromMe = !!me && m.sender_peer_id === me.peer_id;
                    const deliveryText = fromMe
                      ? deliveryStatusText(m.state, m.delivered_at)
                      : "";
                    const senderName = fromMe
                      ? "我"
                      : displayName(
                          contactsRaw,
                          m.sender_peer_id,
                          shortPeer(m.sender_peer_id)
                        );
                    const letter = textAvatarLetter(senderName);
                    const isFile = m.msg_type === "group_chat_file";
                    const text = m.plaintext || "";
                    return (
                      <div
                        key={m.msg_id}
                        style={{
                          display: "flex",
                          justifyContent: fromMe ? "flex-end" : "flex-start",
                          gap: 8,
                          marginBottom: 10
                        }}
                      >
                        {!fromMe && (
                          <div
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: "50%",
                              background: "#1f2933",
                              color: "#e5e7eb",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 13,
                              flexShrink: 0
                            }}
                          >
                            {letter}
                          </div>
                        )}
                        <div style={{ maxWidth: "78%" }}>
                          <div
                            style={{
                              fontSize: 12,
                              opacity: 0.7,
                              marginBottom: 4
                            }}
                          >
                            {senderName} · {formatTime(m.created_at)}
                            {fromMe && deliveryText ? ` · ${deliveryText}` : ""}
                          </div>
                          <div
                            style={{
                              padding: "10px 12px",
                              borderRadius: 12,
                              background: fromMe
                                ? "rgba(88,166,255,0.16)"
                                : "rgba(255,255,255,0.06)",
                              border: "1px solid rgba(255,255,255,0.10)",
                              whiteSpace: "pre-wrap",
                              overflowWrap: "anywhere",
                              wordBreak: "break-word"
                            }}
                            {...createLongPressHandlers(
                              "group",
                              m.group_id || selectedThreadId || "",
                              m.msg_id,
                              canRevokeGroupMessage(m.sender_peer_id)
                            )}
                          >
                            {isFile && m.group_id ? (
                              isImageMime(m.mime_type) ? (
                                <img
                                  src={groupFileUrl(m.group_id, m.msg_id)}
                                  alt={m.file_name || "image"}
                                  style={{
                                    maxWidth: "100%",
                                    borderRadius: 10,
                                    display: "block"
                                  }}
                                />
                              ) : isVideoMime(m.mime_type) ? (
                                <video
                                  src={groupFileUrl(m.group_id, m.msg_id)}
                                  controls
                                  style={{
                                    maxWidth: "100%",
                                    borderRadius: 10,
                                    display: "block"
                                  }}
                                />
                              ) : (
                                <a
                                  href={groupFileUrl(m.group_id, m.msg_id)}
                                  download={m.file_name || "file"}
                                  style={{ color: "#93c5fd" }}
                                >
                                  下载档案：{m.file_name || "file"}
                                </a>
                              )
                            ) : text ? (
                              text
                            ) : (
                              "[非文本消息]"
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  (messages as DirectMessage[]).map(m => {
                    const fromMe = m.direction === "outbound";
                    const deliveryText = fromMe
                      ? deliveryStatusText(m.state, m.delivered_at)
                      : "";
                    const senderName = fromMe ? "我" : selectedThread.title;
                    const letter = textAvatarLetter(senderName);
                    const isFile = m.msg_type === "chat_file";
                    const text = m.plaintext || "";
                    const isGroupInvite = m.msg_type === "group_invite_notice";
                    const invite = isGroupInvite
                      ? safeJsonParse<{
                          group_id?: string;
                          title?: string;
                          controller_peer_id?: string;
                          invitee_peer_id?: string;
                        }>(m.plaintext)
                      : null;

                    if (isGroupInvite && invite && invite.group_id) {
                      const groupId = invite.group_id;
                      const groupTitle = invite.title || "未命名群";
                      const controller = invite.controller_peer_id
                        ? displayName(
                            contactsRaw,
                            invite.controller_peer_id,
                            shortPeer(invite.controller_peer_id)
                          )
                        : "-";
                      return (
                        <div
                          key={m.msg_id}
                          style={{
                            display: "flex",
                            justifyContent: "center",
                            marginBottom: 12
                          }}
                        >
                          <div
                            style={{
                              width: "min(520px, 96%)",
                              borderRadius: 14,
                              border: "1px solid rgba(255,255,255,0.10)",
                              background: "rgba(17,24,39,0.65)",
                              padding: 14,
                              overflow: "hidden"
                            }}
                          >
                            <div style={{ fontSize: 14, fontWeight: 800 }}>
                              群聊邀请
                            </div>
                            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                              {fromMe ? "你已发送一个群邀请" : "你收到一个群邀请"}
                            </div>

                            <div style={{ marginTop: 12 }}>
                              <div style={{ fontSize: 18, fontWeight: 800 }}>
                                {groupTitle}
                              </div>
                              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
                                群 ID：{shortPeer(groupId)}
                              </div>
                              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                                Controller：{controller}
                              </div>
                              <div style={{ fontSize: 12, opacity: 0.6, marginTop: 6 }}>
                                {formatTime(m.created_at)}
                                {fromMe && deliveryText ? ` · ${deliveryText}` : ""}
                              </div>
                            </div>

                            <div
                              style={{
                                display: "flex",
                                gap: 10,
                                justifyContent: "flex-end",
                                marginTop: 14
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => openGroupThread(groupId)}
                                style={{
                                  padding: "10px 14px",
                                  borderRadius: 10,
                                  border: "1px solid rgba(255,255,255,0.12)",
                                  background: "transparent",
                                  color: "#e5e7eb",
                                  cursor: "pointer"
                                }}
                              >
                                打开群聊
                              </button>
                              <button
                                type="button"
                                onClick={() => joinGroup(groupId)}
                                style={{
                                  padding: "10px 14px",
                                  borderRadius: 10,
                                  border: "none",
                                  background: "#58a6ff",
                                  color: "#08111c",
                                  fontWeight: 800,
                                  cursor: "pointer"
                                }}
                              >
                                加入群聊
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={m.msg_id}
                        style={{
                          display: "flex",
                          justifyContent: fromMe ? "flex-end" : "flex-start",
                          gap: 8,
                          marginBottom: 10
                        }}
                      >
                        {!fromMe && (
                          <div
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: "50%",
                              background: "#1f2933",
                              color: "#e5e7eb",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 13,
                              flexShrink: 0
                            }}
                          >
                            {letter}
                          </div>
                        )}
                        <div style={{ maxWidth: "78%" }}>
                          <div
                            style={{
                              fontSize: 12,
                              opacity: 0.7,
                              marginBottom: 4,
                              textAlign: fromMe ? "right" : "left"
                            }}
                          >
                            {formatTime(m.created_at)}
                            {fromMe && deliveryText ? ` · ${deliveryText}` : ""}
                          </div>
                          <div
                            style={{
                              padding: "10px 12px",
                              borderRadius: 12,
                              background: fromMe
                                ? "rgba(88,166,255,0.16)"
                                : "rgba(255,255,255,0.06)",
                              border: "1px solid rgba(255,255,255,0.10)",
                              whiteSpace: "pre-wrap",
                              overflowWrap: "anywhere",
                              wordBreak: "break-word"
                            }}
                            {...createLongPressHandlers(
                              "direct",
                              m.conversation_id || selectedThreadId || "",
                              m.msg_id,
                              !!fromMe
                            )}
                          >
                            {isFile && m.conversation_id ? (
                              isImageMime(m.mime_type) ? (
                                <img
                                  src={directFileUrl(m.conversation_id, m.msg_id)}
                                  alt={m.file_name || "image"}
                                  style={{
                                    maxWidth: "100%",
                                    borderRadius: 10,
                                    display: "block"
                                  }}
                                />
                              ) : isVideoMime(m.mime_type) ? (
                                <video
                                  src={directFileUrl(m.conversation_id, m.msg_id)}
                                  controls
                                  style={{
                                    maxWidth: "100%",
                                    borderRadius: 10,
                                    display: "block"
                                  }}
                                />
                              ) : (
                                <a
                                  href={directFileUrl(m.conversation_id, m.msg_id)}
                                  download={m.file_name || "file"}
                                  style={{ color: "#93c5fd" }}
                                >
                                  下载档案：{m.file_name || "file"}
                                </a>
                              )
                            ) : text ? (
                              text
                            ) : (
                              "[非文本消息]"
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}

                {sending ? (
                  <div style={{ padding: 8, color: "#9ca3af", fontSize: 12 }}>
                    发送中…
                  </div>
                ) : null}
              </div>

                <div
                  style={{
                    flexShrink: 0,
                    borderTop: "1px solid rgba(255,255,255,0.08)"
                  }}
                >
                  {selectedThreadKind === "meshserver_group" ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-end",
                        gap: 10,
                        padding: 8
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <MessageInput
                          placeholder="输入讯息..."
                          attachButton={false}
                          onSend={handleSendMessage}
                        />
                      </div>
                      <input
                        id="meshserver-image-input"
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={e => {
                          const f = e.target.files && e.target.files[0];
                          if (!f) return;
                          sendFileForCurrentThread(f);
                          e.currentTarget.value = "";
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const el = document.getElementById(
                            "meshserver-image-input"
                          ) as HTMLInputElement | null;
                          el?.click();
                        }}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 12,
                          border: "1px solid rgba(255,255,255,0.14)",
                          background: "transparent",
                          color: "#e5e7eb",
                          cursor: "pointer",
                          fontWeight: 800,
                          marginBottom: 2,
                          flexShrink: 0
                        }}
                      >
                        上传图片
                      </button>
                    </div>
                  ) : (
                    <MessageInput
                      placeholder="输入讯息..."
                      attachButton={false}
                      onSend={handleSendMessage}
                    />
                  )}
                </div>
              </>
            ) : (
              <div
                style={{
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#888"
                }}
              >
                请先从列表选择一个会话
              </div>
            )}
          </div>
        );

        if (isMobile) {
          return mobileView === "chat" ? ChatView : ListView;
        }

        return (
          <MainContainer>
            <Sidebar position="left" scrollable>
              {ListView}
            </Sidebar>
            {ChatView}
          </MainContainer>
        );
      })()}
    </div>
  );

  const renderContactsTab = () => (
    <div style={{ height: "100%", display: "flex" }}>
      {(() => {
        const myPeerId = (me?.peer_id || "").trim();
        const pendingRequests = requestsRaw.filter(r => {
          const s = (r.state || "").toLowerCase();
          const isPending = !s || (s !== "accepted" && s !== "rejected" && s !== "denied");
          const toPeer = (r.to_peer_id || "").trim();
          // 只显示“加我”的请求：to_peer_id 必须是我自己
          const isInbound = !!myPeerId && toPeer === myPeerId;
          return isPending && isInbound;
        });

        const ContactList = (
          <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "12px 16px", fontWeight: 700 }}>联系人</div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              <div style={{ padding: "12px 16px 8px", fontWeight: 700 }}>好友添加请求</div>
              {pendingRequests.length === 0 ? (
                <div style={{ padding: "0 16px 12px", fontSize: 12, opacity: 0.7 }}>
                  暂无新的朋友请求
                </div>
              ) : (
                pendingRequests.map(r => {
                  const peerId = r.from_peer_id || "";
                  const title = r.nickname || shortPeer(peerId || r.request_id);
                  return (
                    <div
                      key={r.request_id}
                      style={{
                        margin: "0 16px 8px",
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: "1px solid rgba(255,255,255,0.10)",
                        background: "rgba(88,166,255,0.06)"
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <FallbackAvatar
                          name={title}
                          size="sm"
                          src={resolveAvatarSrc((r as any).avatar)}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontWeight: 800,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap"
                            }}
                          >
                            {title}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              opacity: 0.75,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              marginTop: 2
                            }}
                            title={r.intro_text || ""}
                          >
                            {r.intro_text ? `申请：${r.intro_text}` : "暂无申请内容"}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                        <button
                          type="button"
                          disabled={actionBusy === "acceptRequest" || actionBusy === "rejectRequest"}
                          onClick={() => handleAcceptFriendRequest(r)}
                          style={{
                            flex: 1,
                            padding: "8px 10px",
                            borderRadius: 10,
                            border: "none",
                            background: "#58a6ff",
                            color: "#08111c",
                            fontWeight: 900,
                            cursor:
                              actionBusy === "acceptRequest" ? "not-allowed" : "pointer",
                            opacity: actionBusy === "acceptRequest" ? 0.7 : 1
                          }}
                        >
                          {actionBusy === "acceptRequest" ? "接受中…" : "接受"}
                        </button>
                        <button
                          type="button"
                          disabled={actionBusy === "acceptRequest" || actionBusy === "rejectRequest"}
                          onClick={() => handleRejectFriendRequest(r)}
                          style={{
                            flex: 1,
                            padding: "8px 10px",
                            borderRadius: 10,
                            border: "1px solid rgba(255,255,255,0.14)",
                            background: "transparent",
                            color: "#e5e7eb",
                            fontWeight: 800,
                            cursor:
                              actionBusy === "rejectRequest" ? "not-allowed" : "pointer",
                            opacity: actionBusy === "rejectRequest" ? 0.7 : 1
                          }}
                        >
                          {actionBusy === "rejectRequest" ? "拒绝中…" : "拒绝"}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}

              {contacts.map(c => (
                <div
                  key={c.id}
                  onClick={() => {
                    setSelectedContactId(c.id);
                    if (isMobile) setContactsMobileView("detail");
                  }}
                  style={{
                    padding: "10px 16px",
                    cursor: "pointer",
                    background:
                      c.id === selectedContactId
                        ? "rgba(88,166,255,0.08)"
                        : "transparent",
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                    display: "flex",
                    alignItems: "center",
                    gap: 10
                  }}
                >
                  <FallbackAvatar
                    name={c.name}
                    size="sm"
                    src={resolveAvatarSrc((c as any).avatarUrl)}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>
                      {c.name}
                      {c.blocked && (
                        <span
                          style={{
                            color: "#f85149",
                            fontSize: 12,
                            marginLeft: 6
                          }}
                        >
                          已拉黑
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      备注：{c.remark || "（无）"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

        const ContactDetail = (
          <div
            style={{
              flex: 1,
              padding: "16px 20px",
              overflowY: "auto",
              minWidth: 0
            }}
          >
            {selectedContact ? (
              <>
                {isMobile ? (
                  <div style={{ marginBottom: 12 }}>
                    <button
                      type="button"
                      onClick={() => setContactsMobileView("list")}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.12)",
                        background: "transparent",
                        color: "#e5e7eb",
                        cursor: "pointer"
                      }}
                    >
                      返回
                    </button>
                  </div>
                ) : null}

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    minWidth: 0
                  }}
                >
                  <FallbackAvatar
                    name={selectedContact.name}
                    size="lg"
                    src={resolveAvatarSrc((selectedContact as any).avatarUrl)}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>
                      {selectedContact.name}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        opacity: 0.8,
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere",
                        wordBreak: "break-word"
                      }}
                    >
                      Peer ID：{selectedContact.id}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        opacity: 0.8,
                        marginTop: 6,
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere",
                        wordBreak: "break-word"
                      }}
                    >
                      简介：
                      {(selectedContact as any).bio
                        ? (selectedContact as any).bio
                        : "（无）"}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
                      最后上线：{selectedContact.lastSeen || "-"}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 24 }}>
                  <div style={{ fontSize: 14, marginBottom: 4 }}>备注名</div>
                  <input
                    type="text"
                    value={contactRemarkDraft}
                    onChange={e => setContactRemarkDraft(e.target.value)}
                    onBlur={() => handleSaveContactRemark(selectedContact.id)}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: 6,
                      border: "1px solid #ccc",
                      outline: "none"
                    }}
                  />
                  <div style={{ marginTop: 10 }}>
                    <button
                      style={{
                        padding: "8px 16px",
                        borderRadius: 6,
                        border: "none",
                        background: "#374151",
                        color: "#e5e7eb",
                        cursor: contactRemarkSaving ? "not-allowed" : "pointer",
                        opacity: contactRemarkSaving ? 0.7 : 1
                      }}
                      disabled={contactRemarkSaving}
                      onClick={() => handleSaveContactRemark(selectedContact.id)}
                    >
                      {contactRemarkSaving ? "保存中…" : "保存备注"}
                    </button>
                  </div>
                </div>

                <div style={{ marginTop: 16 }}>
                  <button
                    style={{
                      padding: "8px 16px",
                      borderRadius: 6,
                      border: "none",
                      background: selectedContact.blocked ? "#444" : "#f85149",
                      color: "#fff",
                      cursor: "pointer",
                      marginRight: 8
                    }}
                    onClick={() => handleToggleBlockContact(selectedContact.id)}
                  >
                    {selectedContact.blocked ? "解除拉黑" : "拉黑"}
                  </button>

                  <button
                    style={{
                      padding: "8px 16px",
                      borderRadius: 6,
                      border: "none",
                      background: "#58a6ff",
                      color: "#08111c",
                      cursor: "pointer"
                    }}
                    onClick={() => handleStartChatFromContact(selectedContact.id)}
                  >
                    发起对话
                  </button>
                </div>
              </>
            ) : (
              <div
                style={{
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#888"
                }}
              >
                请先选择一位联系人
              </div>
            )}
          </div>
        );

        if (isMobile) {
          return (
            <div style={{ width: "100%", height: "100%" }}>
              {contactsMobileView === "detail" ? ContactDetail : ContactList}
            </div>
          );
        }

        return (
          <>
            <div
              style={{
                width: 280,
                borderRight: "1px solid rgba(0,0,0,0.1)",
                overflow: "hidden"
              }}
            >
              {ContactList}
            </div>
            {ContactDetail}
          </>
        );
      })()}
    </div>
  );

  const renderMeTab = () => (
    <div style={{ padding: "20px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <FallbackAvatar
          name={meNicknameDraft || "我"}
          size="lg"
          src={resolveAvatarSrc(avatarUrl(me?.avatar))}
        />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 600 }}>我的名片</div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginTop: 4 }}>
            <div
              style={{
                fontSize: 12,
                opacity: 0.8,
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
                wordBreak: "break-word"
              }}
            >
              Peer ID：{me?.peer_id || "-"}
            </div>
            <button
              type="button"
              disabled={!me?.peer_id}
              onClick={async () => {
                const text = me?.peer_id || "";
                if (!text) return;
                try {
                  await navigator.clipboard.writeText(text);
                } catch {
                  const ta = document.createElement("textarea");
                  ta.value = text;
                  ta.style.position = "fixed";
                  ta.style.left = "-9999px";
                  document.body.appendChild(ta);
                  ta.select();
                  document.execCommand("copy");
                  document.body.removeChild(ta);
                }
                alert("已复制 Peer ID");
              }}
              style={{
                padding: "6px 10px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "transparent",
                color: "#e5e7eb",
                cursor: !me?.peer_id ? "not-allowed" : "pointer",
                opacity: !me?.peer_id ? 0.6 : 1,
                fontSize: 12,
                flexShrink: 0
              }}
              title="复制 Peer ID"
            >
              复制
            </button>
          </div>
          <div
            style={{
              fontSize: 12,
              opacity: 0.8,
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              wordBreak: "break-word"
            }}
          >
            Chat KEX：{me?.chat_kex_pub || "-"}
          </div>
          <div
            style={{
              fontSize: 12,
              opacity: 0.8,
              marginTop: 6,
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              wordBreak: "break-word"
            }}
          >
            简介：{me?.bio ? me.bio : "（无）"}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 24, maxWidth: 360 }}>
        <div style={{ fontSize: 14, marginBottom: 4 }}>昵称</div>
        <input
          type="text"
          value={meNicknameDraft}
          onChange={e => setMeNicknameDraft(e.target.value)}
          placeholder="输入昵称"
          style={{
            width: "100%",
            padding: "8px 10px",
            borderRadius: 6,
            border: "1px solid #ccc",
            outline: "none"
          }}
        />

        <div style={{ fontSize: 14, marginBottom: 4, marginTop: 14 }}>简介（bio）</div>
        <textarea
          value={meBioDraft}
          onChange={e => setMeBioDraft(e.target.value)}
          placeholder="写几句介绍自己（可留空）"
          style={{
            width: "100%",
            padding: "8px 10px",
            borderRadius: 6,
            border: "1px solid #ccc",
            outline: "none",
            minHeight: 88,
            resize: "vertical"
          }}
        />
        <button
          style={{
            marginTop: 12,
            padding: "8px 16px",
            borderRadius: 6,
            border: "none",
            background: "#58a6ff",
            color: "#08111c",
            cursor: "pointer"
          }}
          onClick={handleSaveMyProfile}
        >
          保存名片
        </button>
      </div>
    </div>
  );

  return (
    <div
      style={{
        height: "100%",
        maxWidth: 960,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        background: "#0f1419",
        color: "#e6edf3"
      }}
    >
      {!(isMobile && activeTab === "chat" && mobileView === "chat") ? (
        <div
          style={{
            padding: "10px 16px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            fontWeight: 600,
            position: "sticky",
            top: 0,
            zIndex: 50,
            background: "#0f1419",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12
          }}
        >
          <div>mesh 聊天</div>
          {activeTab !== "me" ? (
            <button
              type="button"
              onClick={() => setPlusMenuOpen(v => !v)}
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "transparent",
                color: "#e5e7eb",
                cursor: "pointer",
                fontSize: 20,
                lineHeight: "36px",
                fontWeight: 800
              }}
              aria-label="新增"
              title="新增"
            >
              +
            </button>
          ) : null}
        </div>
      ) : null}
      {isMobile && activeTab === "chat" && mobileView === "chat" ? (
        <button
          type="button"
          onClick={() => setPlusMenuOpen(v => !v)}
          style={{
            position: "fixed",
            top: 10,
            right: 12,
            zIndex: 60,
            width: 36,
            height: 36,
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(15,20,25,0.92)",
            color: "#e5e7eb",
            cursor: "pointer",
            fontSize: 20,
            lineHeight: "36px",
            fontWeight: 800
          }}
          aria-label="新增"
          title="新增"
        >
          +
        </button>
      ) : null}

      <div style={{ flex: 1, overflow: "hidden" }}>
        {activeTab === "chat" && renderChatTab()}
        {activeTab === "contacts" && renderContactsTab()}
        {activeTab === "me" && renderMeTab()}
      </div>

      {!(isMobile && activeTab === "chat" && mobileView === "chat") ? (
        <div
          style={{
            height: 56,
            borderTop: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            background: "#111827"
          }}
        >
          <BottomTabItem
            active={activeTab === "chat"}
            label="聊天"
            onClick={() => setActiveTab("chat")}
          />
          <BottomTabItem
            active={activeTab === "contacts"}
            label="联系人"
            onClick={() => setActiveTab("contacts")}
          />
          <BottomTabItem
            active={activeTab === "me"}
            label="我的"
            onClick={() => setActiveTab("me")}
          />
        </div>
      ) : null}

      {renderMsgMenu()}
      {renderPlusMenu()}
      {renderModal(
        addFriendOpen,
        () => setAddFriendOpen(false),
        "添加朋友",
        <div>
          <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 10 }}>
            输入对方 Peer ID，发送好友请求后对方接受即可开始私聊。
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 13, marginBottom: 6 }}>Peer ID</div>
            <input
              value={addFriendPeerId}
              onChange={e => setAddFriendPeerId(e.target.value)}
              placeholder="12D3KooW..."
              style={{
                width: "100%",
                padding: "10px 10px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.16)",
                background: "rgba(0,0,0,0.18)",
                color: "#e5e7eb",
                outline: "none"
              }}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, marginBottom: 6 }}>附言</div>
            <textarea
              value={addFriendIntro}
              onChange={e => setAddFriendIntro(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 10px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.16)",
                background: "rgba(0,0,0,0.18)",
                color: "#e5e7eb",
                outline: "none",
                minHeight: 90,
                resize: "vertical"
              }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button
              type="button"
              onClick={() => setAddFriendOpen(false)}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "transparent",
                color: "#e5e7eb",
                cursor: "pointer"
              }}
            >
              取消
            </button>
            <button
              type="button"
              disabled={actionBusy === "addFriend"}
              onClick={sendChatRequest}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "none",
                background: "#58a6ff",
                color: "#08111c",
                fontWeight: 800,
                cursor: actionBusy === "addFriend" ? "not-allowed" : "pointer",
                opacity: actionBusy === "addFriend" ? 0.7 : 1
              }}
            >
              {actionBusy === "addFriend" ? "发送中…" : "发送请求"}
            </button>
          </div>
        </div>
      )}
      {renderModal(
        createGroupOpen,
        () => {
          setCreateGroupOpen(false);
          setCreateGroupMemberQuery("");
        },
        "发起群聊",
        <div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 13, marginBottom: 6 }}>群标题</div>
            <input
              value={createGroupTitle}
              onChange={e => setCreateGroupTitle(e.target.value)}
              placeholder="例如：运营群 / 项目群"
              style={{
                width: "100%",
                padding: "10px 10px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.16)",
                background: "rgba(0,0,0,0.18)",
                color: "#e5e7eb",
                outline: "none"
              }}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, marginBottom: 6 }}>
              初始成员（从好友中选择）
            </div>
            <input
              value={createGroupMemberQuery}
              onChange={e => setCreateGroupMemberQuery(e.target.value)}
              placeholder="搜寻好友（昵称 / Peer ID）"
              style={{
                width: "100%",
                padding: "10px 10px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.16)",
                background: "rgba(0,0,0,0.18)",
                color: "#e5e7eb",
                outline: "none"
              }}
            />

            {createGroupMemberIds.size > 0 ? (
              <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {Array.from(createGroupMemberIds).slice(0, 12).map(peerId => {
                  const c = contacts.find(x => x.id === peerId);
                  const label = c ? c.name : shortPeer(peerId);
                  return (
                    <button
                      key={peerId}
                      type="button"
                      onClick={() =>
                        setCreateGroupMemberIds(prev => {
                          const next = new Set(prev);
                          next.delete(peerId);
                          return next;
                        })
                      }
                      style={{
                        padding: "6px 10px",
                        borderRadius: 999,
                        border: "1px solid rgba(255,255,255,0.14)",
                        background: "rgba(255,255,255,0.06)",
                        color: "#e5e7eb",
                        cursor: "pointer",
                        fontSize: 12
                      }}
                      title="点击移除"
                    >
                      {label} ×
                    </button>
                  );
                })}
                {createGroupMemberIds.size > 12 ? (
                  <div style={{ fontSize: 12, opacity: 0.7, padding: "6px 2px" }}>
                    +{createGroupMemberIds.size - 12}
                  </div>
                ) : null}
              </div>
            ) : (
              <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
                尚未选择成员（可不选，先建群后再邀请）
              </div>
            )}

            <div
              style={{
                marginTop: 10,
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.10)",
                overflow: "hidden"
              }}
            >
              <div style={{ maxHeight: 220, overflowY: "auto" }}>
                {contacts
                  .filter(c => {
                    const q = createGroupMemberQuery.trim().toLowerCase();
                    if (!q) return true;
                    return (
                      c.name.toLowerCase().includes(q) ||
                      c.id.toLowerCase().includes(q)
                    );
                  })
                  .map(c => {
                    const checked = createGroupMemberIds.has(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() =>
                          setCreateGroupMemberIds(prev => {
                            const next = new Set(prev);
                            if (next.has(c.id)) next.delete(c.id);
                            else next.add(c.id);
                            return next;
                          })
                        }
                        style={{
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "10px 12px",
                          border: "none",
                          borderBottom: "1px solid rgba(255,255,255,0.06)",
                          background: checked ? "rgba(88,166,255,0.10)" : "transparent",
                          color: "#e5e7eb",
                          cursor: "pointer",
                          textAlign: "left"
                        }}
                      >
                        <div
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: 6,
                            border: "1px solid rgba(255,255,255,0.18)",
                            background: checked ? "#58a6ff" : "transparent",
                            flexShrink: 0
                          }}
                        />
                        <FallbackAvatar
                          name={c.name}
                          size="sm"
                          src={resolveAvatarSrc((c as any).avatarUrl)}
                        />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {c.name}
                          </div>
                          <div style={{ fontSize: 12, opacity: 0.7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {shortPeer(c.id)}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                {contacts.length === 0 ? (
                  <div style={{ padding: 12, fontSize: 12, opacity: 0.7 }}>
                    目前没有好友可选
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button
              type="button"
              onClick={() => setCreateGroupOpen(false)}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "transparent",
                color: "#e5e7eb",
                cursor: "pointer"
              }}
            >
              取消
            </button>
            <button
              type="button"
              disabled={actionBusy === "createGroup"}
              onClick={createGroup}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "none",
                background: "#58a6ff",
                color: "#08111c",
                fontWeight: 800,
                cursor: actionBusy === "createGroup" ? "not-allowed" : "pointer",
                opacity: actionBusy === "createGroup" ? 0.7 : 1
              }}
            >
              {actionBusy === "createGroup" ? "建立中…" : "建立群聊"}
            </button>
          </div>
        </div>
      )}
      {renderModal(
        meshJoinOpen,
        () => setMeshJoinOpen(false),
        "加入space",
        <div>
          {meshJoinStep === "peer" ? (
            <>
              <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 10 }}>
                输入你要连接的 meshserver 的 <code>peer_id</code>，连接成功后会拉取服务器与频道列表。
              </div>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 13, marginBottom: 6 }}>meshserver Peer ID</div>
                <input
                  value={meshPeerIdDraft}
                  onChange={e => setMeshPeerIdDraft(e.target.value)}
                  placeholder="12D3KooW..."
                  style={{
                    width: "100%",
                    padding: "10px 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.16)",
                    background: "rgba(0,0,0,0.18)",
                    color: "#e5e7eb",
                    outline: "none"
                  }}
                />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setMeshJoinOpen(false)}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "transparent",
                    color: "#e5e7eb",
                    cursor: "pointer"
                  }}
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={actionBusy === "meshJoinConnect"}
                  onClick={async () => {
                    const peerId = meshPeerIdDraft.trim();
                    if (!peerId) return;
                    setActionBusy("meshJoinConnect");
                    try {
                      const conn = await connectMeshserver(peerId);
                      setMeshConnection(conn);
                      await loadSpaces(conn.name);
                      await loadMeshCanCreateSpace(conn.name);
                      setMeshJoinStep("server");
                    } catch (err: any) {
                      alert("连接 meshserver 失败：" + (err?.message || String(err)));
                    } finally {
                      setActionBusy(null);
                    }
                  }}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "none",
                    background: "#58a6ff",
                    color: "#08111c",
                    fontWeight: 800,
                    cursor: actionBusy === "meshJoinConnect" ? "not-allowed" : "pointer",
                    opacity: actionBusy === "meshJoinConnect" ? 0.7 : 1
                  }}
                >
                  {actionBusy === "meshJoinConnect" ? "连接中…" : "连接并选择服务器"}
                </button>
              </div>
            </>
          ) : null}

          {meshJoinStep === "server" ? (
            <>
              <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 10 }}>
                选择space后，会加载该space的频道列表。
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
                <button
                  type="button"
                  onClick={() => setMeshJoinStep("peer")}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "transparent",
                    color: "#e5e7eb",
                    cursor: "pointer"
                  }}
                >
                  返回
                </button>
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  connection：{meshConnection?.name || "-"}
                </div>
              </div>

              {meshCanCreateSpace ? (
                <div
                  style={{
                    padding: "12px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.10)",
                    marginBottom: 10
                  }}
                >
                  <div style={{ fontWeight: 900, marginBottom: 8 }}>创建 space</div>
                  <div style={{ marginBottom: 10, fontSize: 12, opacity: 0.75 }}>
                    输入名称后会创建并直接进入该 space 的频道选择。
                  </div>

                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>名称</div>
                    <input
                      value={meshCreateSpaceName}
                      onChange={e => setMeshCreateSpaceName(e.target.value)}
                      placeholder="例如：我的 space"
                      style={{
                        width: "100%",
                        padding: "10px 10px",
                        borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.16)",
                        background: "rgba(0,0,0,0.18)",
                        color: "#e5e7eb",
                        outline: "none"
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>描述（可选）</div>
                    <textarea
                      value={meshCreateSpaceDesc}
                      onChange={e => setMeshCreateSpaceDesc(e.target.value)}
                      placeholder="一段简短描述"
                      style={{
                        width: "100%",
                        padding: "10px 10px",
                        borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.16)",
                        background: "rgba(0,0,0,0.18)",
                        color: "#e5e7eb",
                        outline: "none",
                        minHeight: 70,
                        resize: "vertical"
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>可见性</div>
                    <select
                      value={meshCreateSpaceVisibility}
                      onChange={e =>
                        setMeshCreateSpaceVisibility(e.target.value as "public" | "private")
                      }
                      style={{
                        width: "100%",
                        padding: "10px 10px",
                        borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.16)",
                        background: "rgba(0,0,0,0.18)",
                        color: "#e5e7eb",
                        outline: "none"
                      }}
                    >
                      <option value="public">public</option>
                      <option value="private">private</option>
                    </select>
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                    <button
                      type="button"
                      onClick={() => {
                        setMeshCreateSpaceName("");
                        setMeshCreateSpaceDesc("");
                        setMeshCreateSpaceVisibility("public");
                      }}
                      style={{
                        padding: "10px 14px",
                        borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.14)",
                        background: "transparent",
                        color: "#e5e7eb",
                        cursor: "pointer"
                      }}
                      disabled={actionBusy === "meshCreateSpace"}
                    >
                      清空
                    </button>

                    <button
                      type="button"
                      onClick={createMeshSpaceAndMaybeSelect}
                      disabled={actionBusy === "meshCreateSpace"}
                      style={{
                        padding: "10px 14px",
                        borderRadius: 10,
                        border: "none",
                        background: "#58a6ff",
                        color: "#08111c",
                        fontWeight: 900,
                        cursor:
                          actionBusy === "meshCreateSpace" ? "not-allowed" : "pointer",
                        opacity: actionBusy === "meshCreateSpace" ? 0.7 : 1
                      }}
                    >
                      {actionBusy === "meshCreateSpace" ? "创建中…" : "创建并选择频道"}
                    </button>
                  </div>
                </div>
              ) : null}

              <div style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.10)", overflow: "hidden" }}>
                <div style={{ maxHeight: 280, overflowY: "auto" }}>
                  {meshServers.length === 0 ? (
                    <div style={{ padding: 12, fontSize: 12, opacity: 0.7 }}>暂无space</div>
                  ) : (
                    meshServers.map(s => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={async () => {
                          if (!meshConnection) return;
                          setMeshSelectedSpaceId(s.id);
                          setActionBusy("meshJoinLoadChannels");
                          try {
                            await loadMeshChannels(s.id, meshConnection.name);
                            await loadMeshMyPermissions(s.id, meshConnection.name);
                            setMeshJoinStep("channel");
                          } catch (err: any) {
                            alert("加载频道失败：" + (err?.message || String(err)));
                          } finally {
                            setActionBusy(null);
                          }
                        }}
                        style={{
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "12px 12px",
                          border: "none",
                          borderBottom: "1px solid rgba(255,255,255,0.06)",
                          background: "transparent",
                          color: "#e5e7eb",
                          cursor: "pointer",
                          textAlign: "left"
                        }}
                      >
                        <FallbackAvatar
                          name={s.name || shortPeer(s.id)}
                          size="sm"
                          src={resolveAvatarSrc((s.avatar_url || "").trim())}
                        />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {s.name || "未命名服务器"}
                          </div>
                          <div style={{ fontSize: 12, opacity: 0.7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {s.id} {typeof s.visibility === "number" ? `· visibility:${s.visibility}` : ""}
                          </div>
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.7, flexShrink: 0 }}>
                          {actionBusy === "meshJoinLoadChannels" && meshSelectedSpaceId === s.id ? "加载中…" : "选择"}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </>
          ) : null}

          {meshJoinStep === "channel" ? (
            <>
              <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 10 }}>
                选择一个频道加入（群/广播）。
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
                <button
                  type="button"
                  onClick={() => setMeshJoinStep("server")}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "transparent",
                    color: "#e5e7eb",
                    cursor: "pointer"
                  }}
                >
                  返回
                </button>
                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  space：{meshSelectedSpaceId || "-"}
                </div>
              </div>

              {meshMyPermissions?.can_create_channel ? (
                <div
                  style={{
                    padding: "12px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.10)",
                    marginBottom: 10
                  }}
                >
                  <div style={{ fontWeight: 900, marginBottom: 8 }}>创建频道</div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                    <button
                      type="button"
                      onClick={() => setMeshCreateChannelType(1)}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.14)",
                        background: meshCreateChannelType === 1 ? "rgba(88,166,255,0.18)" : "transparent",
                        color: "#e5e7eb",
                        cursor: "pointer",
                        fontWeight: 800,
                        flex: 1
                      }}
                    >
                      群(1)
                    </button>
                    <button
                      type="button"
                      onClick={() => setMeshCreateChannelType(2)}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.14)",
                        background: meshCreateChannelType === 2 ? "rgba(88,166,255,0.18)" : "transparent",
                        color: "#e5e7eb",
                        cursor: "pointer",
                        fontWeight: 800,
                        flex: 1
                      }}
                    >
                      广播(2)
                    </button>
                  </div>

                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>名称</div>
                    <input
                      value={meshCreateChannelName}
                      onChange={e => setMeshCreateChannelName(e.target.value)}
                      placeholder="例如：我的频道"
                      style={{
                        width: "100%",
                        padding: "10px 10px",
                        borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.16)",
                        background: "rgba(0,0,0,0.18)",
                        color: "#e5e7eb",
                        outline: "none"
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>描述（可选）</div>
                    <textarea
                      value={meshCreateChannelDesc}
                      onChange={e => setMeshCreateChannelDesc(e.target.value)}
                      placeholder="一段简短描述"
                      style={{
                        width: "100%",
                        padding: "10px 10px",
                        borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.16)",
                        background: "rgba(0,0,0,0.18)",
                        color: "#e5e7eb",
                        outline: "none",
                        minHeight: 70,
                        resize: "vertical"
                      }}
                    />
                  </div>

                  <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>可见性</div>
                      <select
                        value={meshCreateChannelVisibility}
                        onChange={e =>
                          setMeshCreateChannelVisibility(e.target.value as "public" | "private")
                        }
                        style={{
                          width: "100%",
                          padding: "10px 10px",
                          borderRadius: 10,
                          border: "1px solid rgba(255,255,255,0.16)",
                          background: "rgba(0,0,0,0.18)",
                          color: "#e5e7eb",
                          outline: "none"
                        }}
                      >
                        <option value="public">public</option>
                        <option value="private">private</option>
                      </select>
                    </div>
                    <div style={{ width: 140 }}>
                      <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>慢速模式(s)</div>
                      <input
                        type="number"
                        value={meshCreateChannelSlowModeSeconds}
                        onChange={e => setMeshCreateChannelSlowModeSeconds(Number(e.target.value))}
                        min={0}
                        style={{
                          width: "100%",
                          padding: "10px 10px",
                          borderRadius: 10,
                          border: "1px solid rgba(255,255,255,0.16)",
                          background: "rgba(0,0,0,0.18)",
                          color: "#e5e7eb",
                          outline: "none"
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                    <button
                      type="button"
                      onClick={() => {
                        setMeshCreateChannelName("");
                        setMeshCreateChannelDesc("");
                        setMeshCreateChannelType(1);
                        setMeshCreateChannelVisibility("public");
                        setMeshCreateChannelSlowModeSeconds(0);
                      }}
                      style={{
                        padding: "10px 14px",
                        borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.14)",
                        background: "transparent",
                        color: "#e5e7eb",
                        cursor: "pointer"
                      }}
                      disabled={actionBusy === "meshCreateChannel"}
                    >
                      清空
                    </button>
                    <button
                      type="button"
                      onClick={createMeshChannelAndMaybeJoin}
                      disabled={actionBusy === "meshCreateChannel"}
                      style={{
                        padding: "10px 14px",
                        borderRadius: 10,
                        border: "none",
                        background: "#58a6ff",
                        color: "#08111c",
                        fontWeight: 900,
                        cursor: actionBusy === "meshCreateChannel" ? "not-allowed" : "pointer",
                        opacity: actionBusy === "meshCreateChannel" ? 0.7 : 1
                      }}
                    >
                      {actionBusy === "meshCreateChannel" ? "创建中…" : "创建并加入"}
                    </button>
                  </div>
                </div>
              ) : null}

              <div style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.10)", overflow: "hidden" }}>
                <div style={{ maxHeight: 320, overflowY: "auto" }}>
                  {meshChannels.length === 0 ? (
                    <div style={{ padding: 12, fontSize: 12, opacity: 0.7 }}>暂无频道</div>
                  ) : (
                    (() => {
                      const channels = meshChannels.slice();
                      if (channels.length === 0) {
                        return (
                          <div style={{ padding: 12, fontSize: 12, opacity: 0.7 }}>
                            暂无可显示的频道
                          </div>
                        );
                      }
                      return channels.map(ch => {
                        const anyCh = ch as any;
                        const channelId =
                          anyCh?.channel_id || anyCh?.channelId || anyCh?.id || "";
                        const channelType = Number(anyCh?.type);
                        const typeLabel =
                          channelType === 1
                            ? "群(1)"
                            : channelType === 2
                              ? "广播(2)"
                              : `type=${channelType || "-"}`;
                        return (
                          <div
                            key={channelId || (ch as any)?.channel_id}
                            style={{
                              padding: "12px 12px",
                              borderBottom: "1px solid rgba(255,255,255,0.06)",
                              cursor: "pointer"
                            }}
                            role="button"
                            tabIndex={0}
                            onClick={() => joinMeshChannel(ch)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") joinMeshChannel(ch);
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 10
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 10,
                                  minWidth: 0
                                }}
                              >
                                <FallbackAvatar
                                  name={ch.name || shortPeer(channelId)}
                                  size="sm"
                                  src={resolveAvatarSrc(
                                    (
                                      meshServers.find(s => s.id === ch.server_id)?.avatar_url ||
                                      ""
                                    ).trim()
                                  )}
                                />
                                <div style={{ minWidth: 0 }}>
                                  <div
                                    style={{
                                      fontWeight: 800,
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap"
                                    }}
                                  >
                                    {ch.name || "未命名群"}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: 12,
                                      opacity: 0.7,
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap"
                                    }}
                                  >
                                    {channelId}
                                  </div>
                                </div>
                              <div
                                style={{
                                  fontSize: 11,
                                  opacity: 0.85,
                                  padding: "4px 8px",
                                  borderRadius: 999,
                                  border: "1px solid rgba(255,255,255,0.12)",
                                  flexShrink: 0
                                }}
                              >
                                {typeLabel}
                              </div>
                              </div>
                              <button
                                type="button"
                                disabled={actionBusy === "meshJoin"}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  joinMeshChannel(ch);
                                }}
                                style={{
                                  padding: "8px 12px",
                                  borderRadius: 10,
                                  border: "none",
                                  background: "#58a6ff",
                                  color: "#08111c",
                                  fontWeight: 800,
                                  cursor:
                                    actionBusy === "meshJoin"
                                      ? "not-allowed"
                                      : "pointer",
                                  opacity: actionBusy === "meshJoin" ? 0.7 : 1,
                                  flexShrink: 0
                                }}
                              >
                                {actionBusy === "meshJoin" ? "加入中…" : "加入"}
                              </button>
                            </div>
                            {ch.description ? (
                              <div
                                style={{
                                  fontSize: 12,
                                  opacity: 0.75,
                                  marginTop: 6,
                                  whiteSpace: "pre-wrap",
                                  overflowWrap: "anywhere",
                                  wordBreak: "break-word"
                                }}
                              >
                                {ch.description}
                              </div>
                            ) : null}
                          </div>
                        );
                      });
                    })()
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>
      )}
      {renderModal(
        retentionModalOpen,
        () => {
          setRetentionModalOpen(false);
        },
        "自动删除时间",
        <div>
          <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 10 }}>
            选择单位与数量，系统会换算为分钟并保存。
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(
              [
                ["off", "关闭"],
                ["hour", "小时"],
                ["day", "天"],
                ["week", "一周"],
                ["month", "月"]
              ] as Array<[typeof retentionUnit, string]>
            ).map(([unit, label]) => (
              <button
                key={unit}
                type="button"
                onClick={() => {
                  setRetentionUnit(unit);
                  if (unit === "off") setRetentionValue(0);
                  else setRetentionValue(v => (v > 0 ? v : 1));
                }}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background:
                    retentionUnit === unit ? "rgba(88,166,255,0.18)" : "transparent",
                  color: "#e5e7eb",
                  cursor: "pointer"
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <div style={{ marginTop: 14 }}>
            {retentionUnit === "off" ? (
              <div style={{ fontSize: 12, opacity: 0.7 }}>当前为关闭（0 分钟）</div>
            ) : (
              <>
                <div style={{ fontSize: 13, marginBottom: 6 }}>
                  数量（{retentionUnit === "hour" ? "小时" : retentionUnit === "day" ? "天" : retentionUnit === "week" ? "周" : "月"}）
                </div>
                <input
                  type="number"
                  value={retentionValue}
                  onChange={e => setRetentionValue(Number(e.target.value))}
                  min={1}
                  style={{
                    width: "100%",
                    padding: "10px 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.16)",
                    background: "rgba(0,0,0,0.18)",
                    color: "#e5e7eb",
                    outline: "none"
                  }}
                />
                <div style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>
                  换算：1 小时=60 分钟，1 天=1440 分钟，1 周=10080 分钟，1 月按 30 天近似。
                </div>
              </>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
            <button
              type="button"
              onClick={() => setRetentionModalOpen(false)}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "transparent",
                color: "#e5e7eb",
                cursor: "pointer"
              }}
              disabled={retentionSaving}
            >
              取消
            </button>
            <button
              type="button"
              onClick={saveRetention}
              disabled={retentionSaving}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "none",
                background: "#58a6ff",
                color: "#08111c",
                fontWeight: 800,
                cursor: retentionSaving ? "not-allowed" : "pointer",
                opacity: retentionSaving ? 0.7 : 1
              }}
            >
              {retentionSaving ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
      )}

      {(() => {
        const closeGroupProfile = () => {
          setGroupProfileOpen(false);
          setGroupInviteQuery("");
          setGroupInviteIds(new Set());
          setGroupDissolveReason("");
        };

        const groupProfileBody = (
          <div>
            {selectedThreadKind === "group" && selectedThreadId ? (
              <>
                <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 10 }}>
                  群 ID：<code>{selectedThreadId}</code>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 13, marginBottom: 6 }}>群名称</div>
                  <input
                    value={groupTitleDraft}
                    onChange={e => setGroupTitleDraft(e.target.value)}
                    disabled={!(localGroupRole === "admin" || localGroupRole === "controller")}
                    placeholder="群名称"
                    style={{
                      width: "100%",
                      padding: "10px 10px",
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.16)",
                      background: "rgba(0,0,0,0.18)",
                      color: "#e5e7eb",
                      outline: "none",
                      opacity:
                        localGroupRole === "admin" || localGroupRole === "controller" ? 1 : 0.6
                    }}
                  />
                  {localGroupRole === "admin" || localGroupRole === "controller" ? (
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                      <button
                        type="button"
                        disabled={actionBusy === "groupTitle"}
                        onClick={() => handleUpdateGroupTitle(selectedThreadId)}
                        style={{
                          padding: "10px 14px",
                          borderRadius: 10,
                          border: "none",
                          background: "#58a6ff",
                          color: "#08111c",
                          fontWeight: 900,
                          cursor: actionBusy === "groupTitle" ? "not-allowed" : "pointer",
                          opacity: actionBusy === "groupTitle" ? 0.7 : 1
                        }}
                      >
                        {actionBusy === "groupTitle" ? "保存中…" : "保存群名称"}
                      </button>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>
                      你不是管理员，无法修改群名称
                    </div>
                  )}
                </div>

                {localGroupRole === "admin" || localGroupRole === "controller" ? (
                  <>
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 13, marginBottom: 6 }}>
                        邀请好友进群（从好友中选择）
                      </div>
                      <input
                        value={groupInviteQuery}
                        onChange={e => setGroupInviteQuery(e.target.value)}
                        placeholder="搜寻好友（昵称 / Peer ID）"
                        style={{
                          width: "100%",
                          padding: "10px 10px",
                          borderRadius: 10,
                          border: "1px solid rgba(255,255,255,0.16)",
                          background: "rgba(0,0,0,0.18)",
                          color: "#e5e7eb",
                          outline: "none"
                        }}
                      />

                      {groupInviteIds.size > 0 ? (
                        <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {Array.from(groupInviteIds).slice(0, 12).map(peerId => {
                            const c = contacts.find(x => x.id === peerId);
                            const label = c ? c.name : shortPeer(peerId);
                            return (
                              <button
                                key={peerId}
                                type="button"
                                onClick={() =>
                                  setGroupInviteIds(prev => {
                                    const next = new Set(prev);
                                    next.delete(peerId);
                                    return next;
                                  })
                                }
                                style={{
                                  padding: "6px 10px",
                                  borderRadius: 999,
                                  border: "1px solid rgba(255,255,255,0.14)",
                                  background: "rgba(255,255,255,0.06)",
                                  color: "#e5e7eb",
                                  cursor: "pointer",
                                  fontSize: 12
                                }}
                                title="点击移除"
                              >
                                {label} ×
                              </button>
                            );
                          })}
                          {groupInviteIds.size > 12 ? (
                            <div style={{ fontSize: 12, opacity: 0.7, padding: "6px 2px" }}>
                              +{groupInviteIds.size - 12}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
                          尚未选择要邀请的好友
                        </div>
                      )}

                      <div
                        style={{
                          marginTop: 10,
                          borderRadius: 12,
                          border: "1px solid rgba(255,255,255,0.10)",
                          overflow: "hidden"
                        }}
                      >
                        <div style={{ maxHeight: 220, overflowY: "auto" }}>
                          {contacts
                            .filter(c => {
                              const q = groupInviteQuery.trim().toLowerCase();
                              if (!q) return true;
                              return (
                                c.name.toLowerCase().includes(q) ||
                                c.id.toLowerCase().includes(q)
                              );
                            })
                            .map(c => {
                              const checked = groupInviteIds.has(c.id);
                              return (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() =>
                                    setGroupInviteIds(prev => {
                                      const next = new Set(prev);
                                      if (next.has(c.id)) next.delete(c.id);
                                      else next.add(c.id);
                                      return next;
                                    })
                                  }
                                  style={{
                                    width: "100%",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 10,
                                    padding: "10px 12px",
                                    border: "none",
                                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                                    background: checked
                                      ? "rgba(88,166,255,0.10)"
                                      : "transparent",
                                    color: "#e5e7eb",
                                    cursor: "pointer",
                                    textAlign: "left"
                                  }}
                                >
                                  <div
                                    style={{
                                      width: 18,
                                      height: 18,
                                      borderRadius: 6,
                                      border: "1px solid rgba(255,255,255,0.18)",
                                      background: checked ? "#58a6ff" : "transparent",
                                      flexShrink: 0
                                    }}
                                  />
                                  <FallbackAvatar
                                    name={c.name}
                                    size="sm"
                                    src={resolveAvatarSrc((c as any).avatarUrl)}
                                  />
                                  <div style={{ minWidth: 0, flex: 1 }}>
                                    <div
                                      style={{
                                        fontWeight: 700,
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap"
                                      }}
                                    >
                                      {c.name}
                                    </div>
                                    <div
                                      style={{
                                        fontSize: 12,
                                        opacity: 0.7,
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap"
                                      }}
                                    >
                                      {shortPeer(c.id)}
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          {contacts.length === 0 ? (
                            <div style={{ padding: 12, fontSize: 12, opacity: 0.7 }}>
                              目前没有好友可选
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          justifyContent: "flex-end",
                          gap: 10,
                          marginTop: 12
                        }}
                      >
                        <button
                          type="button"
                          disabled={actionBusy === "groupInvite"}
                          onClick={() => handleInviteGroupMembers(selectedThreadId)}
                          style={{
                            padding: "10px 14px",
                            borderRadius: 10,
                            border: "none",
                            background: "#58a6ff",
                            color: "#08111c",
                            fontWeight: 900,
                            cursor: actionBusy === "groupInvite" ? "not-allowed" : "pointer",
                            opacity: actionBusy === "groupInvite" ? 0.7 : 1
                          }}
                        >
                          {actionBusy === "groupInvite" ? "邀请中…" : "发送邀请"}
                        </button>
                      </div>
                    </div>

                    <div
                      style={{
                        marginTop: 16,
                        borderTop: "1px solid rgba(255,255,255,0.08)",
                        paddingTop: 14
                      }}
                    >
                      <div
                        style={{
                          fontSize: 13,
                          marginBottom: 6,
                          color: "#fca5a5",
                          fontWeight: 900
                        }}
                      >
                        解散群
                      </div>
                      <textarea
                        value={groupDissolveReason}
                        onChange={e => setGroupDissolveReason(e.target.value)}
                        placeholder="解散原因（可选）"
                        style={{
                          width: "100%",
                          padding: "10px 10px",
                          borderRadius: 10,
                          border: "1px solid rgba(255,255,255,0.16)",
                          background: "rgba(0,0,0,0.18)",
                          color: "#e5e7eb",
                          outline: "none",
                          minHeight: 70,
                          resize: "vertical"
                        }}
                      />
                      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                        <button
                          type="button"
                          disabled={actionBusy === "groupDissolve"}
                          onClick={() => handleDissolveGroup(selectedThreadId)}
                          style={{
                            padding: "10px 14px",
                            borderRadius: 10,
                            border: "none",
                            background: "#f85149",
                            color: "#08111c",
                            fontWeight: 900,
                            cursor:
                              actionBusy === "groupDissolve" ? "not-allowed" : "pointer",
                            opacity: actionBusy === "groupDissolve" ? 0.7 : 1
                          }}
                        >
                          {actionBusy === "groupDissolve" ? "解散中…" : "解散群"}
                        </button>
                      </div>
                    </div>
                  </>
                ) : null}
              </>
            ) : (
              <div style={{ fontSize: 12, opacity: 0.75 }}>
                请先进入一个群会话再打开群资料。
              </div>
            )}
          </div>
        );

        if (groupProfileOpen && isMobile) {
          return (
            <div
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 10000,
                background: "rgba(8,17,28,0.98)",
                display: "flex",
                flexDirection: "column"
              }}
            >
              <div
                style={{
                  padding: "10px 12px",
                  borderBottom: "1px solid rgba(255,255,255,0.08)",
                  display: "flex",
                  alignItems: "center",
                  gap: 10
                }}
              >
                <button
                  type="button"
                  onClick={closeGroupProfile}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "transparent",
                    color: "#e5e7eb",
                    cursor: "pointer"
                  }}
                >
                  返回
                </button>
                <div style={{ fontWeight: 900 }}>群资料</div>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
                {groupProfileBody}
              </div>
            </div>
          );
        }

        return renderModal(groupProfileOpen, closeGroupProfile, "群资料", groupProfileBody);
      })()}
    </div>
  );
};

export default App;
