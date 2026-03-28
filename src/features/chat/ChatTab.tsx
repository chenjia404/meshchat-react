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
  GroupMessage,
  PublicChannelMessage
} from "../../types";
import { FallbackAvatar, textAvatarLetter } from "../../components/FallbackAvatar";
import { ImageLightbox } from "../../components/ImageLightbox";
import { createListRowMenuHandlers } from "../../hooks/createListRowMenuHandlers";
import {
  shortPeer,
  formatTime,
  formatTimeFromMs,
  formatTimeFromUnixSec,
  deliveryStatusText,
  formatDeliverySummary,
  displayName,
  safeJsonParse,
  isImageMime,
  isVideoMime,
  isAudioMime,
  formatFileSize,
  extractMeshserverImageSrc,
  looksLikeImageSrc,
  publicChannelMediaRef,
  resolvePublicChannelAssetUrl
} from "../../utils";
import { directFileUrl, groupFileUrl } from "../../api";

/** 會話列表：最後一則訊息預覽（過長取開頭一段並加省略號） */
function threadLastMessagePreview(text: string | undefined, maxChars = 36): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (t.length <= maxChars) return t;
  return t.slice(0, maxChars) + "…";
}

/** 统一处理消息换行：兼容真实换行与被转义的 "\\n" */
function normalizeMessageMultilineText(text: string | undefined): string {
  const normalized = (text ?? "").replace(/\r\n/g, "\n");
  if (normalized.includes("\n")) return normalized;
  return normalized.replace(/\\n/g, "\n");
}

/**
 * MessageInput onSend 参数为 (innerHtml, textContent, innerText, nodes)。
 * contenteditable 下 textContent 可能丢失块级换行，发送正文应优先用 innerText。
 */
function plainTextFromMessageInput(
  _innerHtml: string,
  textContent: string,
  innerText: string
): string {
  return (innerText || textContent || "").replace(/\r\n/g, "\n");
}

