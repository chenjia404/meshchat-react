import React from "react";
import type { ThreadKind } from "../types";

export type MessageMenuState = {
  x: number;
  y: number;
  kind: ThreadKind;
  threadId: string;
  msgId: string;
  forwardText: string;
  canRevoke: boolean;
};

const btn: React.CSSProperties = {
  width: "100%",
  padding: "10px 10px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.10)",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  textAlign: "left"
};

export interface MessageContextMenuProps {
  menu: MessageMenuState | null;
  onClose: () => void;
  onRevoke: (kind: ThreadKind, threadId: string, msgId: string) => void | Promise<void>;
  onForward: (forwardText: string) => void | Promise<void>;
}

export function MessageContextMenu({
  menu,
  onClose,
  onRevoke,
  onForward
}: MessageContextMenuProps) {
  if (!menu) return null;
  const showForward = menu.forwardText.trim().length > 0;
  const showRevoke = menu.canRevoke;
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
        {showForward ? (
          <button
            type="button"
            onClick={async () => {
              const t = menu.forwardText;
              onClose();
              await onForward(t);
            }}
            style={{
              ...btn,
              background: "rgba(88,166,255,0.14)",
              color: "#bfdbfe",
              fontWeight: 700
            }}
          >
            转发
          </button>
        ) : null}
        {showRevoke ? (
          <button
            type="button"
            onClick={async () => {
              const { kind, threadId, msgId } = menu;
              onClose();
              await onRevoke(kind, threadId, msgId);
            }}
            style={{
              ...btn,
              marginTop: showForward ? 6 : 0,
              background: "rgba(248,81,73,0.12)",
              color: "#fecaca",
              fontWeight: 700
            }}
          >
            撤回
          </button>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          style={{
            ...btn,
            marginTop: showForward || showRevoke ? 6 : 0,
            background: "transparent",
            color: "#e5e7eb"
          }}
        >
          取消
        </button>
      </div>
    </div>
  );
}
