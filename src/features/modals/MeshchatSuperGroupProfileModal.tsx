import React from "react";
import { Modal } from "../../components/Modal";
import { FallbackAvatar } from "../../components/FallbackAvatar";
import {
  buildMeshchatIpfsUrl,
  formatMeshchatGroupInviteLink,
  meshchatGroupIsAdmin
} from "../../utils/meshchatApi";
import { shortPeer } from "../../utils";
import type { ContactViewRow, MeshchatGroupSummary } from "../../types";

export interface MeshchatSuperGroupProfileModalProps {
  open: boolean;
  isMobile: boolean;
  onClose: () => void;
  loading: boolean;
  error: string | null;
  serverBase: string;
  groupId: string;
  group: MeshchatGroupSummary | null;
  myUserId?: number;
  titleDraft: string;
  onTitleDraftChange: (v: string) => void;
  aboutDraft: string;
  onAboutDraftChange: (v: string) => void;
  inviteQuery: string;
  onInviteQueryChange: (v: string) => void;
  inviteIds: Set<string>;
  setInviteIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  contacts: ContactViewRow[];
  actionBusy: string | null;
  onSave: () => void;
  onInvite: () => void;
  /** 退出当前超级群（本机先移除，再异步请求服务端） */
  onLeave: () => void;
  resolveAvatarSrc: (src?: string) => string | undefined;
}