function FileMessageContent(props: {
  downloadUrl: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  onImagePreview?: (src: string, alt: string) => void;
}) {
  const fileName = (props.fileName || "file").trim() || "file";
  const mimeType = (props.mimeType || "").trim();
  const sizeLabel = formatFileSize(props.fileSize);
  const meta = [mimeType, sizeLabel].filter(Boolean).join(" · ");
  const isImage = isImageMime(mimeType);
  const isVideo = isVideoMime(mimeType);
  const isAudio = isAudioMime(mimeType);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 220 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(88,166,255,0.18)",
            color: "#bfdbfe",
            fontSize: 18,
            fontWeight: 800
          }}
        >
          {isAudio ? "🎤" : "⬇"}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }}
          >
            {fileName}
          </div>
          <div
            style={{
              marginTop: 3,
              fontSize: 12,
              opacity: 0.72,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }}
          >
            {meta || "文件消息"}
          </div>
        </div>
      </div>

      {isImage ? (
        <img
          src={props.downloadUrl}
          alt={fileName}
          loading="lazy"
          role={props.onImagePreview ? "button" : undefined}
          tabIndex={props.onImagePreview ? 0 : undefined}
          onClick={e => {
            if (!props.onImagePreview) return;
            e.stopPropagation();
            props.onImagePreview(props.downloadUrl, fileName);
          }}
          onKeyDown={e => {
            if (!props.onImagePreview) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              props.onImagePreview(props.downloadUrl, fileName);
            }
          }}
          style={{
            maxWidth: "100%",
            borderRadius: 10,
            display: "block",
            maxHeight: 320,
            objectFit: "contain",
            background: "rgba(255,255,255,0.03)",
            cursor: props.onImagePreview ? "zoom-in" : "default"
          }}
        />
      ) : isVideo ? (
        <video
          src={props.downloadUrl}
          controls
          style={{
            maxWidth: "100%",
            borderRadius: 10,
            display: "block",
            maxHeight: 320,
            background: "rgba(0,0,0,0.18)"
          }}
        />
      ) : isAudio ? (
        <audio
          src={props.downloadUrl}
          controls
          controlsList="nodownload"
          preload="metadata"
          onClick={e => e.stopPropagation()}
          style={{
            width: "100%",
            maxWidth: 420,
            minHeight: 40,
            borderRadius: 10,
            display: "block"
          }}
        />
      ) : null}

      {!isAudio ? (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <a
            href={props.downloadUrl}
            download={fileName}
            style={{
              color: "#93c5fd",
              textDecoration: "none",
              fontWeight: 700,
              fontSize: 13
            }}
          >
            下载文件
          </a>
        </div>
      ) : null}
    </div>
  );
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
  /** 去中心化公开频道 owner */
  publicChannelOwnerPeerId?: string;
  isPublicChannelOwner?: boolean;
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
  handlePasteMaybeSendFile: (e: React.ClipboardEvent) => void;
  setSelectedContactId: (id: string | null) => void;
  setContactsMobileView: (v: "list" | "detail") => void;
  setActiveTab: (tab: "chat" | "contacts" | "me") => void;
  openGroupProfile: (groupId: string) => void;
  openPublicChannelProfile: (channelId: string) => void;
  peerStatusMap: Map<string, any>;
  openRetentionModal: () => void;
  selectedConversation: ConversationRaw | null;
  selectedGroup: GroupRaw | null;
  localGroupRole: string | undefined;
  openGroupRetentionModal: () => void;
  fileSending: null | { text: string; error?: boolean };
  messagesLoading: boolean;
  messages: Array<DirectMessage | GroupMessage | MeshserverSyncMessage | PublicChannelMessage>;
  meshGroups: MeshserverGroupThread[];
  me: Me | null;
  contactsRaw: ContactRaw[];
  createLongPressHandlers: (
    kind: ThreadKind,
    threadId: string,
    msgId: string,
    opts: {
      canRevoke: boolean;
      forwardText: string;
      forwardFile?: { url: string; fileName: string; mimeType: string };
      canEdit?: boolean;
      editInitialText?: string;
    }
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
  /** 從聯絡人等入口開啟聊天時寫入未讀條數，供初次捲動定位 */
  pendingScrollUnreadRef: React.MutableRefObject<number | null>;
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
    handlePasteMaybeSendFile,
    setSelectedContactId,
    setContactsMobileView,
    setActiveTab,
    openGroupProfile,
    openPublicChannelProfile,
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
    markThreadAsRead,
    pendingScrollUnreadRef
  } = props;

  const [imagePreview, setImagePreview] = React.useState<{
    src: string;
    alt: string;
  } | null>(null);

  const handleInputAreaDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleInputAreaDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (selectedThreadKind === "public_channel" && !selectedThread?.isPublicChannelOwner) {
      return;
    }
    const files = e.dataTransfer?.files;
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      if (selectedThreadKind === "meshserver_group" && !isImageMime(file.type)) {
        alert("Mesh 频道仅支持图片文件");
        continue;
      }
      void sendFileForCurrentThread(file);
    }
  };

  const messagesScrollRef = React.useRef<HTMLDivElement | null>(null);
  const initialScrollDoneKeyRef = React.useRef<string | null>(null);
  /** 会话列表每次点击 +1，用于重选同一会话时仍能重新执行「未读 / 最新」滚动 */
  const [sessionListOpenSeq, setSessionListOpenSeq] = React.useState(0);
  const [atBottom, setAtBottom] = React.useState(true);
  const prevSendingRef = React.useRef(false);
  const prevFileSendingRef = React.useRef(fileSending);
  const scrollAfterFilePendingRef = React.useRef(false);

  React.useEffect(() => {
    initialScrollDoneKeyRef.current = null;
    scrollAfterFilePendingRef.current = false;
    prevSendingRef.current = false;
    // 仅随会话切换重置；fileSending 取本次渲染值以对齐 ref
    prevFileSendingRef.current = fileSending;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 故意不在 fileSending 变化时重置，否则会打断发文件后的滚动
  }, [selectedThreadId, selectedThreadKind]);

  const handleMessagesScroll = React.useCallback(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    const threshold = 72;
    const bottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    setAtBottom(bottom);
  }, []);

  const scrollToLatest = React.useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = messagesScrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    setAtBottom(true);
  }, []);

  /** 发送文本成功后：滚到底部 */
  React.useEffect(() => {
    if (prevSendingRef.current && !sending) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollToLatest("auto");
        });
      });
    }
    prevSendingRef.current = sending;
  }, [sending, scrollToLatest]);

  /** 上传文件结束（成功清空上传提示）后：等消息列表加载完再滚到底部 */
  React.useEffect(() => {
    const prev = prevFileSendingRef.current;
    prevFileSendingRef.current = fileSending;
    if (prev && !prev.error && fileSending === null) {
      scrollAfterFilePendingRef.current = true;
    }
  }, [fileSending]);

  React.useEffect(() => {
    if (!scrollAfterFilePendingRef.current) return;
    if (messagesLoading) return;
    scrollAfterFilePendingRef.current = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollToLatest("auto");
      });
    });
  }, [messagesLoading, messages.length, scrollToLatest]);

  /** 从会话列表进入：有未读则滚到估算的第一条未读，否则滚到最新 */
  React.useEffect(() => {
    if (!selectedThreadId) return;
    if (messagesLoading) return;
    if (messages.length === 0) return;
    const key = `${selectedThreadKind}:${selectedThreadId}`;
    if (initialScrollDoneKeyRef.current === key) return;
    initialScrollDoneKeyRef.current = key;

    const unreadRaw = pendingScrollUnreadRef.current;
    pendingScrollUnreadRef.current = null;
    const unread = Math.min(
      messages.length,
      Math.max(0, unreadRaw ?? 0)
    );

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = messagesScrollRef.current;
        if (!el) return;
        if (unread > 0) {
          const firstUnreadIdx = Math.max(0, messages.length - unread);
          const anchor = el.querySelector(
            `[data-msg-idx="${firstUnreadIdx}"]`
          ) as HTMLElement | null;
          if (anchor) {
            anchor.scrollIntoView({ block: "start", behavior: "auto" });
          } else {
            el.scrollTop = el.scrollHeight;
          }
        } else {
          el.scrollTop = el.scrollHeight;
        }
        handleMessagesScroll();
      });
    });
  }, [
    selectedThreadId,
    selectedThreadKind,
    messagesLoading,
    messages.length,
    pendingScrollUnreadRef,
    handleMessagesScroll,
    sessionListOpenSeq
  ]);

  return (
    <div style={{ height: "100%", position: "relative" }}>
      <ImageLightbox
        open={imagePreview != null}
        src={imagePreview?.src ?? ""}
        alt={imagePreview?.alt}
        onClose={() => setImagePreview(null)}
      />
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
                      initialScrollDoneKeyRef.current = null;
                      pendingScrollUnreadRef.current = thread.unreadCount ?? 0;
                      setSessionListOpenSeq(s => s + 1);
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
            onPaste={handlePasteMaybeSendFile}
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
                          return;
                        }
                        if (selectedThread.kind === "public_channel") {
                          openPublicChannelProfile(selectedThread.id);
                        }
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        cursor:
                          selectedThread.kind === "direct" ||
                          selectedThread.kind === "group" ||
                          selectedThread.kind === "public_channel"
                            ? "pointer"
                            : "default"
                      }}
                      title={
                        selectedThread.kind === "direct"
                          ? "查看好友资料"
                          : selectedThread.kind === "group"
                            ? "查看群资料"
                            : selectedThread.kind === "public_channel"
                              ? "查看频道资料"
                              : ""
                      }
                      role={
                        selectedThread.kind === "direct" ||
                        selectedThread.kind === "group" ||
                        selectedThread.kind === "public_channel"
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
                          {selectedThread.kind === "public_channel"
                            ? selectedThread.isPublicChannelOwner
                              ? "公开频道 · 可发布"
                              : "公开频道 · 只读"
                            : selectedThread.kind === "group"
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
                    position: "relative",
                    display: "flex",
                    flexDirection: "column"
                  }}
                >
                <div
                  ref={messagesScrollRef}
                  onScroll={handleMessagesScroll}
                  style={{
                    flex: 1,
                    minHeight: 0,
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
                  (messages as MeshserverSyncMessage[]).map((m, idx) => {
                    const thread = meshGroups.find(
                      t => t.threadId === selectedThreadId
                    );
                    const fromMe =
                      !!thread?.myUserId && m.sender_user_id === thread.myUserId;
                    const senderName = fromMe ? "我" : m.sender_user_id || "未知";
                    const letter = textAvatarLetter(senderName);
                    const caption = normalizeMessageMultilineText(m.content?.text);
                    const imageSrc = extractMeshserverImageSrc(
                      m,
                      thread?.connectionName
                    );
                    const isImage =
                      !!imageSrc || Number((m as any).message_type) === 2;
                    const showCaption =
                      !!caption && !(isImage && looksLikeImageSrc(caption));
                    const meshForwardText = (() => {
                      if (isImage && imageSrc) {
                        return caption
                          ? `${caption}\n${imageSrc}`
                          : `[图片]\n${imageSrc}`;
                      }
                      if (caption) return caption;
                      if (isImage) return "[图片消息]";
                      return "";
                    })();
                    const meshForwardFile =
                      isImage && imageSrc
                        ? {
                            url: imageSrc,
                            fileName: `mesh-image-${m.message_id}.jpg`,
                            mimeType: "image/jpeg"
                          }
                        : undefined;
                    return (
                      <div
                        key={m.message_id}
                        data-msg-idx={idx}
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
                            {...createLongPressHandlers(
                              "meshserver_group",
                              selectedThreadId || "",
                              m.message_id,
                              {
                                canRevoke: false,
                                forwardText: meshForwardText,
                                forwardFile: meshForwardFile
                              }
                            )}
                          >
                            {isImage ? (
                              imageSrc ? (
                                <div>
                                  <img
                                    src={imageSrc}
                                    alt={caption || "image"}
                                    role="button"
                                    tabIndex={0}
                                    onClick={e => {
                                      e.stopPropagation();
                                      setImagePreview({
                                        src: imageSrc,
                                        alt: caption || "image"
                                      });
                                    }}
                                    onKeyDown={e => {
                                      if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setImagePreview({
                                          src: imageSrc,
                                          alt: caption || "image"
                                        });
                                      }
                                    }}
                                    style={{
                                      maxWidth: "100%",
                                      borderRadius: 10,
                                      display: "block",
                                      cursor: "zoom-in"
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
                ) : selectedThreadKind === "public_channel" ? (
                  [...(messages as PublicChannelMessage[])].sort((a, b) => a.message_id - b.message_id).map((m, idx) => {
                    const isDeleted = m.is_deleted || m.message_type === "deleted";
                    const fromMe = !!me?.peer_id && m.author_peer_id === me.peer_id;
                    const senderLabel = fromMe
                      ? "我"
                      : shortPeer(m.author_peer_id || m.creator_peer_id || "?");
                    const letter = textAvatarLetter(senderLabel);
                    const textBody = normalizeMessageMultilineText(m.content?.text);
                    const textBodyTrimmed = textBody.trim();
                    const t = m.updated_at ?? m.created_at;
                    const img0 = m.content?.images?.[0] as Record<string, unknown> | undefined;
                    const rawImgUrl = publicChannelMediaRef(img0);
                    const imgFileName = String(
                      img0?.file_name ?? img0?.name ?? img0?.fileName ?? ""
                    ).trim();
                    const firstImageUrl = rawImgUrl
                      ? resolvePublicChannelAssetUrl(rawImgUrl, imgFileName)
                      : "";
                    const file0 = m.content?.files?.[0] as Record<string, unknown> | undefined;
                    const rawFileUrl = publicChannelMediaRef(file0);
                    const fileName = String(file0?.file_name ?? file0?.name ?? "file").trim() || "file";
                    const firstFileUrl = rawFileUrl
                      ? resolvePublicChannelAssetUrl(rawFileUrl, fileName)
                      : "";
                    const fileMime = String(
                      file0?.mime_type ?? file0?.mime ?? "application/octet-stream"
                    ).trim();
                    const fileSize =
                      typeof file0?.size === "number" ? file0.size : undefined;
                    const imgMime = String(img0?.mime_type ?? img0?.mime ?? "").trim();
                    /** 与 images[] / files[] 二选一展示一致：有图链优先走图片气泡 */
                    const showImageBubble = Boolean(firstImageUrl);
                    const showFileBubble = Boolean(firstFileUrl) && !showImageBubble;
                    const forwardText = (() => {
                      if (isDeleted) return "";
                      if (firstImageUrl) {
                        return textBodyTrimmed
                          ? `${textBody}\n[图片]\n${firstImageUrl}`
                          : `[图片]\n${firstImageUrl}`;
                      }
                      if (firstFileUrl) {
                        return textBodyTrimmed
                          ? `${textBody}\n[文件] ${fileName}\n${firstFileUrl}`
                          : `[文件] ${fileName}\n${firstFileUrl}`;
                      }
                      return textBody;
                    })();

                    const forwardFile = firstImageUrl
                      ? {
                          url: firstImageUrl,
                          fileName:
                            fileName && /\.(png|jpe?g|gif|webp)$/i.test(fileName)
                              ? fileName
                              : `image-${m.message_id}.jpg`,
                          mimeType: isImageMime(imgMime) ? imgMime : "image/jpeg"
                        }
                      : firstFileUrl
                        ? {
                            url: firstFileUrl,
                            fileName,
                            mimeType: fileMime || "application/octet-stream"
                          }
                        : undefined;

                    const canEditPublic =
                      !!selectedThread?.isPublicChannelOwner &&
                      !isDeleted &&
                      !firstImageUrl &&
                      !firstFileUrl &&
                      (m.message_type === "text" || textBodyTrimmed.length > 0);

                    return (
                      <div
                        key={`${m.message_id}-${m.version ?? 1}`}
                        data-msg-idx={idx}
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
                            {senderLabel} · {formatTimeFromUnixSec(t)}
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
                              "public_channel",
                              selectedThreadId || "",
                              String(m.message_id),
                              {
                                canRevoke: !!selectedThread?.isPublicChannelOwner && !isDeleted,
                                forwardText,
                                forwardFile,
                                canEdit: canEditPublic,
                                editInitialText: textBody
                              }
                            )}
                          >
                            {isDeleted ? (
                              <span style={{ opacity: 0.65 }}>该消息已删除</span>
                            ) : showImageBubble && firstImageUrl ? (
                              <div>
                                <img
                                  src={firstImageUrl}
                                  alt={textBody || "image"}
                                  role="button"
                                  tabIndex={0}
                                  onClick={e => {
                                    e.stopPropagation();
                                    setImagePreview({
                                      src: firstImageUrl,
                                      alt: textBody || "image"
                                    });
                                  }}
                                  onKeyDown={e => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setImagePreview({
                                        src: firstImageUrl,
                                        alt: textBody || "image"
                                      });
                                    }
                                  }}
                                  style={{
                                    maxWidth: "100%",
                                    borderRadius: 10,
                                    display: "block",
                                    cursor: "zoom-in"
                                  }}
                                />
                                {textBodyTrimmed ? (
                                  <div
                                    style={{
                                      marginTop: 8,
                                      fontSize: 14,
                                      whiteSpace: "pre-wrap",
                                      overflowWrap: "anywhere",
                                      wordBreak: "break-word"
                                    }}
                                  >
                                    {textBody}
                                  </div>
                                ) : null}
                              </div>
                            ) : showFileBubble && firstFileUrl ? (
                              <div>
                                <FileMessageContent
                                  downloadUrl={firstFileUrl}
                                  fileName={fileName}
                                  mimeType={fileMime}
                                  fileSize={fileSize}
                                  onImagePreview={(src, alt) =>
                                    setImagePreview({ src, alt })
                                  }
                                />
                                {textBodyTrimmed ? (
                                  <div
                                    style={{
                                      marginTop: 8,
                                      fontSize: 14,
                                      whiteSpace: "pre-wrap",
                                      overflowWrap: "anywhere",
                                      wordBreak: "break-word"
                                    }}
                                  >
                                    {textBody}
                                  </div>
                                ) : null}
                              </div>
                            ) : textBodyTrimmed ? (
                              textBody
                            ) : (
                              <span style={{ opacity: 0.75 }}>[非文本消息]</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : selectedThreadKind === "group" ? (
                  (messages as GroupMessage[]).map((m, idx) => {
                    const fromMe = !!me && m.sender_peer_id === me.peer_id;
                    const deliverySummaryText = fromMe
                      ? formatDeliverySummary(m.delivery_summary)
                      : "";
                    /** 有成員送達彙總時只顯示彙總，避免與 state 的「已送达」重複 */
                    const deliveryText = fromMe
                      ? deliverySummaryText
                        ? ""
                        : deliveryStatusText(m.state, m.delivered_at)
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
                    const text = normalizeMessageMultilineText(m.plaintext);
                    const textTrimmed = text.trim();
                    const gid = m.group_id || selectedThreadId || "";
                    const groupForwardText =
                      isFile && gid
                        ? `[文件] ${(m.file_name || "file").trim() || "file"}\n${groupFileUrl(
                            gid,
                            m.msg_id
                          )}`
                        : text;
                    const groupForwardFile =
                      isFile && gid
                        ? {
                            url: groupFileUrl(gid, m.msg_id),
                            fileName: (m.file_name || "file").trim() || "file",
                            mimeType:
                              (m.mime_type || "").trim() || "application/octet-stream"
                          }
                        : undefined;
                    return (
                      <div
                        key={m.msg_id}
                        data-msg-idx={idx}
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
                            {fromMe &&
                            (deliveryText || deliverySummaryText)
                              ? ` · ${[deliveryText, deliverySummaryText]
                                  .filter(Boolean)
                                  .join(" · ")}`
                              : ""}
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
                              gid,
                              m.msg_id,
                              {
                                canRevoke: canRevokeGroupMessage(m.sender_peer_id),
                                forwardText: groupForwardText,
                                forwardFile: groupForwardFile
                              }
                            )}
                          >
                            {isFile && m.group_id ? (
                              <FileMessageContent
                                downloadUrl={groupFileUrl(m.group_id, m.msg_id)}
                                fileName={m.file_name}
                                mimeType={m.mime_type}
                                fileSize={m.file_size}
                                onImagePreview={(src, alt) =>
                                  setImagePreview({ src, alt })
                                }
                              />
                            ) : textTrimmed ? (
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
                  (messages as DirectMessage[]).map((m, idx) => {
                    const fromMe = m.direction === "outbound";
                    const deliveryText = fromMe
                      ? deliveryStatusText(m.state, m.delivered_at)
                      : "";
                    const senderName = fromMe ? "我" : selectedThread.title;
                    const letter = textAvatarLetter(senderName);
                    const isFile = m.msg_type === "chat_file";
                    const text = normalizeMessageMultilineText(m.plaintext);
                    const textTrimmed = text.trim();
                    const convId = m.conversation_id || selectedThreadId || "";
                    const directForwardText =
                      isFile && convId
                        ? `[文件] ${(m.file_name || "file").trim() || "file"}\n${directFileUrl(
                            convId,
                            m.msg_id
                          )}`
                        : text;
                    const directForwardFile =
                      isFile && convId
                        ? {
                            url: directFileUrl(convId, m.msg_id),
                            fileName: (m.file_name || "file").trim() || "file",
                            mimeType:
                              (m.mime_type || "").trim() || "application/octet-stream"
                          }
                        : undefined;
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
                          data-msg-idx={idx}
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
                        data-msg-idx={idx}
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
                              convId,
                              m.msg_id,
                              {
                                canRevoke: !!fromMe,
                                forwardText: directForwardText,
                                forwardFile: directForwardFile
                              }
                            )}
                          >
                            {isFile && m.conversation_id ? (
                              <FileMessageContent
                                downloadUrl={directFileUrl(m.conversation_id, m.msg_id)}
                                fileName={m.file_name}
                                mimeType={m.mime_type}
                                fileSize={m.file_size}
                                onImagePreview={(src, alt) =>
                                  setImagePreview({ src, alt })
                                }
                              />
                            ) : textTrimmed ? (
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
                {!atBottom && !messagesLoading && messages.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => scrollToLatest()}
                    style={{
                      position: "absolute",
                      right: 10,
                      bottom: 10,
                      zIndex: 5,
                      padding: "8px 12px",
                      borderRadius: 10,
                      border: "1px solid rgba(88,166,255,0.35)",
                      background: "rgba(17,24,39,0.92)",
                      color: "#bfdbfe",
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                      boxShadow: "0 6px 20px rgba(0,0,0,0.35)"
                    }}
                  >
                    最新
                  </button>
                ) : null}
              </div>

                <div
                  style={{
                    flexShrink: 0,
                    borderTop: "1px solid rgba(255,255,255,0.08)"
                  }}
                  onDragOver={handleInputAreaDragOver}
                  onDrop={handleInputAreaDrop}
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
                          placeholder="输入讯息…（Shift+Enter 换行，可拖入图片）"
                          attachButton={false}
                          onSend={(html, tc, it) =>
                            void handleSendMessage(plainTextFromMessageInput(html, tc, it))
                          }
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
                  ) : selectedThreadKind === "public_channel" ? (
                    selectedThread?.isPublicChannelOwner ? (
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
                            placeholder="文字，或拖拽/粘贴/选择图片、视频、音频与文件…"
                            attachButton={false}
                            onSend={(html, tc, it) =>
                              void handleSendMessage(plainTextFromMessageInput(html, tc, it))
                            }
                          />
                        </div>
                        <input
                          id="public-channel-file-input"
                          type="file"
                          multiple
                          style={{ display: "none" }}
                          onChange={e => {
                            const fs = e.target.files;
                            if (!fs?.length) return;
                            for (const f of Array.from(fs)) void sendFileForCurrentThread(f);
                            e.currentTarget.value = "";
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const el = document.getElementById(
                              "public-channel-file-input"
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
                          附件
                        </button>
                      </div>
                    ) : (
                      <div
                        style={{
                          padding: "12px 14px",
                          fontSize: 13,
                          opacity: 0.72,
                          color: "#9ca3af"
                        }}
                      >
                        你不是频道创建者，仅可浏览历史消息。
                      </div>
                    )
                  ) : (
                    <MessageInput
                      placeholder="输入讯息…（Shift+Enter 换行，可拖入或粘贴文件）"
                      attachButton={false}
                      onSend={(html, tc, it) =>
                        void handleSendMessage(plainTextFromMessageInput(html, tc, it))
                      }
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
