import React from "react";
import { Modal } from "../../components/Modal";
import { FallbackAvatar } from "../../components/FallbackAvatar";
import type { ThreadKind } from "../../types";
import { shortPeer } from "../../utils";
import type { ContactViewRow } from "../../types";

export interface GroupProfileModalProps {
  open: boolean;
  isMobile: boolean;
  onClose: () => void;
  selectedThreadKind: ThreadKind;
  selectedThreadId: string | null;
  groupTitleDraft: string;
  onGroupTitleDraftChange: (v: string) => void;
  localGroupRole: string | null;
  groupInviteQuery: string;
  onGroupInviteQueryChange: (v: string) => void;
  groupInviteIds: Set<string>;
  setGroupInviteIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  contacts: ContactViewRow[];
  groupDissolveReason: string;
  onGroupDissolveReasonChange: (v: string) => void;
  actionBusy: string | null;
  onUpdateGroupTitle: (groupId: string) => void;
  onInviteGroupMembers: (groupId: string) => void;
  onDissolveGroup: (groupId: string) => void;
  resolveAvatarSrc: (src?: string) => string | undefined;
}

export function GroupProfileModal({
  open,
  isMobile,
  onClose,
  selectedThreadKind,
  selectedThreadId,
  groupTitleDraft,
  onGroupTitleDraftChange,
  localGroupRole,
  groupInviteQuery,
  onGroupInviteQueryChange,
  groupInviteIds,
  setGroupInviteIds,
  contacts,
  groupDissolveReason,
  onGroupDissolveReasonChange,
  actionBusy,
  onUpdateGroupTitle,
  onInviteGroupMembers,
  onDissolveGroup,
  resolveAvatarSrc
}: GroupProfileModalProps) {
  const groupProfileBody = (
    <div>
      {selectedThreadKind === "group" && selectedThreadId ? (
        <>
          <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 10 }}>
            群 ID：<code>{selectedThreadId}</code>
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, marginBottom: 6 }}>群名称</div>
            <input
              value={groupTitleDraft}
              onChange={e => onGroupTitleDraftChange(e.target.value)}
              disabled={!(localGroupRole === "admin" || localGroupRole === "controller")}
              placeholder="群名称"
              style={{
                width: "100%",
                padding: "10px 10px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.16)",
                background: "rgba(0,0,0,0.18)",
                color: "#e5e7eb",
                outline: "none",
                opacity:
                  localGroupRole === "admin" || localGroupRole === "controller" ? 1 : 0.6
              }}
            />
            {localGroupRole === "admin" || localGroupRole === "controller" ? (
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                <button
                  type="button"
                  disabled={actionBusy === "groupTitle"}
                  onClick={() => onUpdateGroupTitle(selectedThreadId)}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "none",
                    background: "#58a6ff",
                    color: "#08111c",
                    fontWeight: 900,
                    cursor: actionBusy === "groupTitle" ? "not-allowed" : "pointer",
                    opacity: actionBusy === "groupTitle" ? 0.7 : 1
                  }}
                >
                  {actionBusy === "groupTitle" ? "保存中…" : "保存群名称"}
                </button>
              </div>
            ) : (
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>
                你不是管理员，无法修改群名称
              </div>
            )}
          </div>

          {localGroupRole === "admin" || localGroupRole === "controller" ? (
            <>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 13, marginBottom: 6 }}>
                  邀请好友进群（从好友中选择）
                </div>
                <input
                  value={groupInviteQuery}
                  onChange={e => onGroupInviteQueryChange(e.target.value)}
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

                {groupInviteIds.size > 0 ? (
                  <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {Array.from(groupInviteIds)
                      .slice(0, 12)
                      .map(peerId => {
                        const c = contacts.find(x => x.id === peerId);
                        const label = c ? c.name : shortPeer(peerId);
                        return (
                          <button
                            key={peerId}
                            type="button"
                            onClick={() =>
                              setGroupInviteIds(prev => {
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
                    {groupInviteIds.size > 12 ? (
                      <div style={{ fontSize: 12, opacity: 0.7, padding: "6px 2px" }}>
                        +{groupInviteIds.size - 12}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
                    尚未选择要邀请的好友
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
                        const q = groupInviteQuery.trim().toLowerCase();
                        if (!q) return true;
                        return (
                          (c.name || "").toLowerCase().includes(q) ||
                          (c.remark || "").toLowerCase().includes(q) ||
                          (c.remoteNickname || "").toLowerCase().includes(q) ||
                          (c.id || "").toLowerCase().includes(q)
                        );
                      })
                      .map(c => {
                        const checked = groupInviteIds.has(c.id);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() =>
                              setGroupInviteIds(prev => {
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

                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 10,
                    marginTop: 12
                  }}
                >
                  <button
                    type="button"
                    disabled={actionBusy === "groupInvite"}
                    onClick={() => onInviteGroupMembers(selectedThreadId)}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "none",
                      background: "#58a6ff",
                      color: "#08111c",
                      fontWeight: 900,
                      cursor: actionBusy === "groupInvite" ? "not-allowed" : "pointer",
                      opacity: actionBusy === "groupInvite" ? 0.7 : 1
                    }}
                  >
                    {actionBusy === "groupInvite" ? "邀请中…" : "发送邀请"}
                  </button>
                </div>
              </div>

              <div
                style={{
                  marginTop: 16,
                  borderTop: "1px solid rgba(255,255,255,0.08)",
                  paddingTop: 14
                }}
              >
                <div
                  style={{
                    fontSize: 13,
                    marginBottom: 6,
                    color: "#fca5a5",
                    fontWeight: 900
                  }}
                >
                  解散群
                </div>
                <textarea
                  value={groupDissolveReason}
                  onChange={e => onGroupDissolveReasonChange(e.target.value)}
                  placeholder="解散原因（可选）"
                  style={{
                    width: "100%",
                    padding: "10px 10px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.16)",
                    background: "rgba(0,0,0,0.18)",
                    color: "#e5e7eb",
                    outline: "none",
                    minHeight: 70,
                    resize: "vertical"
                  }}
                />
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                  <button
                    type="button"
                    disabled={actionBusy === "groupDissolve"}
                    onClick={() => onDissolveGroup(selectedThreadId)}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "none",
                      background: "#f85149",
                      color: "#08111c",
                      fontWeight: 900,
                      cursor:
                        actionBusy === "groupDissolve" ? "not-allowed" : "pointer",
                      opacity: actionBusy === "groupDissolve" ? 0.7 : 1
                    }}
                  >
                    {actionBusy === "groupDissolve" ? "解散中…" : "解散群"}
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </>
      ) : (
        <div style={{ fontSize: 12, opacity: 0.75 }}>
          请先进入一个群会话再打开群资料。
        </div>
      )}
    </div>
  );

  if (open && isMobile) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 10000,
          background: "rgba(8,17,28,0.98)",
          display: "flex",
          flexDirection: "column"
        }}
      >
        <div
          style={{
            padding: "10px 12px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            alignItems: "center",
            gap: 10
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "transparent",
              color: "#e5e7eb",
              cursor: "pointer"
            }}
          >
            返回
          </button>
          <div style={{ fontWeight: 900 }}>群资料</div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>{groupProfileBody}</div>
      </div>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="群资料">
      {groupProfileBody}
    </Modal>
  );
}
