import React, { useCallback, useEffect, useMemo, useState } from "react";
import "@chatscope/chat-ui-kit-styles/dist/default/styles.min.css";
import "./chat-input-overrides.css";
import type {
  ThreadKind,
  Me,
  ContactRaw,
  ConversationRaw,
  GroupRaw,
  FriendRequestRaw,
  MeshserverConnectionRaw,
  MeshserverServerRaw,
  MeshserverChannelRaw,
  MeshserverGroupThread,
  MeshserverSyncMessage,
  DirectMessage,
  GroupMessage,
  GroupDetails,
  WsChatEvent
} from "./types";
import {
  api,
  get,
  post,
  deleteChatResource,
  avatarUrl,
  directFileUrl,
  groupFileUrl,
  markConversationRead
} from "./api";
import {
  normalizeList,
  normalizeEntityList,
  safeJsonParse,
  retentionMinutesFrom,
  retentionUnitValueFromMinutes,
  shortPeer,
  formatTimeFromMs,
  normalizeChatMe,
  isImageMime,
  isVideoMime,
  resolveMeshserverAssetUrl,
  withOptimisticConversationPreview,
  withOptimisticGroupPreview,
  mergeConversationsPreservePreview,
  mergeGroupsPreservePreview,
  extractInlinePreviewFromWsPayload,
  fetchLastMessagePreviewForThread,
  setConversationLastMessagePreview,
  setGroupLastMessagePreview,
  threadUnreadKey,
  wsPayloadHasFullMessage,
  directMessageFromWsPayload,
  groupMessageFromWsPayload,
  mergeMessagesByTime
} from "./utils";
import { createListRowMenuHandlers } from "./hooks/createListRowMenuHandlers";
import { useIsMobile } from "./hooks/useIsMobile";
import { useAvatarUrlGate } from "./hooks/useAvatarUrlGate";
import { useThreadMessagesLoader } from "./hooks/useThreadMessagesLoader";
import { useChatWebSocket } from "./hooks/useChatWebSocket";
import {
  buildContactAvatarMap,
  mapContactsToRows,
  buildChatThreadListItems,
  normalizeMeshSpacesFromResponse,
  fetchInitialMeshGroupThreads,
  RETENTION_INVALID_ALERT_ZH,
  isValidRetentionMinutesTotal,
  retentionDirectConversationPath,
  retentionGroupPath
} from "./domain";
import { FallbackAvatar, textAvatarLetter } from "./components/FallbackAvatar";
import { BottomTabItem } from "./components/BottomTabItem";
import { PlusMenu } from "./components/PlusMenu";
import {
  MessageContextMenu,
  type MessageMenuState,
  type ForwardFilePayload
} from "./components/MessageContextMenu";

type ForwardDraft =
  | { kind: "text"; text: string }
  | ({ kind: "file" } & ForwardFilePayload);
