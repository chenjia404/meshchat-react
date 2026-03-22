import React from "react";
import type { ThreadKind } from "../types";

/** 轉發檔案訊息時用於下載原檔再上傳到目標會話 */
export type ForwardFilePayload = {
  url: string;
  fileName: string;
  mimeType: string;
};

export type MessageMenuState = {
  x: number;
  y: number;
  kind: ThreadKind;
  threadId: string;
  msgId: string;
  forwardText: string;
  canRevoke: boolean;
  /** 若為檔案類訊息（圖/視頻等），轉發時上傳二進位而非僅發文字 */
  forwardFile?: ForwardFilePayload;
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

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fallback below */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export interface MessageContextMenuProps {
  menu: MessageMenuState | null;
  onClose: () => void;
  onRevoke: (kind: ThreadKind, threadId: string, msgId: string) => void | Promise<void>;
  onForward: (payload: {
    text: string;
    file?: ForwardFilePayload;
  }) => void | Promise<void>;
}

export function MessageContextMenu({
  menu,
  onClose,
  onRevoke,
  onForward
}: MessageContextMenuProps) {
  if (!menu) return null;
  const hasContent =
    menu.forwardText.trim().length > 0 || !!menu.forwardFile;
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
        {hasContent ? (
          <button
            type="button"
            onClick={async () => {
              const t =
                menu.forwardText.trim() ||
                menu.forwardFile?.url ||
                "";
              onClose();
              const ok = await copyToClipboard(t);
              if (!ok) alert("复制失败");
            }}
            style={{
              ...btn,
              background: "rgba(255,255,255,0.06)",
              color: "#e5e7eb"
            }}
          >
            复制
          </button>
        ) : null}
        {hasContent ? (
          <button
            type="button"
            onClick={async () => {
              onClose();
              await onForward({
                text: menu.forwardText,
                file: menu.forwardFile
              });
            }}
            style={{
              ...btn,
              marginTop: 6,
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
              marginTop: hasContent ? 6 : 0,
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
            marginTop: hasContent || showRevoke ? 6 : 0,
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
