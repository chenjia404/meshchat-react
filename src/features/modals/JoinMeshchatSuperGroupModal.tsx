import React from "react";
import { Modal } from "../../components/Modal";

export interface JoinMeshchatSuperGroupModalProps {
  open: boolean;
  onClose: () => void;
  urlDraft: string;
  onUrlDraftChange: (v: string) => void;
  busy: boolean;
  onJoin: () => void | Promise<void>;
}

export function JoinMeshchatSuperGroupModal(props: JoinMeshchatSuperGroupModalProps) {
  const { open, onClose, urlDraft, onUrlDraftChange, busy, onJoin } = props;
  return (
    <Modal open={open} onClose={onClose} title="加入超级群聊">
      <div style={{ fontSize: 12, opacity: 0.78, marginBottom: 10 }}>
        粘贴群链接，格式：<code>http(s)://主机/groups/{"{UUID}"}</code>
      </div>
      <textarea
        value={urlDraft}
        onChange={e => onUrlDraftChange(e.target.value)}
        placeholder="https://example.com:8080/groups/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
        rows={3}
        style={{
          width: "100%",
          padding: "10px 10px",
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.16)",
          background: "rgba(0,0,0,0.18)",
          color: "#e5e7eb",
          outline: "none",
          resize: "vertical",
          fontFamily: "inherit",
          fontSize: 13
        }}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: "8px 14px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "transparent",
            color: "#e5e7eb",
            cursor: "pointer",
            fontWeight: 700
          }}
        >
          取消
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onJoin()}
          style={{
            padding: "8px 14px",
            borderRadius: 10,
            border: "none",
            background: busy ? "rgba(88,166,255,0.35)" : "#58a6ff",
            color: "#08111c",
            cursor: busy ? "not-allowed" : "pointer",
            fontWeight: 800
          }}
        >
          {busy ? "加入中…" : "加入"}
        </button>
      </div>
    </Modal>
  );
}
