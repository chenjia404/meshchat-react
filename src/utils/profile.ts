import type { Me } from "../types";

export function pickTrimmedString(obj: any, keys: string[]): string {
  if (!obj || typeof obj !== "object") return "";
  for (const k of keys) {
    const v = obj[k];
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return "";
}

/** 兼容 /api/v1/chat/me、profile：嵌套 me/user/profile；本地暱稱後端常用 remote_nickname */
export function normalizeChatMe(data: any, fallbackPeerId?: string): Me | null {
  if (data == null || typeof data !== "object") return null;
  const root = data;
  const src =
    data.me && typeof data.me === "object"
      ? data.me
      : data.user && typeof data.user === "object"
        ? data.user
        : data.profile && typeof data.profile === "object"
          ? data.profile
          : data;

  const peer_id =
    pickTrimmedString(src, ["peer_id", "peerId", "peerID"]) ||
    pickTrimmedString(root, ["peer_id", "peerId", "peerID"]) ||
    (fallbackPeerId ? String(fallbackPeerId).trim() : "");

  if (!peer_id) return null;

  const nickname =
    pickTrimmedString(src, [
      "remote_nickname",
      "remoteNickname",
      "nickname",
      "display_name",
      "displayName",
      "name",
      "nick"
    ]) ||
    pickTrimmedString(root, [
      "remote_nickname",
      "remoteNickname",
      "nickname",
      "display_name",
      "displayName",
      "name",
      "nick"
    ]);

  const chat_kex_pub =
    pickTrimmedString(src, ["chat_kex_pub", "chatKexPub", "kex_pub"]) ||
    pickTrimmedString(root, ["chat_kex_pub", "chatKexPub", "kex_pub"]);

  const avatar =
    pickTrimmedString(src, ["avatar", "avatar_url", "avatarUrl"]) ||
    pickTrimmedString(root, ["avatar", "avatar_url", "avatarUrl"]);

  const avatar_cid =
    pickTrimmedString(src, ["avatar_cid", "avatarCid"]) ||
    pickTrimmedString(root, ["avatar_cid", "avatarCid"]);

  const bio =
    pickTrimmedString(src, ["bio", "intro", "description"]) ||
    pickTrimmedString(root, ["bio", "intro", "description"]);

  const me: Me = { peer_id };
  if (nickname) {
    me.nickname = nickname;
    me.remote_nickname = nickname;
  }
  if (chat_kex_pub) me.chat_kex_pub = chat_kex_pub;
  if (avatar) me.avatar = avatar;
  if (avatar_cid) me.avatar_cid = avatar_cid;
  if (bio) me.bio = bio;
  return me;
}
