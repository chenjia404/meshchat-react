/** 後端允許的「總分鐘數」區間（0 表示關閉）。 */
export const RETENTION_MINUTES_MAX = 525600;

export const RETENTION_INVALID_ALERT_ZH =
  "自动删除时间必须是 0 或 1~525600 分钟";

export function isValidRetentionMinutesTotal(minutes: number): boolean {
  return minutes >= 0 && minutes <= RETENTION_MINUTES_MAX;
}

export function retentionDirectConversationPath(conversationId: string): string {
  return `/api/v1/chat/conversations/${encodeURIComponent(conversationId)}/retention`;
}

export function retentionGroupPath(groupId: string): string {
  return `/api/v1/groups/${encodeURIComponent(groupId)}/retention`;
}
