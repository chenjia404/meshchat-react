import React from "react";
import type { FriendRequestRaw } from "../../types";
import { FallbackAvatar } from "../../components/FallbackAvatar";
import { createListRowMenuHandlers } from "../../hooks/createListRowMenuHandlers";
import { shortPeer } from "../../utils/time";

export interface ContactRow {
  id: string;
  name: string;
  remark: string;
  remoteNickname: string;
  avatarUrl?: string;
  bio?: string;
  chatKexPub?: string;
  lastSeen?: string;
  blocked?: boolean;
}

export interface ContactsTabProps {
  myPeerId: string;
  requestsRaw: FriendRequestRaw[];
  contacts: ContactRow[];
  selectedContactId: string | null;
  setSelectedContactId: (id: string | null) => void;
  isMobile: boolean;
  contactsMobileView: "list" | "detail";
  setContactsMobileView: (v: "list" | "detail") => void;
  resolveAvatarSrc: (src?: string) => string | undefined;
  actionBusy: string | null;
  onAcceptRequest: (r: FriendRequestRaw) => void;
  onRejectRequest: (r: FriendRequestRaw) => void;
  openListItemMenuAt: (
    x: number,
    y: number,
    kind: "contact" | "conversation",
    id: string,
    title: string
  ) => void;
  selectedContact: ContactRow | null;
  contactRemarkDraft: string;
  setContactRemarkDraft: (v: string) => void;
  contactRemarkSaving: boolean;
  onSaveContactRemark: (id: string) => void;
  onToggleBlockContact: (id: string) => void;
  onStartChatFromContact: (id: string) => void;
}

