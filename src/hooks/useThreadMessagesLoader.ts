import React, { useCallback, useEffect } from "react";
import { get, post } from "../api";
import type {
  DirectMessage,
  GroupDetails,
  GroupMessage,
  MeshserverGroupThread,
  MeshserverSyncMessage,
  PublicChannelMessage,
  ThreadKind
} from "../types";
import {
  mergeMeshSyncMessages,
  normalizeList,
  normalizePublicChannelMessages
} from "../utils";

export interface UseThreadMessagesLoaderParams {
  meshGroups: MeshserverGroupThread[];
  selectedThreadId: string | null;
  selectedThreadKind: ThreadKind;
  activeTab: "chat" | "contacts" | "me";
  messagesRef: React.MutableRefObject<
    Array<DirectMessage | GroupMessage | MeshserverSyncMessage | PublicChannelMessage>
  >;
  setMessages: React.Dispatch<
    React.SetStateAction<
      Array<DirectMessage | GroupMessage | MeshserverSyncMessage | PublicChannelMessage>
    >
  >;
  setMessagesLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedGroupDetails: React.Dispatch<React.SetStateAction<GroupDetails | null>>;
}

const POLL_MS = 4000;

/**
 * 載入當前線程訊息、切換線程時重載一次。
 * - 私聊（direct）：僅在切換會話時 GET /messages；之後依 WebSocket 與 silent sync+拉取，不做定時輪詢。
 * - 群聊 / mesh：維持定時輪詢增量同步。
 */
export function useThreadMessagesLoader({
  meshGroups,
  selectedThreadId,
  selectedThreadKind,
  activeTab,
  messagesRef,
  setMessages,
  setMessagesLoading,
  setSelectedGroupDetails
}: UseThreadMessagesLoaderParams) {
  const loadThreadMessages = useCallback(
    async (
      kind: ThreadKind,
      id: string,
      opts?: { silent?: boolean; meshAfterSeq?: number }
    ) => {
      const silent = !!opts?.silent;
      try {
        if (!silent) {
          setMessagesLoading(true);
          // 切换会话时先清空，避免未加载完成时用上一会话的条数去算未读锚点
          setMessages([]);
        }
        if (kind === "group") {
          if (!silent) {
            const details = await get<GroupDetails>(
              `/api/v1/groups/${encodeURIComponent(id)}`
            ).catch(() => null);
            setSelectedGroupDetails(details);
          }
          const resp = await get<unknown>(
            `/api/v1/groups/${encodeURIComponent(id)}/messages`
          );
          setMessages(normalizeList<GroupMessage>(resp));
        } else if (kind === "meshserver_group") {
          if (!silent) setSelectedGroupDetails(null);
          const thread = meshGroups.find(t => t.threadId === id) || null;
          const connectionName = thread?.connectionName;
          if (!thread || !connectionName) {
            setMessages([]);
            return;
          }

          const afterSeq =
            opts?.meshAfterSeq !== undefined ? opts.meshAfterSeq : 0;
          const resp = await get<{ messages?: unknown[] }>(
            `/api/v1/meshserver/channels/${encodeURIComponent(
              id
            )}/sync?connection=${encodeURIComponent(
              connectionName
            )}&after_seq=${encodeURIComponent(String(afterSeq))}&limit=200`
          ).catch(() => ({ messages: [] }));

          const list = Array.isArray(resp?.messages) ? resp.messages : [];
          const incoming = list as MeshserverSyncMessage[];
          if (silent && afterSeq > 0) {
            setMessages(prev =>
              mergeMeshSyncMessages(prev as MeshserverSyncMessage[], incoming)
            );
          } else {
            setMessages(incoming);
          }
        } else if (kind === "public_channel") {
          if (!silent) setSelectedGroupDetails(null);
          const resp = await get<unknown>(
            `/api/v1/public-channels/${encodeURIComponent(id)}/messages?limit=50`
          ).catch(() => null);
          setMessages(normalizePublicChannelMessages(resp ?? []));
        } else {
          if (!silent) setSelectedGroupDetails(null);
          if (silent) {
            await post(`/api/v1/chat/conversations/${encodeURIComponent(id)}/sync`, {}).catch(
              () => null
            );
          }
          const resp = await get<unknown>(
            `/api/v1/chat/conversations/${encodeURIComponent(id)}/messages`
          );
          setMessages(normalizeList<DirectMessage>(resp));
        }
      } catch (err) {
        console.error("载入讯息失败:", err);
        if (!silent) setMessages([]);
      } finally {
        if (!silent) setMessagesLoading(false);
      }
    },
    [meshGroups, setMessages, setMessagesLoading, setSelectedGroupDetails]
  );

  useEffect(() => {
    if (!selectedThreadId) {
      setMessages([]);
      return;
    }
    loadThreadMessages(selectedThreadKind, selectedThreadId);
  }, [selectedThreadId, selectedThreadKind, loadThreadMessages, setMessages]);

  useEffect(() => {
    if (activeTab !== "chat" || !selectedThreadId) return;

    const tick = () => {
      if (document.visibilityState === "hidden") return;
      if (activeTab !== "chat" || !selectedThreadId) return;
      // 私聊不重複輪詢 GET messages（首次由切換會話的 effect 拉取，增量靠 WS + silent load）
      if (selectedThreadKind === "direct") return;

      let meshAfterSeq = 0;
      if (selectedThreadKind === "meshserver_group") {
        const list = messagesRef.current as MeshserverSyncMessage[];
        for (const m of list) {
          const s = typeof m.seq === "number" ? m.seq : 0;
          if (s > meshAfterSeq) meshAfterSeq = s;
        }
      }

      loadThreadMessages(selectedThreadKind, selectedThreadId, {
        silent: true,
        meshAfterSeq:
          selectedThreadKind === "meshserver_group" ? meshAfterSeq : undefined
      });
    };

    const timer = window.setInterval(tick, POLL_MS);
    return () => window.clearInterval(timer);
  }, [
    activeTab,
    selectedThreadId,
    selectedThreadKind,
    loadThreadMessages,
    messagesRef
  ]);

  return { loadThreadMessages };
}
