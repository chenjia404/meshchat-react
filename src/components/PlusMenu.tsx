import React from "react";

export interface PlusMenuProps {
  open: boolean;
  onClose: () => void;
  onAddFriend: () => void;
  onCreateGroup: () => void;
  onMeshJoin: () => void;
  onCreatePublicChannel: () => void;
  onSubscribePublicChannel: () => void;
}

export function PlusMenu({
  open,
  onClose,
  onAddFriend,
  onCreateGroup,
  onMeshJoin,
  onCreatePublicChannel,
  onSubscribePublicChannel
}: PlusMenuProps) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 9998 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: "fixed",
          top: 54,
          right: 12,
          width: 200,
          borderRadius: 12,
          background: "rgba(17,24,39,0.98)",
          border: "1px solid rgba(255,255,255,0.12)",
          boxShadow: "0 18px 60px rgba(0,0,0,0.45)",
          padding: 6
        }}
      >
        <button
          type="button"
          onClick={() => {
            onAddFriend();
            onClose();
          }}
          style={{
            width: "100%",
            padding: "10px 10px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "transparent",
            color: "#e5e7eb",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 700,
            textAlign: "left"
          }}
        >
          添加朋友
        </button>
        <button
          type="button"
          onClick={() => {
            onCreateGroup();
            onClose();
          }}
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
            fontWeight: 700,
            textAlign: "left"
          }}
        >
          发起群聊
        </button>
        <button
          type="button"
          onClick={() => {
            onCreatePublicChannel();
            onClose();
          }}
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
            fontWeight: 700,
            textAlign: "left"
          }}
        >
          创建公开频道
        </button>
        <button
          type="button"
          onClick={() => {
            onSubscribePublicChannel();
            onClose();
          }}
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
            fontWeight: 700,
            textAlign: "left"
          }}
        >
          订阅公开频道
        </button>
        <button
          type="button"
          onClick={onMeshJoin}
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
            fontWeight: 700,
            textAlign: "left"
          }}
        >
          加入服务器
        </button>
      </div>
    </div>
  );
}
