import React from "react";
import {
  MainContainer,
  Sidebar,
  MessageInput
} from "@chatscope/chat-ui-kit-react";
import type {
  ThreadKind,
  Me,
  ContactRaw,
  ConversationRaw,
  GroupRaw,
  MeshserverGroupThread,
  MeshserverSyncMessage,
  DirectMessage,
  GroupMessage
} from "../../types";
import { FallbackAvatar, textAvatarLetter } from "../../components/FallbackAvatar";
import { createListRowMenuHandlers } from "../../hooks/createListRowMenuHandlers";
import {
  shortPeer,
  formatTime,
  formatTimeFromMs,
  deliveryStatusText,
  displayName,
  safeJsonParse,
  isImageMime,
  isVideoMime,
  extractMeshserverImageSrc,
  looksLikeImageSrc
} from "../../utils";
import { directFileUrl, groupFileUrl } from "../../api";

/** 會話列表：最後一則訊息預覽（過長取開頭一段並加省略號） */
function threadLastMessagePreview(text: string | undefined, maxChars = 36): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (t.length <= maxChars) return t;
  return t.slice(0, maxChars) + "…";
}

export interface ChatThreadListItem {
  id: string;
  kind: ThreadKind;
  title: string;
  subtitle?: string;
  lastMessage?: string;
  lastTime?: string;
  /** 客戶端未讀條數（非當前會話時遞增） */
  unreadCount?: number;
  peerId?: string;
  avatarUrl?: string;
  connectionName?: string;
  myUserId?: string;
}

export interface ChatTabProps {
  threads: ChatThreadListItem[];
  selectedThreadId: string | null;
  selectedThreadKind: ThreadKind;
  setSelectedThreadId: (id: string | null) => void;
  setSelectedThreadKind: (k: ThreadKind) => void;
  contactAvatarMap: Map<string, string>;
  resolveAvatarSrc: (src?: string) => string | undefined;
  openListItemMenuAt: (
    x: number,
    y: number,
    kind: "contact" | "conversation",
    id: string,
    title: string
  ) => void;
  loadPeerStatus: (peerId: string) => void;
  isMobile: boolean;
  mobileView: "list" | "chat";
  setMobileView: (v: "list" | "chat") => void;
  selectedThread: ChatThreadListItem | null;
  selectedThreadAvatarUrl: string | undefined;
  handlePasteMaybeSendImage: (e: React.ClipboardEvent) => void;
  setSelectedContactId: (id: string | null) => void;
  setContactsMobileView: (v: "list" | "detail") => void;
  setActiveTab: (tab: "chat" | "contacts" | "me") => void;
  openGroupProfile: (groupId: string) => void;
  peerStatusMap: Map<string, any>;
  openRetentionModal: () => void;
  selectedConversation: ConversationRaw | null;
  selectedGroup: GroupRaw | null;
  localGroupRole: string | undefined;
  openGroupRetentionModal: () => void;
  fileSending: null | { text: string; error?: boolean };
  messagesLoading: boolean;
  messages: Array<DirectMessage | GroupMessage | MeshserverSyncMessage>;
  meshGroups: MeshserverGroupThread[];
  me: Me | null;
  contactsRaw: ContactRaw[];
  createLongPressHandlers: (
    kind: ThreadKind,
    threadId: string,
    msgId: string,
    enabled: boolean
  ) => {
    onPointerDown: React.PointerEventHandler;
    onPointerUp: React.PointerEventHandler;
    onPointerCancel: React.PointerEventHandler;
    onPointerMove: React.PointerEventHandler;
    onContextMenu: React.MouseEventHandler;
  };
  canRevokeGroupMessage: (senderPeerId: string) => boolean;
  sending: boolean;
  handleSendMessage: (text: string) => void | Promise<void>;
  sendFileForCurrentThread: (file: File) => Promise<void>;
  openGroupThread: (groupId: string) => void;
  joinGroup: (groupId: string) => void;
  /** 標記會話已讀（清除側欄未讀角標） */
  markThreadAsRead: (kind: ThreadKind, threadId: string) => void;
}

