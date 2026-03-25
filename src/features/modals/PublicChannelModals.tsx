import React from "react";
import { Modal } from "../../components/Modal";

export interface CreatePublicChannelModalProps {
  open: boolean;
  onClose: () => void;
  name: string;
  onNameChange: (v: string) => void;
  bio: string;
  onBioChange: (v: string) => void;
  actionBusy: boolean;
  onCreate: () => void;
}

export function CreatePublicChannelModal({
  open,
  onClose,
  name,
  onNameChange,
  bio,
  onBioChange,
  actionBusy,
  onCreate
}: CreatePublicChannelModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="创建公开频道">
      <div>
        <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 10 }}>
          将调用 <code style={{ fontSize: 11 }}>POST /api/v1/public-channels</code>{" "}
          创建去中心化公开频道（需 mesh-proxy 支持该 API）。
        </div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 13, marginBottom: 6 }}>频道名称</div>
          <input
            value={name}
            onChange={e => onNameChange(e.target.value)}
            placeholder="例如：技术分享"
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
          <div style={{ fontSize: 13, marginBottom: 6 }}>简介（可选）</div>
          <textarea
            value={bio}
            onChange={e => onBioChange(e.target.value)}
            placeholder="频道说明"
            style={{
              width: "100%",
              padding: "10px 10px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.16)",
              background: "rgba(0,0,0,0.18)",
              color: "#e5e7eb",
              outline: "none",
              minHeight: 72,
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
            disabled={actionBusy || !name.trim()}
            onClick={() => void onCreate()}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "none",
              background: actionBusy || !name.trim() ? "rgba(88,166,255,0.35)" : "#58a6ff",
              color: "#08111c",
              fontWeight: 800,
              cursor: actionBusy || !name.trim() ? "not-allowed" : "pointer"
            }}
          >
            {actionBusy ? "创建中…" : "创建"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export interface SubscribePublicChannelModalProps {
  open: boolean;
  onClose: () => void;
  channelUuid: string;
  onChannelUuidChange: (v: string) => void;
  actionBusy: boolean;
  onSubscribe: () => void;
}

export function SubscribePublicChannelModal({
  open,
  onClose,
  channelUuid,
  onChannelUuidChange,
  actionBusy,
  onSubscribe
}: SubscribePublicChannelModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="订阅公开频道">
      <div>
        <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 10 }}>
          输入频道的 UUID（channel_id），将调用{" "}
          <code style={{ fontSize: 11 }}>
            POST /api/v1/public-channels/{"{id}"}/subscribe
          </code>
          。
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, marginBottom: 6 }}>频道 UUID</div>
          <input
            value={channelUuid}
            onChange={e => onChannelUuidChange(e.target.value)}
            placeholder="0195f3f0-8d4a-7c12-b2c1-9db1f0a9e123"
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
            disabled={actionBusy || !channelUuid.trim()}
            onClick={() => void onSubscribe()}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "none",
              background:
                actionBusy || !channelUuid.trim() ? "rgba(88,166,255,0.35)" : "#58a6ff",
              color: "#08111c",
              fontWeight: 800,
              cursor: actionBusy || !channelUuid.trim() ? "not-allowed" : "pointer"
            }}
          >
            {actionBusy ? "订阅中…" : "订阅"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