export function MeshchatSuperGroupProfileModal(props: MeshchatSuperGroupProfileModalProps) {
  const {
    open,
    isMobile,
    onClose,
    loading,
    error,
    serverBase,
    groupId,
    group,
    myUserId,
    titleDraft,
    onTitleDraftChange,
    aboutDraft,
    onAboutDraftChange,
    inviteQuery,
    onInviteQueryChange,
    inviteIds,
    setInviteIds,
    contacts,
    actionBusy,
    onSave,
    onInvite,
    onLeave,
    resolveAvatarSrc
  } = props;
  const inviteLink = formatMeshchatGroupInviteLink(serverBase, groupId);
  const isAdmin = group ? meshchatGroupIsAdmin(group, myUserId) : false;
  const avatarCid =
    typeof group?.avatar_cid === "string" ? group.avatar_cid.trim() : "";

  const body = (
    <div>
      {loading ? (
        <div style={{ fontSize: 13, opacity: 0.75 }}>载入中…</div>
      ) : null}
      {error ? (
        <div style={{ fontSize: 13, color: "#fca5a5", marginBottom: 10 }}>{error}</div>
      ) : null}

      <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 10 }}>
        群 ID：<code>{groupId}</code>
      </div>
      <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 14 }}>
        服务器：<code style={{ wordBreak: "break-all" }}>{serverBase}</code>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <FallbackAvatar
          name={titleDraft || "群"}
          size="lg"
          src={resolveAvatarSrc(avatarCid ? buildMeshchatIpfsUrl(avatarCid) : undefined)}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{titleDraft || "超级群聊"}</div>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>超级群</div>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13, marginBottom: 6 }}>群链接</div>
        <div
          style={{
            padding: "10px 10px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(0,0,0,0.2)",
            fontSize: 12,
            wordBreak: "break-all",
            marginBottom: 8
          }}
        >
          {inviteLink}
        </div>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(inviteLink);
              alert("已复制群链接");
            } catch {
              alert("复制失败，请手动选择复制");
            }
          }}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(88,166,255,0.12)",
            color: "#e5e7eb",
            cursor: "pointer",
            fontWeight: 700
          }}
        >
          复制群链接
        </button>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13, marginBottom: 6 }}>群名称</div>
        <input
          value={titleDraft}
          onChange={e => onTitleDraftChange(e.target.value)}
          disabled={!isAdmin}
          placeholder="群名称"
          style={{
            width: "100%",
            padding: "10px 10px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.16)",
            background: "rgba(0,0,0,0.18)",
            color: "#e5e7eb",
            outline: "none",
            opacity: isAdmin ? 1 : 0.65
          }}
        />
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 13, marginBottom: 6 }}>群介绍</div>
        <textarea
          value={aboutDraft}
          onChange={e => onAboutDraftChange(e.target.value)}
          disabled={!isAdmin}
          placeholder="群介绍"
          rows={4}
          style={{
            width: "100%",
            padding: "10px 10px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.16)",
            background: "rgba(0,0,0,0.18)",
            color: "#e5e7eb",
            outline: "none",
            resize: "vertical",
            opacity: isAdmin ? 1 : 0.65
          }}
        />
      </div>

      {isAdmin ? (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
          <button
            type="button"
            disabled={actionBusy === "meshchatProfileSave"}
            onClick={onSave}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "none",
              background: "#58a6ff",
              color: "#08111c",
              fontWeight: 900,
              cursor: actionBusy === "meshchatProfileSave" ? "not-allowed" : "pointer",
              opacity: actionBusy === "meshchatProfileSave" ? 0.7 : 1
            }}
          >
            {actionBusy === "meshchatProfileSave" ? "保存中…" : "保存资料"}
          </button>
        </div>
      ) : (
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 16 }}>
          仅管理员可修改群名称与群介绍；若服务端未返回角色字段，可能无法显示管理入口。
        </div>
      )}

      {isAdmin ? (
        <>
          <div
            style={{
              marginTop: 8,
              marginBottom: 12,
              borderTop: "1px solid rgba(255,255,255,0.08)",
              paddingTop: 14
            }}
          >
            <div style={{ fontSize: 13, marginBottom: 6 }}>邀请好友入群（多选）</div>
            <input
              value={inviteQuery}
              onChange={e => onInviteQueryChange(e.target.value)}
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

            {inviteIds.size > 0 ? (
              <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {Array.from(inviteIds)
                  .slice(0, 12)
                  .map(peerId => {
                    const c = contacts.find(x => x.id === peerId);
                    const label = c ? c.name : shortPeer(peerId);
                    return (
                      <button
                        key={peerId}
                        type="button"
                        onClick={() =>
                          setInviteIds(prev => {
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
                {inviteIds.size > 12 ? (
                  <div style={{ fontSize: 12, opacity: 0.7, padding: "6px 2px" }}>
                    +{inviteIds.size - 12}
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
                    const q = inviteQuery.trim().toLowerCase();
                    if (!q) return true;
                    return (
                      (c.name || "").toLowerCase().includes(q) ||
                      (c.remark || "").toLowerCase().includes(q) ||
                      (c.remoteNickname || "").toLowerCase().includes(q) ||
                      (c.id || "").toLowerCase().includes(q)
                    );
                  })
                  .map(c => {
                    const checked = inviteIds.has(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() =>
                          setInviteIds(prev => {
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
                disabled={actionBusy === "meshchatInvite"}
                onClick={onInvite}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "none",
                  background: "#58a6ff",
                  color: "#08111c",
                  fontWeight: 900,
                  cursor: actionBusy === "meshchatInvite" ? "not-allowed" : "pointer",
                  opacity: actionBusy === "meshchatInvite" ? 0.7 : 1
                }}
              >
                {actionBusy === "meshchatInvite" ? "邀请中…" : "发送邀请"}
              </button>
            </div>
          </div>
        </>
      ) : null}

      <div
        style={{
          marginTop: 20,
          paddingTop: 16,
          borderTop: "1px solid rgba(248,113,113,0.25)"
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: "#fca5a5" }}>
          退出群聊
        </div>
        <div style={{ fontSize: 12, opacity: 0.72, marginBottom: 12, lineHeight: 1.5 }}>
          点击后将立刻从本机移除该会话；随后再尝试通知服务器。若服务器无响应，本机仍会删除会话。再次加入需使用群链接。群主须先在服务端转让群主。
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={onLeave}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid rgba(248,113,113,0.45)",
            background: "rgba(248,113,113,0.12)",
            color: "#fecaca",
            fontWeight: 800,
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.65 : 1
          }}
        >
          退出超级群
        </button>
      </div>
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
          <div style={{ fontWeight: 900 }}>超级群资料</div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>{body}</div>
      </div>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="超级群资料">
      {body}
    </Modal>
  );
}
