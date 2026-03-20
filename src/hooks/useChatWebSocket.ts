import React, { useEffect } from "react";
import { api, get } from "../api";
import type {
  ContactRaw,
  ConversationRaw,
  FriendRequestRaw,
  ThreadKind
} from "../types";
import { normalizeEntityList } from "../utils";
import type { WsChatEvent } from "../types/ws";

export interface UseChatWebSocketParams {
  activeTab: "chat" | "contacts" | "me";
  loadThreadMessages: (
    kind: ThreadKind,
    id: string,
    opts?: { silent?: boolean; meshAfterSeq?: number }
  ) => void | Promise<void>;
  setWsConnected: React.Dispatch<React.SetStateAction<boolean>>;
  setRequestsRaw: React.Dispatch<React.SetStateAction<FriendRequestRaw[]>>;
  setContactsRaw: React.Dispatch<React.SetStateAction<ContactRaw[]>>;
  setConversations: React.Dispatch<React.SetStateAction<ConversationRaw[]>>;
  setSelectedThreadId: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedThreadKind: React.Dispatch<React.SetStateAction<ThreadKind>>;
  setActiveTab: React.Dispatch<React.SetStateAction<"chat" | "contacts" | "me">>;
  setMobileView: React.Dispatch<React.SetStateAction<"list" | "chat">>;
  activeTabRef: React.MutableRefObject<"chat" | "contacts" | "me">;
  selectedThreadRef: React.MutableRefObject<{
    kind: ThreadKind;
    id: string | null;
  }>;
  isMobileRef: React.MutableRefObject<boolean>;
  /** 收到新訊息時刷新側邊會話列表（預覽/排序） */
  scheduleRefreshConversationList?: () => void;
  /** 解析 WS payload 並補上側欄最後一則預覽（對方來訊時列表 API 常無 last_message） */
  onIncomingChatMessage?: (raw: Record<string, unknown>) => void;
  /** 若後端已帶完整訊息欄位，返回 true 則不再 silent 拉取 /messages */
  mergeMessageFromWs?: (evt: WsChatEvent) => boolean;
}

/**
 * 連線 `/api/v1/chat/ws`：新訊息刷新當前線程、好友請求狀態變更時重載列表。
 */
export function useChatWebSocket({
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
  onIncomingChatMessage,
  mergeMessageFromWs
}: UseChatWebSocketParams) {
  useEffect(() => {
    if (activeTab !== "chat") return;

    let cancelled = false;
    let retryCount = 0;
    let ws: WebSocket | null = null;

    const makeWsUrl = () => {
      const p = api("/api/v1/chat/ws");
      if (p.startsWith("https://")) return p.replace("https://", "wss://");
      if (p.startsWith("http://")) return p.replace("http://", "ws://");
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      return `${proto}//${location.host}${p}`;
    };

    const connect = () => {
      if (cancelled) return;
      ws = new WebSocket(makeWsUrl());

      ws.onopen = () => {
        if (cancelled) return;
        setWsConnected(true);
        retryCount = 0;
      };

      ws.onclose = () => {
        if (cancelled) return;
        setWsConnected(false);
        retryCount++;
        const delay = Math.min(30000, 1000 * Math.pow(2, retryCount));
        window.setTimeout(connect, delay);
      };

      ws.onerror = () => {
        try {
          ws?.close();
        } catch {
          /* ignore */
        }
      };

      ws.onmessage = ev => {
        const data = (ev.data || "") as string;
        let evt: WsChatEvent | null = null;
        try {
          evt = JSON.parse(data) as WsChatEvent;
        } catch {
          return;
        }
        if (!evt?.type) return;

        if (evt.type === "message") {
          if (activeTabRef.current !== "chat") return;
          scheduleRefreshConversationList?.();
          try {
            onIncomingChatMessage?.(evt as unknown as Record<string, unknown>);
          } catch {
            /* ignore */
          }
          const sel = selectedThreadRef.current;
          if (!sel.id || !evt?.kind || !evt?.conversation_id) return;

          if (evt.kind === sel.kind && evt.conversation_id === sel.id) {
            const merged = mergeMessageFromWs?.(evt);
            if (!merged) {
              void loadThreadMessages(sel.kind, sel.id, { silent: true });
            }
          }
          return;
        }

        if (evt.type === "friend_request") {
          const state = (evt.state || "").toLowerCase();
          const accepted = state === "accepted";
          const rejected = state === "rejected" || state === "denied";
          const convIDFromEvt = evt.conversation_id || null;

          const reload = async () => {
            const [nextReqs, nextContacts, nextConvs] = await Promise.all([
              get<FriendRequestRaw[]>("/api/v1/chat/requests").catch(() => []),
              accepted
                ? get<ContactRaw[]>("/api/v1/chat/contacts").catch(() => [])
                : Promise.resolve([] as ContactRaw[]),
              accepted || rejected
                ? get<ConversationRaw[]>("/api/v1/chat/conversations").catch(() => [])
                : Promise.resolve([] as ConversationRaw[])
            ]);

            setRequestsRaw(normalizeEntityList<FriendRequestRaw>(nextReqs, ["requests"]));
            if (accepted) {
              setContactsRaw(normalizeEntityList<ContactRaw>(nextContacts, ["contacts"]));
              setConversations(normalizeEntityList<ConversationRaw>(nextConvs, ["conversations"]));

              if (convIDFromEvt) {
                setSelectedThreadId(convIDFromEvt);
                setSelectedThreadKind("direct");
                setActiveTab("chat");
                if (isMobileRef.current) setMobileView("chat");
                void loadThreadMessages("direct", convIDFromEvt, { silent: true });
              }
            } else if (rejected) {
              setConversations(normalizeEntityList<ConversationRaw>(nextConvs, ["conversations"]));
              if (convIDFromEvt && selectedThreadRef.current.id === convIDFromEvt) {
                const activeConvs = (nextConvs || []).filter(
                  c => (c.state || "active") === "active"
                );
                setSelectedThreadId(activeConvs[0]?.conversation_id || null);
                setSelectedThreadKind("direct");
              }
              const shouldAlert =
                !!convIDFromEvt && selectedThreadRef.current.id === convIDFromEvt;
              if (shouldAlert) {
                alert("对方尚未建立好友关系，请重新添加好友。");
              }
            }
          };

          void reload().catch(() => null);
        }
      };
    };

    connect();
    return () => {
      cancelled = true;
      setWsConnected(false);
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    };
  }, [
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
    onIncomingChatMessage,
    mergeMessageFromWs
  ]);
}
