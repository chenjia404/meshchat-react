import type { ThreadKind } from "../types";

export function threadUnreadKey(kind: ThreadKind, threadId: string): string {
  return `${kind}:${threadId}`;
}
