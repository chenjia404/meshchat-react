import { api } from "./config";

export function avatarUrl(avatar?: string | null): string | undefined {
  const v = (avatar || "").trim();
  if (!v) return undefined;
  return api(`/api/v1/chat/avatars/${encodeURIComponent(v)}`);
}

export function directFileUrl(conversationId: string, msgId: string): string {
  return api(
    `/api/v1/chat/conversations/${encodeURIComponent(
      conversationId
    )}/messages/${encodeURIComponent(msgId)}/file`
  );
}

export function groupFileUrl(groupId: string, msgId: string): string {
  return api(
    `/api/v1/groups/${encodeURIComponent(groupId)}/messages/${encodeURIComponent(
      msgId
    )}/file`
  );
}
