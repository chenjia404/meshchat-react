import type { ContactRaw } from "../types";
import { shortPeer } from "./time";

export function contactRemoteNickname(c: ContactRaw | undefined): string {
  if (!c) return "";
  const v = c.remote_nickname ?? (c as { remoteNickname?: string }).remoteNickname;
  return typeof v === "string" ? v.trim() : "";
}

/** 好友/單聊頭像旁顯示名：備註優先，其次對方 remote_nickname，最後 fallback */
export function contactDisplayTitle(
  c: ContactRaw | undefined,
  peerID: string,
  fallback?: string
): string {
  if (!c) return fallback || shortPeer(peerID);
  const remark = (c.nickname || "").trim();
  if (remark) return remark;
  const remote = contactRemoteNickname(c);
  if (remote) return remote;
  return fallback || shortPeer(peerID);
}

export function displayName(
  contacts: ContactRaw[],
  peerID: string,
  fallback?: string
): string {
  const contact = contacts.find(c => c.peer_id === peerID);
  return contactDisplayTitle(contact, peerID, fallback);
}
