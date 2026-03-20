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
  return [
    ...conversations
      .filter(conv => (conv.state || "active") === "active")
      .map(conv => ({
        id: conv.conversation_id,
        kind: "direct" as ThreadKind,
        peerId: conv.peer_id,
        title: displayName(contactsRaw, conv.peer_id, shortPeer(conv.peer_id)),
        subtitle: shortPeerTail(conv.peer_id),
        avatarUrl: contactAvatarMap.get(conv.peer_id),
        lastMessage: peekConversationPreview(
          conv as ConversationRaw & Record<string, unknown>
        ),
        lastTime: relativeTime(conv.updated_at)
      })),
    ...groups.map(g => ({
      id: g.group_id,
      kind: "group" as ThreadKind,
      title: g.title || "未命名群",
      subtitle: `成员 ${g.member_count || 0}`,
      lastMessage: peekGroupPreview(g as GroupRaw & Record<string, unknown>),
      lastTime: relativeTime(g.last_message_at || g.updated_at)
    })),
    ...meshGroups.map(mg => ({
      id: mg.threadId,
      kind: "meshserver_group" as ThreadKind,
      title: mg.title,
      subtitle: "中心化群",
      lastMessage: "",
      lastTime: "",
      connectionName: mg.connectionName,
      myUserId: mg.myUserId
    }))
  ];
}
