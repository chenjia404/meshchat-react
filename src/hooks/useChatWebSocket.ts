import React, { useEffect, useRef } from "react";
import { api, get } from "../api";
import type {
  ContactRaw,
  ConversationRaw,
  FriendRequestRaw,
  ThreadKind
} from "../types";
import { normalizeEntityList } from "../utils";
import type { WsChatEvent } from "../types/ws";

/** 後端好友/會話建立完成推送（發起方收到，與 friend_request accepted 互補） */
function isSessionAcceptEvent(evt: WsChatEvent): boolean {
  const t = String(evt.type ?? "");
  if (t === "SessionAccept") return true;
  const lower = t.toLowerCase();
  return lower === "session_accept" || lower === "sessionaccept";
}

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
  scheduleRefreshConversationList?: () => void;
  onIncomingChatMessage?: (raw: Record<string, unknown>) => void;
  mergeMessageFromWs?: (evt: WsChatEvent) => boolean;
  onMessageState?: (raw: Record<string, unknown>) => void;
}

/**
 * 連線 `/api/v1/chat/ws`：掛載後常駐，不因父組件 callback 更新而斷線；僅 App 卸載時關閉。
 * 網路斷開時由 onclose 指數退避自動重連。
 */
export function useChatWebSocket(props: UseChatWebSocketParams) {
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    let cancelled = false;
    let retryCount = 0;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const makeWsUrl = () => {
      const p = api("/api/v1/chat/ws");
      if (p.startsWith("https://")) return p.replace("https://", "wss://");
      if (p.startsWith("http://")) return p.replace("http://", "ws://");
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      return `${proto}//${location.host}${p}`;
    };

    const clearReconnectTimer = () => {
      if (reconnectTimer != null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const connect = () => {
      if (cancelled) return;
      clearReconnectTimer();
      ws = new WebSocket(makeWsUrl());

      ws.onopen = () => {
        if (cancelled) return;
        propsRef.current.setWsConnected(true);
        retryCount = 0;
      };

      ws.onclose = () => {
        if (cancelled) return;
        propsRef.current.setWsConnected(false);
        retryCount++;
        const delay = Math.min(30000, 1000 * Math.pow(2, retryCount));
        reconnectTimer = window.setTimeout(() => {
          reconnectTimer = null;
          connect();
        }, delay);
      };

      /** 不主動 close：錯誤後通常會跟著 onclose，避免重複斷線與競態 */
      ws.onerror = () => {};

      ws.onmessage = ev => {
        const data = (ev.data || "") as string;
        let evt: WsChatEvent | null = null;
        try {
          evt = JSON.parse(data) as WsChatEvent;
        } catch {
          return;
        }
        if (!evt?.type) return;

        const p = propsRef.current;

        if (isSessionAcceptEvent(evt)) {
          void (async () => {
            const [nextReqs, nextContacts, nextConvs] = await Promise.all([
              get<FriendRequestRaw[]>("/api/v1/chat/requests").catch(() => []),
              get<ContactRaw[]>("/api/v1/chat/contacts").catch(() => []),
              get<ConversationRaw[]>("/api/v1/chat/conversations").catch(() => [])
            ]);
            if (cancelled) return;
            p.setRequestsRaw(normalizeEntityList<FriendRequestRaw>(nextReqs, ["requests"]));
            p.setContactsRaw(normalizeEntityList<ContactRaw>(nextContacts, ["contacts"]));
            p.setConversations(
              normalizeEntityList<ConversationRaw>(nextConvs, ["conversations"])
            );
          })().catch(() => null);
          return;
        }

        if (evt.type === "message_state") {
          if (p.activeTabRef.current !== "chat") return;
          try {
            p.onMessageState?.(evt as unknown as Record<string, unknown>);
          } catch {
            /* ignore */
          }
          return;
        }

        if (evt.type === "message") {
          if (p.activeTabRef.current !== "chat") return;
          p.scheduleRefreshConversationList?.();
          try {
            p.onIncomingChatMessage?.(evt as unknown as Record<string, unknown>);
          } catch {
            /* ignore */
          }
          const sel = p.selectedThreadRef.current;
          if (!sel.id || !evt?.kind || !evt?.conversation_id) return;

          if (evt.kind === sel.kind && evt.conversation_id === sel.id) {
            const merged = p.mergeMessageFromWs?.(evt);
            if (!merged) {
              void p.loadThreadMessages(sel.kind, sel.id, { silent: true });
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

            const pr = propsRef.current;
            pr.setRequestsRaw(normalizeEntityList<FriendRequestRaw>(nextReqs, ["requests"]));
            if (accepted) {
              pr.setContactsRaw(normalizeEntityList<ContactRaw>(nextContacts, ["contacts"]));
              pr.setConversations(normalizeEntityList<ConversationRaw>(nextConvs, ["conversations"]));

              if (convIDFromEvt) {
                pr.setSelectedThreadId(convIDFromEvt);
                pr.setSelectedThreadKind("direct");
                pr.setActiveTab("chat");
                if (pr.isMobileRef.current) pr.setMobileView("chat");
                void pr.loadThreadMessages("direct", convIDFromEvt, { silent: true });
              }
            } else if (rejected) {
              pr.setConversations(normalizeEntityList<ConversationRaw>(nextConvs, ["conversations"]));
              if (convIDFromEvt && pr.selectedThreadRef.current.id === convIDFromEvt) {
                const activeConvs = (nextConvs || []).filter(
                  c => (c.state || "active") === "active"
                );
                pr.setSelectedThreadId(activeConvs[0]?.conversation_id || null);
                pr.setSelectedThreadKind("direct");
              }
              const shouldAlert =
                !!convIDFromEvt && pr.selectedThreadRef.current.id === convIDFromEvt;
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
      clearReconnectTimer();
      propsRef.current.setWsConnected(false);
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    };
  }, []);
}
