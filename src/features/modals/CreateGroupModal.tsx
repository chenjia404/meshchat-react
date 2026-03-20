import React from "react";
import type { ContactViewRow } from "../../types";
import { Modal } from "../../components/Modal";
import { FallbackAvatar } from "../../components/FallbackAvatar";
import { shortPeer } from "../../utils";

export interface CreateGroupModalProps {
  open: boolean;
  onClose: () => void;
  groupTitle: string;
  onGroupTitleChange: (v: string) => void;
  memberQuery: string;
  onMemberQueryChange: (v: string) => void;
  memberIds: Set<string>;
  setMemberIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  contacts: ContactViewRow[];
  actionBusy: string | null;
  onCreateGroup: () => void;
  resolveAvatarSrc: (src?: string) => string | undefined;
}

export function CreateGroupModal({
  open,
  onClose,
  groupTitle,
  onGroupTitleChange,
  memberQuery,
  onMemberQueryChange,
  memberIds,
  setMemberIds,
  contacts,
  actionBusy,
  onCreateGroup,
  resolveAvatarSrc
}: CreateGroupModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="发起群聊">
      <div>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 13, marginBottom: 6 }}>群标题</div>
          <input
            value={groupTitle}
            onChange={e => onGroupTitleChange(e.target.value)}
            placeholder="例如：运营群 / 项目群"
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
          <div style={{ fontSize: 13, marginBottom: 6 }}>
            初始成员（从好友中选择）
          </div>
          <input
            value={memberQuery}
            onChange={e => onMemberQueryChange(e.target.value)}
            placeholder="搜寻好友（昵称 / Peer ID）"
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

          {memberIds.size > 0 ? (
            <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
              {Array.from(memberIds)
                .slice(0, 12)
                .map(peerId => {
                  const c = contacts.find(x => x.id === peerId);
                  const label = c ? c.name : shortPeer(peerId);
                  return (
                    <button
                      key={peerId}
                      type="button"
                      onClick={() =>
                        setMemberIds(prev => {
                          const next = new Set(prev);
                          next.delete(peerId);
                          return next;
                        })
                      }
                      style={{
                        padding: "6px 10px",
                        borderRadius: 999,
                        border: "1px solid rgba(255,255,255,0.14)",
                        background: "rgba(255,255,255,0.06)",
                        color: "#e5e7eb",
                        cursor: "pointer",
                        fontSize: 12
                      }}
                      title="点击移除"
                    >
                      {label} ×
                    </button>
                  );
                })}
              {memberIds.size > 12 ? (
                <div style={{ fontSize: 12, opacity: 0.7, padding: "6px 2px" }}>
                  +{memberIds.size - 12}
                </div>
              ) : null}
            </div>
          ) : (
            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
              尚未选择成员（可不选，先建群后再邀请）
            </div>
          )}

          <div
            style={{
              marginTop: 10,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.10)",
              overflow: "hidden"
            }}
          >
            <div style={{ maxHeight: 220, overflowY: "auto" }}>
              {contacts
                .filter(c => {
                  const q = memberQuery.trim().toLowerCase();
                  if (!q) return true;
                  return (
                    (c.name || "").toLowerCase().includes(q) ||
                    (c.remark || "").toLowerCase().includes(q) ||
                    (c.remoteNickname || "").toLowerCase().includes(q) ||
                    (c.id || "").toLowerCase().includes(q)
                  );
                })
                .map(c => {
                  const checked = memberIds.has(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() =>
                        setMemberIds(prev => {
                          const next = new Set(prev);
                          if (next.has(c.id)) next.delete(c.id);
                          else next.add(c.id);
                          return next;
                        })
                      }
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 12px",
                        border: "none",
                        borderBottom: "1px solid rgba(255,255,255,0.06)",
                        background: checked ? "rgba(88,166,255,0.10)" : "transparent",
                        color: "#e5e7eb",
                        cursor: "pointer",
                        textAlign: "left"
                      }}
                    >
                      <div
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 6,
                          border: "1px solid rgba(255,255,255,0.18)",
                          background: checked ? "#58a6ff" : "transparent",
                          flexShrink: 0
                        }}
                      />
                      <FallbackAvatar
                        name={c.name}
                        size="sm"
                        src={resolveAvatarSrc(c.avatarUrl)}
                      />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontWeight: 700,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap"
                          }}
                        >
                          {c.name}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            opacity: 0.7,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap"
                          }}
                        >
                          {shortPeer(c.id)}
                        </div>
                      </div>
                    </button>
                  );
                })}
              {contacts.length === 0 ? (
                <div style={{ padding: 12, fontSize: 12, opacity: 0.7 }}>
                  目前没有好友可选
                </div>
              ) : null}
            </div>
          </div>
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
            disabled={actionBusy === "createGroup"}
            onClick={onCreateGroup}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "none",
              background: "#58a6ff",
              color: "#08111c",
              fontWeight: 800,
              cursor: actionBusy === "createGroup" ? "not-allowed" : "pointer",
              opacity: actionBusy === "createGroup" ? 0.7 : 1
            }}
          >
            {actionBusy === "createGroup" ? "建立中…" : "建立群聊"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
