import type {
  ContactRaw,
  ContactViewRow,
  ConversationRaw,
  GroupRaw,
  MeshserverGroupThread,
  ThreadKind
} from "../types";
import { avatarUrl } from "../api";
import type { ChatThreadListItem } from "../features/chat";
import {
  contactDisplayTitle,
  contactRemoteNickname,
  displayName,
  formatTime,
  relativeTime,
  shortPeer,
  shortPeerTail,
  peekConversationPreview,
  peekGroupPreview
} from "../utils";

/** 後端 unread_count 轉為非負整數 */
export function coalesceUnreadCount(raw: unknown): number {
  const x = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(x) || x < 0) return 0;
  return Math.min(999999, Math.floor(x));
}

/** ISO 時間字串轉毫秒，用於會話列表依最近活動排序 */
function lastActivityMs(iso?: string | null): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

export function buildContactAvatarMap(contactsRaw: ContactRaw[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of contactsRaw) {
    const url = avatarUrl(c.avatar);
    if (url) map.set(c.peer_id, url);
  }
  return map;
}

export function mapContactsToRows(contactsRaw: ContactRaw[]): ContactViewRow[] {
  return contactsRaw.map(c => ({
    id: c.peer_id,
    name: contactDisplayTitle(c, c.peer_id, shortPeer(c.peer_id)),
    remark: (c.nickname || "").trim(),
    remoteNickname: contactRemoteNickname(c),
    avatarUrl: avatarUrl(c.avatar),
    bio: c.bio || "",
    chatKexPub: (
      c.chat_kex_pub ||
      (c as unknown as { chatKexPub?: string }).chatKexPub ||
      ""
    ).trim(),
    lastSeen: formatTime(c.last_seen_at),
    blocked: !!c.blocked
  }));
}

export function buildChatThreadListItems(
  conversations: ConversationRaw[],
  groups: GroupRaw[],
  meshGroups: MeshserverGroupThread[],
  contactsRaw: ContactRaw[],
  contactAvatarMap: Map<string, string>
): ChatThreadListItem[] {
  type Row = { item: ChatThreadListItem; activityMs: number };

  const directRows: Row[] = conversations
    .filter(conv => (conv.state || "active") === "active")
    .map(conv => ({
      activityMs: lastActivityMs(conv.updated_at),
      item: {
        id: conv.conversation_id,
        kind: "direct" as ThreadKind,
        peerId: conv.peer_id,
        title: displayName(contactsRaw, conv.peer_id, shortPeer(conv.peer_id)),
        subtitle: shortPeerTail(conv.peer_id),
        avatarUrl: contactAvatarMap.get(conv.peer_id),
        lastMessage: peekConversationPreview(
          conv as ConversationRaw & Record<string, unknown>
        ),
        lastTime: relativeTime(conv.updated_at),
        unreadCount: coalesceUnreadCount(
          (conv as ConversationRaw & Record<string, unknown>).unread_count
        )
      }
    }));

  const groupRows: Row[] = groups.map(g => ({
    activityMs: lastActivityMs(g.last_message_at || g.updated_at),
    item: {
      id: g.group_id,
      kind: "group" as ThreadKind,
      title: g.title || "未命名群",
      subtitle: `成员 ${g.member_count || 0}`,
      lastMessage: peekGroupPreview(g as GroupRaw & Record<string, unknown>),
      lastTime: relativeTime(g.last_message_at || g.updated_at)
    }
  }));

  const meshRows: Row[] = meshGroups.map(mg => ({
    /** 無時間欄位時排於後方；有則可與私聊/群混排 */
    activityMs: 0,
    item: {
      id: mg.threadId,
      kind: "meshserver_group" as ThreadKind,
      title: mg.title,
      subtitle: "中心化群",
      lastMessage: "",
      lastTime: "",
      connectionName: mg.connectionName,
      myUserId: mg.myUserId
    }
  }));

  const merged = [...directRows, ...groupRows, ...meshRows];
  merged.sort((a, b) => {
    if (b.activityMs !== a.activityMs) return b.activityMs - a.activityMs;
    const tie = `${a.item.kind}:${a.item.id}`.localeCompare(
      `${b.item.kind}:${b.item.id}`
    );
    return tie;
  });

  return merged.map(r => r.item);
}
