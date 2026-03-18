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

type ThreadKind = "direct" | "group";

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

function deliveryStatusText(state?: string, deliveredAt?: string): string {
  const s = (state || "").trim();
  if (!s) return "";
  const label =
    s === "sent"
      ? "已送出"
      : s === "delivered_local"
        ? "已投遞"
        : s === "delivered_remote" || s === "delivered"
          ? "已送達"
          : s === "read_remote" || s === "read"
            ? "已讀"
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
  if (abs < 60 * 1000) return diff >= 0 ? "剛剛" : "即將";
  if (abs < 60 * 60 * 1000) {
    return `${Math.round(abs / (60 * 1000))} 分鐘${diff >= 0 ? "前" : "後"}`;
  }
  if (abs < 24 * 60 * 60 * 1000) {
    return `${Math.round(abs / (60 * 60 * 1000))} 小時${diff >= 0 ? "前" : "後"}`;
  }
  return `${Math.round(abs / (24 * 60 * 60 * 1000))} 天${diff >= 0 ? "前" : "後"}`;
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

  const [messages, setMessages] = useState<Array<DirectMessage | GroupMessage>>([]);
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
          subtitle: `成員 ${g.member_count || 0}`,
          lastMessage: g.last_message?.plaintext || "",
          lastTime: relativeTime(g.last_message_at || g.updated_at),
          unread: 0
        }))
      ],
    [conversations, groups, contactsRaw, contactAvatarMap]
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
  const [addFriendPeerId, setAddFriendPeerId] = useState("");
  const [addFriendIntro, setAddFriendIntro] = useState("你好，我想和你開始聊天。");
  const [createGroupTitle, setCreateGroupTitle] = useState("");
  const [createGroupMemberIds, setCreateGroupMemberIds] = useState<Set<string>>(
    new Set()
  );
  const [createGroupMemberQuery, setCreateGroupMemberQuery] = useState("");
  const [actionBusy, setActionBusy] = useState<null | string>(null);

  // 自動刪除（retention）選擇彈窗
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
    // 只有成功載入過的圖片才交給 Avatar，避免 broken 圖示
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
        const [meRes, contactsRes, convs, grps] = await Promise.all([
          get<Me>("/api/v1/chat/me"),
          get<ContactRaw[]>("/api/v1/chat/contacts"),
          get<ConversationRaw[]>("/api/v1/chat/conversations"),
          get<GroupRaw[]>("/api/v1/groups")
        ]);
        setMe(meRes || null);
        setMeNicknameDraft(meRes?.nickname || "");
        setMeBioDraft(meRes?.bio || "");
        setContactsRaw(normalizeEntityList<ContactRaw>(contactsRes, ["contacts"]));
        setConversations(
          normalizeEntityList<ConversationRaw>(convs, ["conversations"])
        );
        setGroups(normalizeEntityList<GroupRaw>(grps, ["groups"]));

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
      } catch (err) {
        console.error("初始化失敗:", err);
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
    // 手機端：沒有選中會話時回到列表；選中後默認進聊天頁
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
          // 同步拉取群詳細資料，用於權限（admin 可撤回所有人）
          const details = await get<GroupDetails>(
            `/api/v1/groups/${encodeURIComponent(id)}`
          ).catch(() => null);
          setSelectedGroupDetails(details);
          const resp = await get<any>(
            `/api/v1/groups/${encodeURIComponent(id)}/messages`
          );
          setMessages(normalizeList<GroupMessage>(resp));
        } else {
          setSelectedGroupDetails(null);
          const resp = await get<any>(
            `/api/v1/chat/conversations/${encodeURIComponent(id)}/messages`
          );
          setMessages(normalizeList<DirectMessage>(resp));
        }
      } catch (err) {
        console.error("載入訊息失敗:", err);
        setMessages([]);
      } finally {
        setMessagesLoading(false);
      }
    },
    []
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
      if (selectedThreadKind === "group") {
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
      console.error("發送訊息失敗:", err);
      alert("發送失敗：" + (err?.message || String(err)));
    } finally {
      setSending(false);
    }
  };

  const sendFileForCurrentThread = async (file: File) => {
    if (!selectedThreadId) return;
    setFileSending({ text: `上傳中：${file.name}` });
    try {
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
      console.error("發送文件失敗:", err);
      setFileSending({ text: `發送文件失敗：${err?.message || String(err)}`, error: true });
      setTimeout(() => setFileSending(null), 3500);
    }
  };

  const revokeDirectMessage = async (conversationId: string, msgId: string) => {
    if (!conversationId || !msgId) return;
    if (!window.confirm("確認撤回這條消息嗎？撤回後雙方都會刪除這條消息。")) return;
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
      console.error("撤回失敗:", err);
      alert("撤回失敗：" + (err?.message || String(err)));
    }
  };

  const revokeGroupMessage = async (groupId: string, msgId: string) => {
    if (!groupId || !msgId) return;
    if (!window.confirm("確認撤回這條群消息嗎？")) return;
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
      console.error("群消息撤回失敗:", err);
      alert("撤回失敗：" + (err?.message || String(err)));
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
          if (e.pointerType === "mouse") return; // 滑鼠用右鍵
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
      alert("好友請求已發送");
    } catch (err: any) {
      alert("發送好友請求失敗：" + (err?.message || String(err)));
    } finally {
      setActionBusy(null);
    }
  };

  const createGroup = async () => {
    const title = createGroupTitle.trim();
    const members = Array.from(createGroupMemberIds);
    if (!title) {
      alert("群標題不能為空");
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
      alert("建立群聊失敗：" + (err?.message || String(err)));
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
            發起群聊
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
      console.error("加入群聊失敗:", err);
      alert("加入群聊失敗：" + (err?.message || String(err)));
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
      console.error("保存備註失敗:", err);
      alert("保存備註失敗：" + (err?.message || String(err)));
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
      console.error("更新拉黑狀態失敗:", err);
      alert("更新拉黑狀態失敗：" + (err?.message || String(err)));
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
      console.warn("connect 失敗，可忽略:", err);
    }
    alert("暫未找到現成會話，請在原頁面發起聊天請求或等待對方同意。");
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
      console.error("保存名片失敗:", err);
      alert("保存名片失敗：" + (err?.message || String(err)));
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
                        if (selectedThread.kind !== "direct") return;
                        const peerId = (selectedThread as any).peerId as string | undefined;
                        if (!peerId) return;
                        setSelectedContactId(peerId);
                        if (isMobile) setContactsMobileView("detail");
                        setActiveTab("contacts");
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        cursor: selectedThread.kind === "direct" ? "pointer" : "default"
                      }}
                      title={selectedThread.kind === "direct" ? "查看好友資料" : ""}
                      role={selectedThread.kind === "direct" ? "button" : undefined}
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
                        自動刪除：
                        {selectedConversation?.retention_minutes
                          ? `${selectedConversation.retention_minutes} 分鐘`
                          : "關閉"}
                      </div>
                    ) : (
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
                        自動刪除：
                        {selectedGroup?.retention_minutes
                          ? `${selectedGroup.retention_minutes} 分鐘`
                          : "關閉"}
                      </div>
                    )}
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
                    載入中…
                  </div>
                ) : messages.length === 0 ? (
                  <div style={{ padding: 12, color: "#9ca3af", fontSize: 13 }}>
                    暫無消息
                  </div>
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
                                  下載檔案：{m.file_name || "file"}
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
                              群聊邀請
                            </div>
                            <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                              {fromMe ? "你已發送一個群邀請" : "你收到一個群邀請"}
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
                                打開群聊
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
                                  下載檔案：{m.file_name || "file"}
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
                    發送中…
                  </div>
                ) : null}
              </div>

                <div
                  style={{
                    flexShrink: 0,
                    borderTop: "1px solid rgba(255,255,255,0.08)"
                  }}
                >
                  <MessageInput
                    placeholder="輸入訊息..."
                    attachButton={false}
                    onSend={handleSendMessage}
                  />
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
                請先從列表選擇一個會話
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
        const ContactList = (
          <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "12px 16px", fontWeight: 700 }}>联系人</div>
            <div style={{ flex: 1, overflowY: "auto" }}>
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
                      備註：{c.remark || "（無）"}
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
                      簡介：
                      {(selectedContact as any).bio
                        ? (selectedContact as any).bio
                        : "（無）"}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
                      最後上線：{selectedContact.lastSeen || "-"}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 24 }}>
                  <div style={{ fontSize: 14, marginBottom: 4 }}>備註名</div>
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
                      {contactRemarkSaving ? "保存中…" : "保存備註"}
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
                    發起對話
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
                請先選擇一位联系人
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
            簡介：{me?.bio ? me.bio : "（無）"}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 24, maxWidth: 360 }}>
        <div style={{ fontSize: 14, marginBottom: 4 }}>暱稱</div>
        <input
          type="text"
          value={meNicknameDraft}
          onChange={e => setMeNicknameDraft(e.target.value)}
          placeholder="輸入暱稱"
          style={{
            width: "100%",
            padding: "8px 10px",
            borderRadius: 6,
            border: "1px solid #ccc",
            outline: "none"
          }}
        />

        <div style={{ fontSize: 14, marginBottom: 4, marginTop: 14 }}>簡介（bio）</div>
        <textarea
          value={meBioDraft}
          onChange={e => setMeBioDraft(e.target.value)}
          placeholder="寫幾句介紹自己（可留空）"
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
          {activeTab === "chat" ? (
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
            輸入對方 Peer ID，發送好友請求後對方接受即可開始私聊。
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
              {actionBusy === "addFriend" ? "發送中…" : "發送請求"}
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
        "發起群聊",
        <div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 13, marginBottom: 6 }}>群標題</div>
            <input
              value={createGroupTitle}
              onChange={e => setCreateGroupTitle(e.target.value)}
              placeholder="例如：運營群 / 項目群"
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
              初始成員（從好友中選擇）
            </div>
            <input
              value={createGroupMemberQuery}
              onChange={e => setCreateGroupMemberQuery(e.target.value)}
              placeholder="搜尋好友（暱稱 / Peer ID）"
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
                      title="點擊移除"
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
                尚未選擇成員（可不選，先建群後再邀請）
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
                    目前沒有好友可選
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
        retentionModalOpen,
        () => {
          setRetentionModalOpen(false);
        },
        "自動刪除時間",
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
    </div>
  );
};

export default App;