import { ForwardMessageModal } from "./components/ForwardMessageModal";
import { ListItemContextMenu } from "./components/ListItemContextMenu";
import { MeTab } from "./features/me";
import { ContactsTab } from "./features/contacts";
import { ChatTab, type ChatThreadListItem } from "./features/chat";
import {
  AddFriendModal,
  CreateGroupModal,
  MeshJoinModal,
  RetentionModal,
  GroupProfileModal,
  type RetentionUnit
} from "./features/modals";

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

  const messagesRef = React.useRef(messages);
  React.useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const contactAvatarMap = useMemo(
    () => buildContactAvatarMap(contactsRaw),
    [contactsRaw]
  );

  const { resolveAvatarSrc } = useAvatarUrlGate(contactAvatarMap, me);

  const contacts = useMemo(() => mapContactsToRows(contactsRaw), [contactsRaw]);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);

  const threads = useMemo(
    () =>
      buildChatThreadListItems(
        conversations,
        groups,
        meshGroups,
        contactsRaw,
        contactAvatarMap
      ),
    [conversations, groups, meshGroups, contactsRaw, contactAvatarMap]
  );

  /** 各會話未讀條數（key: `${kind}:${id}`） */
  const [threadUnreadCounts, setThreadUnreadCounts] = useState<Record<string, number>>(
    () => ({})
  );

  const threadsWithUnread = useMemo(
    () =>
      threads.map(t => {
        if (t.kind === "direct") {
          return { ...t, unreadCount: t.unreadCount ?? 0 };
        }
        const key = threadUnreadKey(t.kind, t.id);
        return {
          ...t,
          unreadCount: threadUnreadCounts[key] ?? 0
        };
      }),
    [threads, threadUnreadCounts]
  );

  const markThreadAsRead = useCallback((kind: ThreadKind, threadId: string) => {
    const key = threadUnreadKey(kind, threadId);
    setThreadUnreadCounts(prev => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    if (kind === "direct") {
      setConversations(prev =>
        prev.map(c =>
          c.conversation_id === threadId ? { ...c, unread_count: 0 } : c
        )
      );
      void markConversationRead(threadId)
        .then(updated => {
          setConversations(prev =>
            prev.map(c =>
              c.conversation_id === threadId ? { ...c, ...updated } : c
            )
          );
        })
        .catch(err => {
          console.warn("标记会话已读失败:", err);
        });
    }
  }, []);

  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [selectedThreadKind, setSelectedThreadKind] = useState<ThreadKind>("direct");

  // Keep websocket message handler in sync with latest selection without re-connect.
  const activeTabRef = React.useRef(activeTab);
  React.useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  const selectedThreadRef = React.useRef<{
    kind: ThreadKind;
    id: string | null;
  }>({ kind: selectedThreadKind, id: selectedThreadId });
  React.useEffect(() => {
    selectedThreadRef.current = { kind: selectedThreadKind, id: selectedThreadId };
  }, [selectedThreadKind, selectedThreadId]);

  const [wsConnected, setWsConnected] = useState(false);

  const isMobile = useIsMobile();
  const isMobileRef = React.useRef(isMobile);
  React.useEffect(() => {
    isMobileRef.current = isMobile;
  }, [isMobile]);
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  const [contactsMobileView, setContactsMobileView] = useState<"list" | "detail">(
    "list"
  );
  const [fileSending, setFileSending] = useState<null | { text: string; error?: boolean }>(
    null
  );
  const [msgMenu, setMsgMenu] = useState<MessageMenuState | null>(null);
  const [forwardDraft, setForwardDraft] = useState<ForwardDraft | null>(null);
  const [forwardBusy, setForwardBusy] = useState(false);
  const [listItemMenu, setListItemMenu] = useState<null | {
    x: number;
    y: number;
    kind: "contact" | "conversation";
    id: string;
    title: string;
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

  // 私聊對象連線狀態（peer_id -> 狀態字串）
  const [peerStatusMap, setPeerStatusMap] = useState<Map<string, any>>(
    () => new Map()
  );

  // 自动删除（retention）选择弹窗
  const [retentionModalOpen, setRetentionModalOpen] = useState(false);
  const [retentionUnit, setRetentionUnit] = useState<RetentionUnit>("off");
  const [retentionValue, setRetentionValue] = useState<number>(1);
  const [retentionSaving, setRetentionSaving] = useState(false);
  const [retentionTarget, setRetentionTarget] = useState<
    null | { kind: ThreadKind; id: string }
  >(null);

  const [contactRemarkDraft, setContactRemarkDraft] = useState("");
  const [contactRemarkSaving, setContactRemarkSaving] = useState(false);

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

  const { loadThreadMessages } = useThreadMessagesLoader({
    meshGroups,
    selectedThreadId,
    selectedThreadKind,
    activeTab,
    messagesRef,
    setMessages,
    setMessagesLoading,
    setSelectedGroupDetails
  });

  const convListRefreshTimerRef = React.useRef<number | null>(null);
  const scheduleRefreshConversationList = useCallback(() => {
    if (convListRefreshTimerRef.current != null) {
      window.clearTimeout(convListRefreshTimerRef.current);
    }
    convListRefreshTimerRef.current = window.setTimeout(() => {
      convListRefreshTimerRef.current = null;
      void Promise.all([
        get<ConversationRaw[]>("/api/v1/chat/conversations"),
        get<GroupRaw[]>("/api/v1/groups")
      ])
        .then(([convs, grps]) => {
          setConversations(prev =>
            mergeConversationsPreservePreview(
              prev,
              normalizeEntityList<ConversationRaw>(convs, ["conversations"])
            )
          );
          setGroups(prev =>
            mergeGroupsPreservePreview(
              prev,
              normalizeEntityList<GroupRaw>(grps, ["groups"])
            )
          );
        })
        .catch(() => {
          /* ignore */
        });
    }, 400);
  }, []);

  const handleIncomingChatMessage = useCallback(
    (raw: Record<string, unknown>) => {
      const kindStr = String(raw.kind ?? "direct").toLowerCase();
      const idRaw = raw.conversation_id ?? raw.group_id;
      const id = typeof idRaw === "string" ? idRaw : "";
      if (!id.trim()) return;

      if (kindStr === "meshserver_group") return;

      const threadKind: ThreadKind = kindStr === "group" ? "group" : "direct";
      const fromPeer = raw.from_peer_id;
      const isSelf =
        typeof fromPeer === "string" &&
        !!me?.peer_id &&
        fromPeer === me.peer_id;
      if (!isSelf) {
        const sel = selectedThreadRef.current;
        if (!(sel.id === id && sel.kind === threadKind)) {
          // 私聊未讀以 /conversations 的 unread_count 為準，WS 後由 scheduleRefreshConversationList 刷新
          if (threadKind === "group") {
            const ukey = threadUnreadKey(threadKind, id);
            setThreadUnreadCounts(prev => ({
              ...prev,
              [ukey]: (prev[ukey] || 0) + 1
            }));
          }
        }
      }

      const inline = extractInlinePreviewFromWsPayload(raw);
      const applyPreview = (preview: string) => {
        if (!preview.trim()) return;
        if (kindStr === "group") {
          setGroups(prev => setGroupLastMessagePreview(prev, id, preview));
        } else {
          setConversations(prev =>
            setConversationLastMessagePreview(prev, id, preview)
          );
        }
      };

      if (inline) {
        applyPreview(inline);
        return;
      }

      void (async () => {
        try {
          const preview =
            kindStr === "group"
              ? await fetchLastMessagePreviewForThread("group", id)
              : await fetchLastMessagePreviewForThread("direct", id);
          applyPreview(preview);
        } catch {
          /* ignore */
        }
      })();
    },
    [me?.peer_id]
  );

  /** 後端 WS 已帶正文時直接併入當前線程，避免再 silent 請求 /messages */
  const mergeMessageFromWs = useCallback(
    (evt: WsChatEvent): boolean => {
      const raw = evt as unknown as Record<string, unknown>;
      if (!wsPayloadHasFullMessage(raw)) return false;
      const kindStr = String(evt.kind ?? "direct").toLowerCase();
      if (kindStr === "meshserver_group") return false;
      const id = String(evt.conversation_id ?? "").trim();
      if (!id) return false;
      const sel = selectedThreadRef.current;
      if (!sel.id || sel.id !== id) return false;
      const threadKind: ThreadKind = kindStr === "group" ? "group" : "direct";
      if (sel.kind !== threadKind) return false;

      if (threadKind === "direct") {
        const dm = directMessageFromWsPayload(raw);
        if (!dm) return false;
        setMessages(
          prev =>
            mergeMessagesByTime(prev as DirectMessage[], dm) as Array<
              DirectMessage | GroupMessage | MeshserverSyncMessage
            >
        );
        return true;
      }
      const gm = groupMessageFromWsPayload(raw);
      if (!gm) return false;
      setMessages(
        prev =>
          mergeMessagesByTime(prev as GroupMessage[], gm) as Array<
            DirectMessage | GroupMessage | MeshserverSyncMessage
          >
      );
      return true;
    },
    [setMessages]
  );

  /** WS type === message_state：對應 msg_id 更新 state / delivered_at / delivery_summary */
  const applyMessageStateFromWs = useCallback(
    (raw: Record<string, unknown>) => {
      const msgId = raw.msg_id;
      if (typeof msgId !== "string" || !msgId.trim()) return;

      const messageState =
        typeof raw.message_state === "string" ? raw.message_state : undefined;

      const convId = raw.conversation_id;
      const groupId = raw.group_id;

      let deliveredAt: string | undefined;
      if (
        typeof raw.delivered_at_unix_millis === "number" &&
        Number.isFinite(raw.delivered_at_unix_millis)
      ) {
        deliveredAt = new Date(raw.delivered_at_unix_millis).toISOString();
      } else if (
        typeof raw.delivered_at === "string" &&
        raw.delivered_at.trim()
      ) {
        deliveredAt = raw.delivered_at;
      }

      const deliverySummary = raw.delivery_summary;

      setMessages(prev => {
        const sel = selectedThreadRef.current;
        if (!sel.id) return prev;

        if (
          sel.kind === "direct" &&
          typeof convId === "string" &&
          convId === sel.id
        ) {
          return prev.map(m => {
            if (!("msg_id" in m) || !("direction" in m)) return m;
            const dm = m as DirectMessage;
            if (dm.msg_id !== msgId) return m;
            return {
              ...dm,
              state: messageState ?? dm.state,
              message_state: messageState ?? dm.message_state,
              ...(deliveredAt ? { delivered_at: deliveredAt } : {})
            };
          });
        }

        if (
          sel.kind === "group" &&
          typeof groupId === "string" &&
          groupId === sel.id
        ) {
          return prev.map(m => {
            if (!("msg_id" in m) || !("sender_peer_id" in m)) return m;
            const gm = m as GroupMessage;
            if (gm.msg_id !== msgId) return m;
            return {
              ...gm,
              state: messageState ?? gm.state,
              message_state: messageState ?? gm.message_state,
              ...(deliverySummary !== undefined
                ? { delivery_summary: deliverySummary }
                : {})
            };
          });
        }

        return prev;
      });
    },
    [setMessages]
  );

  useChatWebSocket({
    activeTab,
    loadThreadMessages,
    setWsConnected,
    setRequestsRaw,
    setContactsRaw,
    setConversations,
    setSelectedThreadId,
    setSelectedThreadKind,
    setActiveTab,
    setMobileView,
    activeTabRef,
    selectedThreadRef,
    isMobileRef,
    scheduleRefreshConversationList,
    onIncomingChatMessage: handleIncomingChatMessage,
    mergeMessageFromWs,
    onMessageState: applyMessageStateFromWs
  });

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
    if (!isValidRetentionMinutesTotal(minutes)) {
      alert(RETENTION_INVALID_ALERT_ZH);
      return;
    }
    setRetentionSaving(true);
    try {
      if (retentionTarget.kind === "direct") {
        await post(retentionDirectConversationPath(retentionTarget.id), {
          retention_minutes: minutes
        });
        const convs = await get<ConversationRaw[]>(
          "/api/v1/chat/conversations"
        );
      setConversations(
        normalizeEntityList<ConversationRaw>(convs, ["conversations"])
      );
      } else {
        await post(retentionGroupPath(retentionTarget.id), { retention_minutes: minutes });
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

  const selectedContact = useMemo(
    () => contacts.find(c => c.id === selectedContactId) || null,
    [contacts, selectedContactId]
  );

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
        const meNormalized = normalizeChatMe(meRes);
        setMe(meNormalized);
        setMeNicknameDraft(meNormalized?.nickname || "");
        setMeBioDraft(meNormalized?.bio || "");
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
          const activeConvs = convs.filter(c => (c.state || "active") === "active");
          if (activeConvs.length > 0) {
            setSelectedThreadId(activeConvs[0].conversation_id);
            setSelectedThreadKind("direct");
          } else if (Array.isArray(grps) && grps.length > 0) {
            setSelectedThreadId(grps[0].group_id);
            setSelectedThreadKind("group");
          }
        } else if (Array.isArray(grps) && grps.length > 0) {
          setSelectedThreadId(grps[0].group_id);
          setSelectedThreadKind("group");
        }

        // meshserver：开机自动拉取已加入的频道，用于会话列表展示
        try {
          const nextThreads = await fetchInitialMeshGroupThreads(get);
          if (nextThreads.length) {
            setMeshGroups(prev => {
              const map = new Map(prev.map(t => [t.threadId, t]));
              for (const t of nextThreads) map.set(t.threadId, t);
              return Array.from(map.values());
            });
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
        markThreadAsRead("meshserver_group", selectedThreadId);
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
        setGroups(
          withOptimisticGroupPreview(
            Array.isArray(grps) ? grps : [],
            selectedThreadId,
            text
          )
        );
        markThreadAsRead("group", selectedThreadId);
      } else {
        const currentConv = conversations.find(c => c.conversation_id === selectedThreadId) || null;
        const currentActive = (currentConv?.state || "active") === "active";
        let targetConversationId = selectedThreadId;
        if (!currentActive) {
          const peerId = currentConv?.peer_id || selectedContactId || null;
          const activeConv = peerId
            ? conversations.find(
                c => c.peer_id === peerId && (c.state || "active") === "active"
              )
            : undefined;
          if (!activeConv?.conversation_id) {
            alert("对方尚未建立好友关系，请重新添加好友。");
            return;
          }
          targetConversationId = activeConv.conversation_id;
          setSelectedThreadId(targetConversationId);
          setSelectedThreadKind("direct");
        }

        await post(
          `/api/v1/chat/conversations/${encodeURIComponent(
            targetConversationId
          )}/messages`,
          { text }
        );
        const [list, convs] = await Promise.all([
          get<DirectMessage[]>(
            `/api/v1/chat/conversations/${encodeURIComponent(
              targetConversationId
            )}/messages`
          ),
          get<ConversationRaw[]>("/api/v1/chat/conversations")
        ]);
        setMessages(Array.isArray(list) ? list : []);
        setConversations(
          withOptimisticConversationPreview(
            Array.isArray(convs) ? convs : [],
            targetConversationId,
            text
          )
        );
        markThreadAsRead("direct", targetConversationId);
      }
    } catch (err: any) {
      console.error("发送讯息失败:", err);
      alert("发送失败：" + (err?.message || String(err)));
    } finally {
      setSending(false);
    }
  };

  const forwardTextToThreadOnce = useCallback(
    async (targetKind: ThreadKind, targetThreadId: string, text: string) => {
      const body = text.trim();
      if (!body) return;
      if (targetKind === "meshserver_group") {
        const thread = meshGroups.find(t => t.threadId === targetThreadId) || null;
        const connectionName = thread?.connectionName;
        if (!thread || !connectionName) {
          throw new Error("未找到 meshserver 频道上下文");
        }
        await post(
          `/api/v1/meshserver/channels/${encodeURIComponent(
            targetThreadId
          )}/messages?connection=${encodeURIComponent(connectionName)}`,
          {
            client_msg_id: `local-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            message_type: "text",
            text: body
          }
        );
        if (
          selectedThreadKind === "meshserver_group" &&
          selectedThreadId === targetThreadId
        ) {
          await loadThreadMessages("meshserver_group", targetThreadId);
        }
        markThreadAsRead("meshserver_group", targetThreadId);
        return;
      }
      if (targetKind === "group") {
        await post(`/api/v1/groups/${encodeURIComponent(targetThreadId)}/messages`, {
          text: body
        });
        const [list, grps] = await Promise.all([
          get<GroupMessage[]>(
            `/api/v1/groups/${encodeURIComponent(targetThreadId)}/messages`
          ),
          get<GroupRaw[]>("/api/v1/groups")
        ]);
        if (selectedThreadKind === "group" && selectedThreadId === targetThreadId) {
          setMessages(Array.isArray(list) ? list : []);
        }
        setGroups(
          withOptimisticGroupPreview(
            Array.isArray(grps) ? grps : [],
            targetThreadId,
            body
          )
        );
        markThreadAsRead("group", targetThreadId);
        return;
      }
      let targetConversationId = targetThreadId;
      const currentConv =
        conversations.find(c => c.conversation_id === targetThreadId) || null;
      const currentActive = (currentConv?.state || "active") === "active";
      if (!currentActive) {
        const peerId = currentConv?.peer_id || null;
        const activeConv = peerId
          ? conversations.find(
              c => c.peer_id === peerId && (c.state || "active") === "active"
            )
          : undefined;
        if (!activeConv?.conversation_id) {
          throw new Error("对方尚未建立好友关系，请重新添加好友。");
        }
        targetConversationId = activeConv.conversation_id;
      }
      await post(
        `/api/v1/chat/conversations/${encodeURIComponent(
          targetConversationId
        )}/messages`,
        { text: body }
      );
      const [list, convs] = await Promise.all([
        get<DirectMessage[]>(
          `/api/v1/chat/conversations/${encodeURIComponent(
            targetConversationId
          )}/messages`
        ),
        get<ConversationRaw[]>("/api/v1/chat/conversations")
      ]);
      if (
        selectedThreadKind === "direct" &&
        selectedThreadId === targetConversationId
      ) {
        setMessages(Array.isArray(list) ? list : []);
      }
      setConversations(
        withOptimisticConversationPreview(
          Array.isArray(convs) ? convs : [],
          targetConversationId,
          body
        )
      );
      markThreadAsRead("direct", targetConversationId);
    },
    [
      meshGroups,
      conversations,
      selectedThreadKind,
      selectedThreadId,
      loadThreadMessages,
      markThreadAsRead,
      setMessages,
      setGroups,
      setConversations
    ]
  );

  const postFileToTargetThread = useCallback(
    async (targetKind: ThreadKind, targetThreadId: string, file: File) => {
      if (targetKind === "meshserver_group") {
        if (!isImageMime(file.type)) {
          throw new Error("Mesh 频道仅支持图片文件");
        }
        const thread = meshGroups.find(t => t.threadId === targetThreadId) || null;
        const connectionName = thread?.connectionName;
        if (!thread || !connectionName) {
          throw new Error("未找到 meshserver 频道上下文");
        }
        const form = new FormData();
        form.append("image", file);
        const url = `/api/v1/meshserver/channels/${encodeURIComponent(
          targetThreadId
        )}/messages/image?connection=${encodeURIComponent(connectionName)}`;
        const resp = await fetch(api(url), { method: "POST", body: form });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error((data as any).error || resp.statusText);
        if (
          selectedThreadKind === "meshserver_group" &&
          selectedThreadId === targetThreadId
        ) {
          await loadThreadMessages("meshserver_group", targetThreadId);
        }
        markThreadAsRead("meshserver_group", targetThreadId);
        return;
      }
      if (targetKind === "group") {
        const form = new FormData();
        form.append("file", file);
        const resp = await fetch(
          api(`/api/v1/groups/${encodeURIComponent(targetThreadId)}/files`),
          { method: "POST", body: form }
        );
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error((data as any).error || resp.statusText);
        if (selectedThreadKind === "group" && selectedThreadId === targetThreadId) {
          const list = await get<GroupMessage[]>(
            `/api/v1/groups/${encodeURIComponent(targetThreadId)}/messages`
          );
          setMessages(Array.isArray(list) ? list : []);
        }
        const grps = await get<GroupRaw[]>("/api/v1/groups");
        setGroups(
          withOptimisticGroupPreview(
            Array.isArray(grps) ? grps : [],
            targetThreadId,
            `[文件] ${file.name}`
          )
        );
        markThreadAsRead("group", targetThreadId);
        return;
      }
      let targetConversationId = targetThreadId;
      const currentConv =
        conversations.find(c => c.conversation_id === targetThreadId) || null;
      const currentActive = (currentConv?.state || "active") === "active";
      if (!currentActive) {
        const peerId = currentConv?.peer_id || null;
        const activeConv = peerId
          ? conversations.find(
              c => c.peer_id === peerId && (c.state || "active") === "active"
            )
          : undefined;
        if (!activeConv?.conversation_id) {
          throw new Error("对方尚未建立好友关系，请重新添加好友。");
        }
        targetConversationId = activeConv.conversation_id;
      }
      const form = new FormData();
      form.append("file", file);
      const resp = await fetch(
        api(
          `/api/v1/chat/conversations/${encodeURIComponent(
            targetConversationId
          )}/files`
        ),
        { method: "POST", body: form }
      );
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error((data as any).error || resp.statusText);
      if (selectedThreadKind === "direct" && selectedThreadId === targetConversationId) {
        const list = await get<DirectMessage[]>(
          `/api/v1/chat/conversations/${encodeURIComponent(
            targetConversationId
          )}/messages`
        );
        setMessages(Array.isArray(list) ? list : []);
      }
      const convs = await get<ConversationRaw[]>("/api/v1/chat/conversations");
      setConversations(
        withOptimisticConversationPreview(
          Array.isArray(convs) ? convs : [],
          targetConversationId,
          `[文件] ${file.name}`
        )
      );
      markThreadAsRead("direct", targetConversationId);
    },
    [
      meshGroups,
      conversations,
      selectedThreadKind,
      selectedThreadId,
      loadThreadMessages,
      markThreadAsRead,
      setMessages,
      setGroups,
      setConversations
    ]
  );

  const forwardDraftToTargets = useCallback(
    async (targets: ChatThreadListItem[], draft: ForwardDraft) => {
      if (targets.length === 0) return;
      setForwardBusy(true);
      try {
        if (draft.kind === "text") {
          const body = draft.text.trim();
          if (!body) return;
          let ok = 0;
          const failures: string[] = [];
          for (const t of targets) {
            try {
              await forwardTextToThreadOnce(t.kind, t.id, body);
              ok++;
            } catch (err: any) {
              console.error("转发失败:", err);
              failures.push(`「${t.title}」: ${err?.message || String(err)}`);
            }
          }
          if (failures.length === 0) {
            alert(ok <= 1 ? "已转发" : `已转发到 ${ok} 个会话`);
          } else if (ok > 0) {
            alert(
              `已成功 ${ok} 个；失败 ${failures.length} 个：\n${failures
                .slice(0, 6)
                .join("\n")}${failures.length > 6 ? "\n…" : ""}`
            );
          } else {
            alert(
              `转发失败：\n${failures.slice(0, 6).join("\n")}${failures.length > 6 ? "\n…" : ""}`
            );
          }
          return;
        }

        const r = await fetch(draft.url, { credentials: "include" });
        if (!r.ok) throw new Error(`下载原文件失败 (${r.status})`);
        const blob = await r.blob();
        const name = draft.fileName.trim() || "file";
        const mime = draft.mimeType.trim() || blob.type || "application/octet-stream";
        const file = new File([blob], name, { type: mime });

        let ok = 0;
        const failures: string[] = [];
        for (const t of targets) {
          try {
            await postFileToTargetThread(t.kind, t.id, file);
            ok++;
          } catch (err: any) {
            console.error("转发文件失败:", err);
            failures.push(`「${t.title}」: ${err?.message || String(err)}`);
          }
        }
        if (failures.length === 0) {
          alert(ok <= 1 ? "已转发" : `已转发到 ${ok} 个会话`);
        } else if (ok > 0) {
          alert(
            `已成功 ${ok} 个；失败 ${failures.length} 个：\n${failures
              .slice(0, 6)
              .join("\n")}${failures.length > 6 ? "\n…" : ""}`
          );
        } else {
          alert(
            `转发失败：\n${failures.slice(0, 6).join("\n")}${failures.length > 6 ? "\n…" : ""}`
          );
        }
      } catch (err: any) {
        console.error("转发失败:", err);
        alert("转发失败：" + (err?.message || String(err)));
      } finally {
        setForwardBusy(false);
      }
    },
    [forwardTextToThreadOnce, postFileToTargetThread]
  );

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
        markThreadAsRead("meshserver_group", selectedThreadId);
        return;
      }

      const form = new FormData();
      form.append("file", file);
      let targetConversationId = selectedThreadId;
      if (selectedThreadKind !== "group") {
        const currentConv =
          conversations.find(c => c.conversation_id === selectedThreadId) || null;
        const currentActive = (currentConv?.state || "active") === "active";
        if (!currentActive) {
          const peerId = currentConv?.peer_id || selectedContactId || null;
          const activeConv = peerId
            ? conversations.find(
                c => c.peer_id === peerId && (c.state || "active") === "active"
              )
            : undefined;
          if (!activeConv?.conversation_id) {
            alert("对方尚未建立好友关系，请重新添加好友。");
            return;
          }
          targetConversationId = activeConv.conversation_id;
          setSelectedThreadId(targetConversationId);
          setSelectedThreadKind("direct");
        }
      }

      const path =
        selectedThreadKind === "group"
          ? `/api/v1/groups/${encodeURIComponent(selectedThreadId)}/files`
          : `/api/v1/chat/conversations/${encodeURIComponent(
              targetConversationId
            )}/files`;

      const resp = await fetch(api(path), { method: "POST", body: form });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error((data as any).error || resp.statusText);

      setFileSending(null);
      await loadThreadMessages(
        selectedThreadKind,
        selectedThreadKind === "group" ? selectedThreadId : targetConversationId
      );
      if (selectedThreadKind === "group") {
        const grps = await get<GroupRaw[]>("/api/v1/groups");
        const normalized = normalizeEntityList<GroupRaw>(grps, ["groups"]);
        setGroups(
          withOptimisticGroupPreview(
            normalized,
            selectedThreadId,
            `[文件] ${file.name}`
          )
        );
      } else {
        const convs = await get<ConversationRaw[]>(
          "/api/v1/chat/conversations"
        );
        const normalized = normalizeEntityList<ConversationRaw>(convs, [
          "conversations"
        ]);
        setConversations(
          withOptimisticConversationPreview(
            normalized,
            targetConversationId,
            `[文件] ${file.name}`
          )
        );
        markThreadAsRead("direct", targetConversationId);
      }
      if (selectedThreadKind === "group") {
        markThreadAsRead("group", selectedThreadId);
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

  const closeListItemMenu = React.useCallback(() => setListItemMenu(null), []);

  useEffect(() => {
    if (!listItemMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeListItemMenu();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [listItemMenu, closeListItemMenu]);

  useEffect(() => {
    if (!plusMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPlusMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [plusMenuOpen]);

  const openMsgMenuAt = React.useCallback(
    (
      x: number,
      y: number,
      kind: ThreadKind,
      threadId: string,
      msgId: string,
      forwardText: string,
      canRevoke: boolean,
      forwardFile?: ForwardFilePayload
    ) => {
      const pad = 8;
      const w = 180;
      const row = 44;
      const gap = 6;
      let h = 12 + row;
      if (forwardText.trim() || forwardFile) {
        h += row + gap;
        h += row + gap;
      }
      if (canRevoke) h += row + gap;
      const maxX = Math.max(pad, window.innerWidth - w - pad);
      const maxY = Math.max(pad, window.innerHeight - h - pad);
      setMsgMenu({
        x: Math.min(Math.max(pad, x), maxX),
        y: Math.min(Math.max(pad, y), maxY),
        kind,
        threadId,
        msgId,
        forwardText,
        canRevoke,
        forwardFile
      });
    },
    []
  );

  const createLongPressHandlers = React.useCallback(
    (
      kind: ThreadKind,
      threadId: string,
      msgId: string,
      opts: { canRevoke: boolean; forwardText: string; forwardFile?: ForwardFilePayload }
    ): {
      onPointerDown: React.PointerEventHandler;
      onPointerUp: React.PointerEventHandler;
      onPointerCancel: React.PointerEventHandler;
      onPointerMove: React.PointerEventHandler;
      onContextMenu: React.MouseEventHandler;
    } => {
      const { canRevoke, forwardText, forwardFile } = opts;
      const allowMenu =
        canRevoke || forwardText.trim().length > 0 || !!forwardFile;
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
          if (!allowMenu) return;
          if (e.pointerType === "mouse") return; // 滑鼠用右键
          startX = e.clientX;
          startY = e.clientY;
          clear();
          timer = window.setTimeout(() => {
            openMsgMenuAt(
              e.clientX,
              e.clientY,
              kind,
              threadId,
              msgId,
              forwardText,
              canRevoke,
              forwardFile
            );
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
          if (!allowMenu) return;
          e.preventDefault();
          openMsgMenuAt(
            e.clientX,
            e.clientY,
            kind,
            threadId,
            msgId,
            forwardText,
            canRevoke,
            forwardFile
          );
        }
      };
    },
    [openMsgMenuAt]
  );

  const openListItemMenuAt = React.useCallback(
    (
      x: number,
      y: number,
      kind: "contact" | "conversation",
      id: string,
      title: string
    ) => {
      const pad = 8;
      const w = 200;
      const h = 96;
      const maxX = Math.max(pad, window.innerWidth - w - pad);
      const maxY = Math.max(pad, window.innerHeight - h - pad);
      setListItemMenu({
        x: Math.min(Math.max(pad, x), maxX),
        y: Math.min(Math.max(pad, y), maxY),
        kind,
        id,
        title
      });
    },
    []
  );

  const handlePasteMaybeSendFile = async (e: React.ClipboardEvent) => {
    const dt = e.clipboardData;
    if (!dt?.items?.length) return;
    const fileItem = Array.from(dt.items).find(it => it.kind === "file");
    if (!fileItem) return;
    const blob = fileItem.getAsFile();
    if (!blob) return;
    if (selectedThreadKind === "meshserver_group" && !isImageMime(blob.type)) {
      alert("Mesh 频道仅支持粘贴图片");
      return;
    }
    e.preventDefault();
    const name =
      blob.name?.trim() ||
      (isImageMime(blob.type)
        ? `pasted-image-${Date.now()}.png`
        : `pasted-file-${Date.now()}`);
    const file = new File([blob], name, {
      type: blob.type || "application/octet-stream"
    });
    await sendFileForCurrentThread(file);
  };

  const loadPeerStatus = async (peerId: string) => {
    const id = peerId.trim();
    if (!id) return;
    try {
      const status = await get<any>(
        `/api/v1/chat/peers/${encodeURIComponent(id)}/status`
      );
      setPeerStatusMap(prev => {
        const next = new Map(prev);
        next.set(id, status);
        return next;
      });
    } catch {
      // 忽略错误，维持旧状态
    }
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
    const resp = await get<unknown>(
      `/api/v1/meshserver/spaces?connection=${encodeURIComponent(connectionName)}`
    ).catch(() => ({}));
    setMeshServers(normalizeMeshSpacesFromResponse(resp));
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
    // 新接口：连接成功后读取 server 级权限，判断是否允许创建 space。
    const permsResp = await get<any>(
      `/api/v1/meshserver/server/my_permissions?connection=${encodeURIComponent(connectionName)}`
    ).catch(() => null);

    const fromServerPerms = Boolean(
      permsResp?.can_create_space ??
        permsResp?.canCreateSpace ??
        permsResp?.permissions?.can_create_space ??
        permsResp?.permissions?.canCreateSpace
    );

    if (fromServerPerms) {
      setMeshCanCreateSpace(true);
      return;
    }

    // 兼容旧版后端：fallback 到 my_servers 的权限字段解析。
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
      markThreadAsRead("meshserver_group", channelId);
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

  const openGroupThread = async (groupId: string) => {
    setSelectedThreadId(groupId);
    setSelectedThreadKind("group");
    markThreadAsRead("group", groupId);
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

  const handleDeleteContact = async (peerId: string, title: string) => {
    const label = title.trim() || shortPeer(peerId);
    if (
      !window.confirm(
        `确定删除联系人「${label}」？删除后将从联系人列表移除，并移除与该好友的私聊会话。`
      )
    )
      return;
    try {
      await deleteChatResource(`/api/v1/chat/contacts/${encodeURIComponent(peerId)}`);
    } catch (err: any) {
      console.error("删除联系人失败:", err);
      alert("删除联系人失败：" + (err?.message || String(err)));
      return;
    }
    setConversations(prev => {
      const conv = prev.find(c => c.peer_id === peerId);
      const convId = conv?.conversation_id;
      const sel = selectedThreadRef.current;
      if (convId && sel.kind === "direct" && sel.id === convId) {
        setSelectedThreadId(null);
        if (isMobileRef.current) setMobileView("list");
      }
      return prev.filter(c => c.peer_id !== peerId);
    });
    setContactsRaw(prev => prev.filter(c => c.peer_id !== peerId));
    setSelectedContactId(prev => {
      if (prev === peerId && isMobileRef.current) setContactsMobileView("list");
      return prev === peerId ? null : prev;
    });
  };

  const handleDeleteConversation = async (conversationId: string, title: string) => {
    const label = title.trim() || "该会话";
    if (!window.confirm(`确定删除私聊会话「${label}」？`)) return;
    try {
      await deleteChatResource(
        `/api/v1/chat/conversations/${encodeURIComponent(conversationId)}`
      );
    } catch (err: any) {
      console.error("删除会话失败:", err);
      alert("删除会话失败：" + (err?.message || String(err)));
      return;
    }
    setConversations(prev => prev.filter(c => c.conversation_id !== conversationId));
    const sel = selectedThreadRef.current;
    if (sel.kind === "direct" && sel.id === conversationId) {
      setSelectedThreadId(null);
      if (isMobileRef.current) setMobileView("list");
    }
  };

  const handleStartChatFromContact = async (peerId: string) => {
    const existing = conversations.find(
      c => c.peer_id === peerId && (c.state || "active") === "active"
    );
    if (existing) {
      setSelectedThreadId(existing.conversation_id);
      setSelectedThreadKind("direct");
      markThreadAsRead("direct", existing.conversation_id);
      setActiveTab("chat");
      return;
    }
    try {
      await post(`/api/v1/chat/peers/${encodeURIComponent(peerId)}/connect`);
    } catch (err) {
      console.warn("connect 失败，可忽略:", err);
    }
    // 主动发起连接后顺便拉一次状态
    loadPeerStatus(peerId);
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
          ? nextConvs.find(
              c => c.peer_id === peerId && (c.state || "active") === "active"
            )
          : undefined;
        if (existing?.conversation_id) {
          setSelectedThreadId(existing.conversation_id);
          setSelectedThreadKind("direct");
          markThreadAsRead("direct", existing.conversation_id);
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
      const nick = meNicknameDraft.trim();
      const updated = await post<any>("/api/v1/chat/profile", {
        nickname: nick,
        remote_nickname: nick,
        bio: meBioDraft.trim()
      });
      const nextMe = normalizeChatMe(updated, me?.peer_id);
      if (nextMe) {
        setMe(prev => ({ ...(prev || nextMe), ...nextMe }));
        setMeNicknameDraft(nextMe.nickname ?? meNicknameDraft.trim());
        setMeBioDraft(nextMe.bio ?? meBioDraft.trim());
      } else {
        setMeNicknameDraft(meNicknameDraft.trim());
        setMeBioDraft(meBioDraft.trim());
      }
      alert("已更新我的名片");
    } catch (err: any) {
      console.error("保存名片失败:", err);
      alert("保存名片失败：" + (err?.message || String(err)));
    }
  };

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
      {isMobile &&
      activeTab === "chat" &&
      mobileView === "chat" &&
      selectedThreadKind !== "direct" ? (
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
        {activeTab === "chat" && (
          <ChatTab
            threads={threadsWithUnread}
            selectedThreadId={selectedThreadId}
            selectedThreadKind={selectedThreadKind}
            setSelectedThreadId={setSelectedThreadId}
            setSelectedThreadKind={setSelectedThreadKind}
            contactAvatarMap={contactAvatarMap}
            resolveAvatarSrc={resolveAvatarSrc}
            openListItemMenuAt={openListItemMenuAt}
            loadPeerStatus={loadPeerStatus}
            isMobile={isMobile}
            mobileView={mobileView}
            setMobileView={setMobileView}
            selectedThread={selectedThread}
            selectedThreadAvatarUrl={selectedThreadAvatarUrl}
            handlePasteMaybeSendFile={handlePasteMaybeSendFile}
            setSelectedContactId={setSelectedContactId}
            setContactsMobileView={setContactsMobileView}
            setActiveTab={setActiveTab}
            openGroupProfile={openGroupProfile}
            peerStatusMap={peerStatusMap}
            openRetentionModal={openRetentionModal}
            selectedConversation={selectedConversation}
            selectedGroup={selectedGroup}
            localGroupRole={localGroupRole}
            openGroupRetentionModal={openGroupRetentionModal}
            fileSending={fileSending}
            messagesLoading={messagesLoading}
            messages={messages}
            meshGroups={meshGroups}
            me={me}
            contactsRaw={contactsRaw}
            createLongPressHandlers={createLongPressHandlers}
            canRevokeGroupMessage={canRevokeGroupMessage}
            sending={sending}
            handleSendMessage={handleSendMessage}
            sendFileForCurrentThread={sendFileForCurrentThread}
            openGroupThread={openGroupThread}
            joinGroup={joinGroup}
            markThreadAsRead={markThreadAsRead}
          />
        )}
        {activeTab === "contacts" && (
          <ContactsTab
            myPeerId={(me?.peer_id || "").trim()}
            requestsRaw={requestsRaw}
            contacts={contacts}
            selectedContactId={selectedContactId}
            setSelectedContactId={setSelectedContactId}
            isMobile={isMobile}
            contactsMobileView={contactsMobileView}
            setContactsMobileView={setContactsMobileView}
            resolveAvatarSrc={resolveAvatarSrc}
            actionBusy={actionBusy}
            onAcceptRequest={handleAcceptFriendRequest}
            onRejectRequest={handleRejectFriendRequest}
            openListItemMenuAt={openListItemMenuAt}
            selectedContact={selectedContact}
            contactRemarkDraft={contactRemarkDraft}
            setContactRemarkDraft={setContactRemarkDraft}
            contactRemarkSaving={contactRemarkSaving}
            onSaveContactRemark={handleSaveContactRemark}
            onToggleBlockContact={handleToggleBlockContact}
            onStartChatFromContact={handleStartChatFromContact}
          />
        )}
        {activeTab === "me" && (
          <MeTab
            me={me}
            meNicknameDraft={meNicknameDraft}
            setMeNicknameDraft={setMeNicknameDraft}
            meBioDraft={meBioDraft}
            setMeBioDraft={setMeBioDraft}
            resolveAvatarSrc={resolveAvatarSrc}
            onSaveProfile={handleSaveMyProfile}
          />
        )}
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

      <MessageContextMenu
        menu={msgMenu}
        onClose={closeMsgMenu}
        onForward={({ text, file }) => {
          if (file) {
            setForwardDraft({ kind: "file", ...file });
          } else {
            setForwardDraft({ kind: "text", text });
          }
        }}
        onRevoke={async (kind, threadId, msgId) => {
          if (kind === "group") await revokeGroupMessage(threadId, msgId);
          else await revokeDirectMessage(threadId, msgId);
        }}
      />
      <ForwardMessageModal
        open={forwardDraft != null}
        onClose={() => setForwardDraft(null)}
        threads={threadsWithUnread}
        busy={forwardBusy}
        onConfirm={async picked => {
          if (forwardDraft == null || picked.length === 0) return;
          await forwardDraftToTargets(picked, forwardDraft);
          setForwardDraft(null);
        }}
      />
      <ListItemContextMenu
        menu={listItemMenu}
        onClose={closeListItemMenu}
        onDelete={(kind, id, title) => {
          if (kind === "contact") void handleDeleteContact(id, title);
          else void handleDeleteConversation(id, title);
        }}
      />
      <PlusMenu
        open={plusMenuOpen}
        onClose={() => setPlusMenuOpen(false)}
        onAddFriend={() => setAddFriendOpen(true)}
        onCreateGroup={() => setCreateGroupOpen(true)}
        onMeshJoin={openMeshJoin}
      />
      <AddFriendModal
        open={addFriendOpen}
        onClose={() => setAddFriendOpen(false)}
        peerId={addFriendPeerId}
        onPeerIdChange={setAddFriendPeerId}
        intro={addFriendIntro}
        onIntroChange={setAddFriendIntro}
        actionBusy={actionBusy}
        onSendRequest={sendChatRequest}
      />
      <CreateGroupModal
        open={createGroupOpen}
        onClose={() => {
          setCreateGroupOpen(false);
          setCreateGroupMemberQuery("");
        }}
        groupTitle={createGroupTitle}
        onGroupTitleChange={setCreateGroupTitle}
        memberQuery={createGroupMemberQuery}
        onMemberQueryChange={setCreateGroupMemberQuery}
        memberIds={createGroupMemberIds}
        setMemberIds={setCreateGroupMemberIds}
        contacts={contacts}
        actionBusy={actionBusy}
        onCreateGroup={createGroup}
        resolveAvatarSrc={resolveAvatarSrc}
      />
      <MeshJoinModal
        open={meshJoinOpen}
        onClose={() => setMeshJoinOpen(false)}
        meshJoinStep={meshJoinStep}
        setMeshJoinStep={setMeshJoinStep}
        meshPeerIdDraft={meshPeerIdDraft}
        setMeshPeerIdDraft={setMeshPeerIdDraft}
        actionBusy={actionBusy}
        setActionBusy={setActionBusy}
        meshConnection={meshConnection}
        setMeshConnection={setMeshConnection}
        meshCanCreateSpace={meshCanCreateSpace}
        meshCreateSpaceName={meshCreateSpaceName}
        setMeshCreateSpaceName={setMeshCreateSpaceName}
        meshCreateSpaceDesc={meshCreateSpaceDesc}
        setMeshCreateSpaceDesc={setMeshCreateSpaceDesc}
        meshCreateSpaceVisibility={meshCreateSpaceVisibility}
        setMeshCreateSpaceVisibility={setMeshCreateSpaceVisibility}
        meshServers={meshServers}
        meshSelectedSpaceId={meshSelectedSpaceId}
        setMeshSelectedSpaceId={setMeshSelectedSpaceId}
        meshChannels={meshChannels}
        meshMyPermissions={meshMyPermissions}
        meshCreateChannelType={meshCreateChannelType}
        setMeshCreateChannelType={setMeshCreateChannelType}
        meshCreateChannelName={meshCreateChannelName}
        setMeshCreateChannelName={setMeshCreateChannelName}
        meshCreateChannelDesc={meshCreateChannelDesc}
        setMeshCreateChannelDesc={setMeshCreateChannelDesc}
        meshCreateChannelVisibility={meshCreateChannelVisibility}
        setMeshCreateChannelVisibility={setMeshCreateChannelVisibility}
        meshCreateChannelSlowModeSeconds={meshCreateChannelSlowModeSeconds}
        setMeshCreateChannelSlowModeSeconds={setMeshCreateChannelSlowModeSeconds}
        connectMeshserver={connectMeshserver}
        loadSpaces={loadSpaces}
        loadMeshCanCreateSpace={loadMeshCanCreateSpace}
        createMeshSpaceAndMaybeSelect={createMeshSpaceAndMaybeSelect}
        loadMeshChannels={loadMeshChannels}
        loadMeshMyPermissions={loadMeshMyPermissions}
        joinMeshChannel={joinMeshChannel}
        createMeshChannelAndMaybeJoin={createMeshChannelAndMaybeJoin}
        resolveAvatarSrc={resolveAvatarSrc}
      />
      <RetentionModal
        open={retentionModalOpen}
        onClose={() => setRetentionModalOpen(false)}
        retentionUnit={retentionUnit}
        setRetentionUnit={setRetentionUnit}
        retentionValue={retentionValue}
        setRetentionValue={setRetentionValue}
        retentionSaving={retentionSaving}
        onSave={saveRetention}
      />
      <GroupProfileModal
        open={groupProfileOpen}
        isMobile={isMobile}
        onClose={() => {
          setGroupProfileOpen(false);
          setGroupInviteQuery("");
          setGroupInviteIds(new Set());
          setGroupDissolveReason("");
        }}
        selectedThreadKind={selectedThreadKind}
        selectedThreadId={selectedThreadId}
        groupTitleDraft={groupTitleDraft}
        onGroupTitleDraftChange={setGroupTitleDraft}
        localGroupRole={localGroupRole}
        groupInviteQuery={groupInviteQuery}
        onGroupInviteQueryChange={setGroupInviteQuery}
        groupInviteIds={groupInviteIds}
        setGroupInviteIds={setGroupInviteIds}
        contacts={contacts}
        groupDissolveReason={groupDissolveReason}
        onGroupDissolveReasonChange={setGroupDissolveReason}
        actionBusy={actionBusy}
        onUpdateGroupTitle={handleUpdateGroupTitle}
        onInviteGroupMembers={handleInviteGroupMembers}
        onDissolveGroup={handleDissolveGroup}
        resolveAvatarSrc={resolveAvatarSrc}
      />
    </div>
  );
};

export default App;