export function ContactsTab({
  myPeerId,
  requestsRaw,
  contacts,
  selectedContactId,
  setSelectedContactId,
  isMobile,
  contactsMobileView,
  setContactsMobileView,
  resolveAvatarSrc,
  actionBusy,
  onAcceptRequest,
  onRejectRequest,
  openListItemMenuAt,
  selectedContact,
  contactRemarkDraft,
  setContactRemarkDraft,
  contactRemarkSaving,
  onSaveContactRemark,
  onToggleBlockContact,
  onStartChatFromContact
}: ContactsTabProps) {
  return (
    <div style={{ height: "100%", display: "flex" }}>
      {(() => {
        const pendingRequests = requestsRaw.filter(r => {
          const s = (r.state || "").toLowerCase();
          const isPending = !s || (s !== "accepted" && s !== "rejected" && s !== "denied");
          const toPeer = (r.to_peer_id || "").trim();
          const isInbound = !!myPeerId && toPeer === myPeerId;
          return isPending && isInbound;
        });

        const ContactList = (
          <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
            <div
              style={{
                padding: "12px 16px",
                display: "flex",
                alignItems: "center",
                gap: 10
              }}
            >
              <span style={{ fontWeight: 700 }}>联系人</span>
            </div>
            <div style={{ flex: 1, overflowY: "auto" }}>
              <div style={{ padding: "12px 16px 8px", fontWeight: 700 }}>好友添加请求</div>
              {pendingRequests.length === 0 ? (
                <div style={{ padding: "0 16px 12px", fontSize: 12, opacity: 0.7 }}>
                  暂无新的朋友请求
                </div>
              ) : (
                pendingRequests.map(r => {
                  const peerId = r.from_peer_id || "";
                  const title =
                    (r.remote_nickname || "").trim() ||
                    (r.nickname || "").trim() ||
                    shortPeer(peerId || r.request_id);
                  return (
                    <div
                      key={r.request_id}
                      style={{
                        margin: "0 16px 8px",
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: "1px solid rgba(255,255,255,0.10)",
                        background: "rgba(88,166,255,0.06)"
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <FallbackAvatar
                          name={title}
                          size="sm"
                          src={resolveAvatarSrc((r as any).avatar)}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontWeight: 800,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap"
                            }}
                          >
                            {title}
                          </div>
                          <div
                            style={{
                              fontSize: 12,
                              opacity: 0.75,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              marginTop: 2
                            }}
                            title={r.intro_text || ""}
                          >
                            {r.intro_text ? `申请：${r.intro_text}` : "暂无申请内容"}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                        <button
                          type="button"
                          disabled={actionBusy === "acceptRequest" || actionBusy === "rejectRequest"}
                          onClick={() => onAcceptRequest(r)}
                          style={{
                            flex: 1,
                            padding: "8px 10px",
                            borderRadius: 10,
                            border: "none",
                            background: "#58a6ff",
                            color: "#08111c",
                            fontWeight: 900,
                            cursor:
                              actionBusy === "acceptRequest" ? "not-allowed" : "pointer",
                            opacity: actionBusy === "acceptRequest" ? 0.7 : 1
                          }}
                        >
                          {actionBusy === "acceptRequest" ? "接受中…" : "接受"}
                        </button>
                        <button
                          type="button"
                          disabled={actionBusy === "acceptRequest" || actionBusy === "rejectRequest"}
                          onClick={() => onRejectRequest(r)}
                          style={{
                            flex: 1,
                            padding: "8px 10px",
                            borderRadius: 10,
                            border: "1px solid rgba(255,255,255,0.14)",
                            background: "transparent",
                            color: "#e5e7eb",
                            fontWeight: 800,
                            cursor:
                              actionBusy === "rejectRequest" ? "not-allowed" : "pointer",
                            opacity: actionBusy === "rejectRequest" ? 0.7 : 1
                          }}
                        >
                          {actionBusy === "rejectRequest" ? "拒绝中…" : "拒绝"}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}

              {contacts.map(c => (
                <div
                  key={c.id}
                  {...createListRowMenuHandlers((cx, cy) =>
                    openListItemMenuAt(cx, cy, "contact", c.id, c.name)
                  )}
                  onClick={() => {
                    setSelectedContactId(c.id);
                    if (isMobile) setContactsMobileView("detail");
                  }}
                  style={{
                    padding: "10px 16px",
                    cursor: "pointer",
                    background:
                      c.id === selectedContactId
                        ? "rgba(88,166,255,0.08)"
                        : "transparent",
                    borderBottom: "1px solid rgba(255,255,255,0.06)",
                    display: "flex",
                    alignItems: "center",
                    gap: 10
                  }}
                >
                  <FallbackAvatar
                    name={c.name}
                    size="sm"
                    src={resolveAvatarSrc((c as any).avatarUrl)}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>
                      {c.name}
                      {c.blocked && (
                        <span
                          style={{
                            color: "#f85149",
                            fontSize: 12,
                            marginLeft: 6
                          }}
                        >
                          已拉黑
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      备注：{c.remark || "（无）"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

        const ContactDetail = (
          <div
            style={{
              flex: 1,
              padding: "16px 20px",
              overflowY: "auto",
              minWidth: 0
            }}
          >
            {selectedContact ? (
              <>
                {isMobile ? (
                  <div style={{ marginBottom: 12 }}>
                    <button
                      type="button"
                      onClick={() => setContactsMobileView("list")}
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
                  </div>
                ) : null}

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    minWidth: 0
                  }}
                >
                  <FallbackAvatar
                    name={selectedContact.name}
                    size="lg"
                    src={resolveAvatarSrc((selectedContact as any).avatarUrl)}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>
                      {selectedContact.name}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        opacity: 0.8,
                        marginTop: 6,
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere",
                        wordBreak: "break-word"
                      }}
                    >
                      对方昵称：{selectedContact.remoteNickname || "（无）"}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        opacity: 0.8,
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere",
                        wordBreak: "break-word",
                        display: "flex",
                        alignItems: "center",
                        gap: 8
                      }}
                    >
                      <span>Peer ID：{selectedContact.id}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const id = selectedContact.id;
                          if (!id) return;
                          if (navigator.clipboard?.writeText) {
                            navigator.clipboard.writeText(id).catch(() => {});
                          } else {
                            try {
                              const ta = document.createElement("textarea");
                              ta.value = id;
                              ta.style.position = "fixed";
                              ta.style.left = "-9999px";
                              document.body.appendChild(ta);
                              ta.select();
                              document.execCommand("copy");
                              document.body.removeChild(ta);
                            } catch {
                              // ignore
                            }
                          }
                        }}
                        style={{
                          padding: "2px 6px",
                          borderRadius: 6,
                          border: "1px solid rgba(255,255,255,0.24)",
                          background: "transparent",
                          color: "#e5e7eb",
                          fontSize: 11,
                          cursor: "pointer",
                          flexShrink: 0
                        }}
                      >
                        复制
                      </button>
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        opacity: 0.8,
                        marginTop: 6,
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere",
                        wordBreak: "break-word",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 8
                      }}
                    >
                      <span style={{ flex: 1, minWidth: 0 }}>
                        Chat KEX：
                        {(selectedContact as { chatKexPub?: string }).chatKexPub || "-"}
                      </span>
                      {(selectedContact as { chatKexPub?: string }).chatKexPub ? (
                        <button
                          type="button"
                          onClick={() => {
                            const kex = (selectedContact as { chatKexPub?: string }).chatKexPub;
                            if (!kex) return;
                            if (navigator.clipboard?.writeText) {
                              navigator.clipboard.writeText(kex).catch(() => {});
                            } else {
                              try {
                                const ta = document.createElement("textarea");
                                ta.value = kex;
                                ta.style.position = "fixed";
                                ta.style.left = "-9999px";
                                document.body.appendChild(ta);
                                ta.select();
                                document.execCommand("copy");
                                document.body.removeChild(ta);
                              } catch {
                                // ignore
                              }
                            }
                          }}
                          style={{
                            padding: "2px 6px",
                            borderRadius: 6,
                            border: "1px solid rgba(255,255,255,0.24)",
                            background: "transparent",
                            color: "#e5e7eb",
                            fontSize: 11,
                            cursor: "pointer",
                            flexShrink: 0
                          }}
                        >
                          复制
                        </button>
                      ) : null}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        opacity: 0.8,
                        marginTop: 6,
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere",
                        wordBreak: "break-word"
                      }}
                    >
                      简介：
                      {(selectedContact as any).bio
                        ? (selectedContact as any).bio
                        : "（无）"}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
                      最后上线：{selectedContact.lastSeen || "-"}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 24 }}>
                  <div style={{ fontSize: 14, marginBottom: 4 }}>备注名</div>
                  <input
                    type="text"
                    value={contactRemarkDraft}
                    onChange={e => setContactRemarkDraft(e.target.value)}
                    onBlur={() => onSaveContactRemark(selectedContact.id)}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: 6,
                      border: "1px solid #ccc",
                      outline: "none"
                    }}
                  />
                  <div style={{ marginTop: 10 }}>
                    <button
                      style={{
                        padding: "8px 16px",
                        borderRadius: 6,
                        border: "none",
                        background: "#374151",
                        color: "#e5e7eb",
                        cursor: contactRemarkSaving ? "not-allowed" : "pointer",
                        opacity: contactRemarkSaving ? 0.7 : 1
                      }}
                      disabled={contactRemarkSaving}
                      onClick={() => onSaveContactRemark(selectedContact.id)}
                    >
                      {contactRemarkSaving ? "保存中…" : "保存备注"}
                    </button>
                  </div>
                </div>

                <div style={{ marginTop: 16 }}>
                  <button
                    style={{
                      padding: "8px 16px",
                      borderRadius: 6,
                      border: "none",
                      background: selectedContact.blocked ? "#444" : "#f85149",
                      color: "#fff",
                      cursor: "pointer",
                      marginRight: 8
                    }}
                    onClick={() => onToggleBlockContact(selectedContact.id)}
                  >
                    {selectedContact.blocked ? "解除拉黑" : "拉黑"}
                  </button>

                  <button
                    style={{
                      padding: "8px 16px",
                      borderRadius: 6,
                      border: "none",
                      background: "#58a6ff",
                      color: "#08111c",
                      cursor: "pointer"
                    }}
                    onClick={() => onStartChatFromContact(selectedContact.id)}
                  >
                    发起对话
                  </button>
                </div>
              </>
            ) : (
              <div
                style={{
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#888"
                }}
              >
                请先选择一位联系人
              </div>
            )}
          </div>
        );

        if (isMobile) {
          return (
            <div style={{ width: "100%", height: "100%" }}>
              {contactsMobileView === "detail" ? ContactDetail : ContactList}
            </div>
          );
        }

        return (
          <>
            <div
              style={{
                width: 280,
                borderRight: "1px solid rgba(0,0,0,0.1)",
                overflow: "hidden"
              }}
            >
              {ContactList}
            </div>
            {ContactDetail}
          </>
        );
      })()}
    </div>
  );
}
