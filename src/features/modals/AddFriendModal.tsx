import React from "react";
import { Modal } from "../../components/Modal";

export interface AddFriendModalProps {
  open: boolean;
  onClose: () => void;
  peerId: string;
  onPeerIdChange: (v: string) => void;
  intro: string;
  onIntroChange: (v: string) => void;
  actionBusy: string | null;
  onSendRequest: () => void;
}

export function AddFriendModal({
  open,
  onClose,
  peerId,
  onPeerIdChange,
  intro,
  onIntroChange,
  actionBusy,
  onSendRequest
}: AddFriendModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="添加朋友">
      <div>
        <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 10 }}>
          输入对方 Peer ID，发送好友请求后对方接受即可开始私聊。
        </div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 13, marginBottom: 6 }}>Peer ID</div>
          <input
            value={peerId}
            onChange={e => onPeerIdChange(e.target.value)}
            placeholder="12D3KooW..."
            style={{
              width: "100%",
              padding: "10px 10px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.16)",
              background: "rgba(0,0,0,0.18)",
              color: "#e5e7eb",
              outline: "none"
            }}
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, marginBottom: 6 }}>附言</div>
          <textarea
            value={intro}
            onChange={e => onIntroChange(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 10px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.16)",
              background: "rgba(0,0,0,0.18)",
              color: "#e5e7eb",
              outline: "none",
              minHeight: 90,
              resize: "vertical"
            }}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "transparent",
              color: "#e5e7eb",
              cursor: "pointer"
            }}
          >
            取消
          </button>
          <button
            type="button"
            disabled={actionBusy === "addFriend"}
            onClick={onSendRequest}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "none",
              background: "#58a6ff",
              color: "#08111c",
              fontWeight: 800,
              cursor: actionBusy === "addFriend" ? "not-allowed" : "pointer",
              opacity: actionBusy === "addFriend" ? 0.7 : 1
            }}
          >
            {actionBusy === "addFriend" ? "发送中…" : "发送请求"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