export function ChatTab(props: ChatTabProps) {
  const {
    threads,
    selectedThreadId,
    selectedThreadKind,
    setSelectedThreadId,
    setSelectedThreadKind,
    contactAvatarMap,
    resolveAvatarSrc,
    openListItemMenuAt,
    loadPeerStatus,
    isMobile,
    mobileView,
    setMobileView,
    selectedThread,
    selectedThreadAvatarUrl,
    handlePasteMaybeSendImage,
    setSelectedContactId,
    setContactsMobileView,
    setActiveTab,
    openGroupProfile,
    peerStatusMap,
    openRetentionModal,
    selectedConversation,
    selectedGroup,
    localGroupRole,
    openGroupRetentionModal,
    fileSending,
    messagesLoading,
    messages,
    meshGroups,
    me,
    contactsRaw,
    createLongPressHandlers,
    canRevokeGroupMessage,
    sending,
    handleSendMessage,
    sendFileForCurrentThread,
    openGroupThread,
    joinGroup,
    markThreadAsRead
  } = props;

  return (
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
                const directRowMenuHandlers =
                  thread.kind === "direct"
                    ? createListRowMenuHandlers((cx, cy) =>
                        openListItemMenuAt(
                          cx,
                          cy,
                          "conversation",
                          thread.id,
                          thread.title
                        )
                      )
                    : null;
                return (
                  <div
                    key={`${thread.kind}:${thread.id}`}
                    {...(directRowMenuHandlers || {})}
                    onClick={() => {
                      setSelectedThreadId(thread.id);
                      setSelectedThreadKind(thread.kind);
                      markThreadAsRead(thread.kind, thread.id);
                      setMobileView(isMobile ? "chat" : mobileView);
                      // 訊息由 useThreadMessagesLoader 在 selectedThreadId/kind 變更時載入，避免重複 GET
                      if (thread.kind === "direct") {
                        const peerId = (thread as any).peerId as string | undefined;
                        if (peerId) loadPeerStatus(peerId);
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
                          gap: 8,
                          minWidth: 0
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            minWidth: 0,
                            flex: 1
                          }}
                        >
                          <div
                            style={{
                              fontWeight: 600,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              flex: 1,
                              minWidth: 0
                            }}
                            title={thread.title}
                          >
                            {thread.title}
                          </div>
                          {(thread.unreadCount ?? 0) > 0 ? (
                            <span
                              title={`未读 ${thread.unreadCount}`}
                              style={{
                                minWidth: 18,
                                height: 18,
                                padding: "0 5px",
                                borderRadius: 9,
                                background: "#f85149",
                                color: "#fff",
                                fontSize: 11,
                                fontWeight: 700,
                                lineHeight: "18px",
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0
                              }}
                            >
                              {(thread.unreadCount ?? 0) > 99
                                ? "99+"
                                : thread.unreadCount}
                            </span>
                          ) : null}
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.7, flexShrink: 0 }}>
                          {thread.lastTime}
                        </div>
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          opacity: 0.75,
                          marginTop: 2,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }}
                        title={thread.subtitle || ""}
                      >
                        {thread.subtitle?.trim() ? thread.subtitle : "\u00a0"}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          opacity: 0.72,
                          marginTop: 2,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }}
                        title={thread.lastMessage?.trim() || ""}
                      >
                        {(() => {
                          const preview = threadLastMessagePreview(thread.lastMessage);
                          return preview ? (
                            preview
                          ) : (
                            <span style={{ opacity: 0.45 }}>暂无消息</span>
                          );
                        })()}
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
                      <>
                        <div style={{ marginBottom: 4 }}>
                          {(() => {
                            const peerId = (selectedThread as any).peerId as
                              | string
                              | undefined;
                            const status = peerId
                              ? peerStatusMap.get(peerId) || null
                              : null;
                            const connLabel = (() => {
                              // backend /api/v1/chat/peers/:id/status：`connectedness`（libp2p）
                              const s = (
                                status?.connectedness ||
                                status?.state ||
                                status?.status ||
                                ""
                              ).toString().toLowerCase();
                              if (!s) return "未知";
                              if (s.includes("notconnected")) return "未连接";
                              if (s.includes("direct_ok")) return "直连可用";
                              if (s.includes("connected")) return "已连接";
                              if (s.includes("relay")) return "中继链路";
                              if (s.includes("offline")) return "离线";
                              return s;
                            })();
                            /** 會話級別：最後一次訊息走直連還是中繼（與 connectedness 不同維度） */
                            const transportLabel = (() => {
                              const m = selectedConversation?.last_transport_mode?.trim();
                              if (!m) return null;
                              const t = m.toLowerCase();
                              if (t === "direct") return "直连";
                              if (t === "relay") return "中继";
                              return m;
                            })();
                            return (
                              <>
                                连接：{connLabel}
                                {transportLabel != null && transportLabel !== "" ? (
                                  <> · 传输：{transportLabel}</>
                                ) : null}
                              </>
                            );
                          })()}
                        </div>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => openRetentionModal()}
                          onKeyDown={e => {
                            if (e.key === "Enter" || e.key === " ") openRetentionModal();
                          }}
                          style={{ cursor: "pointer" }}
                        >
                          自动删除：
                          {selectedConversation?.retention_minutes
                            ? `${selectedConversation.retention_minutes} 分钟`
                            : "关闭"}
                        </div>
                      </>
                    ) : selectedThreadKind === "group" ? (
                      <div
                        role={localGroupRole === "admin" ? "button" : undefined}
                        tabIndex={localGroupRole === "admin" ? 0 : undefined}
                        onClick={() => {
                          if (localGroupRole === "admin") openGroupRetentionModal();
                        }}
                        onKeyDown={e => {
                          if (
                            localGroupRole === "admin" &&
                            (e.key === "Enter" || e.key === " ")
                          ) {
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
                    const caption = m.content?.text || "";
                    const imageSrc = extractMeshserverImageSrc(
                      m,
                      thread?.connectionName
                    );
                    const isImage =
                      !!imageSrc || Number((m as any).message_type) === 2;
                    const showCaption =
                      !!caption && !(isImage && looksLikeImageSrc(caption));
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
                                  {showCaption ? (
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
                              ) : showCaption ? (
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
}
