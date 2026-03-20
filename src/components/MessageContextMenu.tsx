import React from "react";
import type { ThreadKind } from "../types";

export type MessageMenuState = {
  x: number;
  y: number;
  kind: ThreadKind;
  threadId: string;
  msgId: string;
};

export interface MessageContextMenuProps {
  menu: MessageMenuState | null;
  onClose: () => void;
  onRevoke: (kind: ThreadKind, threadId: string, msgId: string) => void | Promise<void>;
}

export function MessageContextMenu({ menu, onClose, onRevoke }: MessageContextMenuProps) {
  if (!menu) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: "fixed",
          left: menu.x,
          top: menu.y,
          width: 180,
          borderRadius: 12,
          background: "rgba(17,24,39,0.98)",
          border: "1px solid rgba(255,255,255,0.12)",
          boxShadow: "0 18px 60px rgba(0,0,0,0.45)",
          padding: 6
        }}
      >
        <button
          type="button"
          onClick={async () => {
            const { kind, threadId, msgId } = menu;
            onClose();
            await onRevoke(kind, threadId, msgId);
          }}
          style={{
            width: "100%",
            padding: "10px 10px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(248,81,73,0.12)",
            color: "#fecaca",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 700,
            textAlign: "left"
          }}
        >
          撤回
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{
            width: "100%",
            marginTop: 6,
            padding: "10px 10px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "transparent",
            color: "#e5e7eb",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 600,
            textAlign: "left"
          }}
        >
          取消
        </button>
      </div>
    </div>
  );
}
