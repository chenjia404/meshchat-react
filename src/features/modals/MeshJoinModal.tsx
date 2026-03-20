import React from "react";
import { Modal } from "../../components/Modal";
import { FallbackAvatar } from "../../components/FallbackAvatar";
import type { MeshserverChannelRaw, MeshserverConnectionRaw, MeshserverServerRaw } from "../../types";
import { shortPeer } from "../../utils";

export type MeshJoinStep = "peer" | "server" | "channel";

export interface MeshJoinModalProps {
  open: boolean;
  onClose: () => void;
  meshJoinStep: MeshJoinStep;
  setMeshJoinStep: React.Dispatch<React.SetStateAction<MeshJoinStep>>;
  meshPeerIdDraft: string;
  setMeshPeerIdDraft: React.Dispatch<React.SetStateAction<string>>;
  actionBusy: string | null;
  setActionBusy: React.Dispatch<React.SetStateAction<string | null>>;
  meshConnection: MeshserverConnectionRaw | null;
  setMeshConnection: React.Dispatch<React.SetStateAction<MeshserverConnectionRaw | null>>;
  meshCanCreateSpace: boolean | null;
  meshCreateSpaceName: string;
  setMeshCreateSpaceName: React.Dispatch<React.SetStateAction<string>>;
  meshCreateSpaceDesc: string;
  setMeshCreateSpaceDesc: React.Dispatch<React.SetStateAction<string>>;
  meshCreateSpaceVisibility: "public" | "private";
  setMeshCreateSpaceVisibility: React.Dispatch<React.SetStateAction<"public" | "private">>;
  meshServers: MeshserverServerRaw[];
  meshSelectedSpaceId: string;
  setMeshSelectedSpaceId: React.Dispatch<React.SetStateAction<string>>;
  meshChannels: MeshserverChannelRaw[];
  meshMyPermissions: { can_create_channel?: boolean } | null;
  meshCreateChannelType: 1 | 2;
  setMeshCreateChannelType: React.Dispatch<React.SetStateAction<1 | 2>>;
  meshCreateChannelName: string;
  setMeshCreateChannelName: React.Dispatch<React.SetStateAction<string>>;
  meshCreateChannelDesc: string;
  setMeshCreateChannelDesc: React.Dispatch<React.SetStateAction<string>>;
  meshCreateChannelVisibility: "public" | "private";
  setMeshCreateChannelVisibility: React.Dispatch<React.SetStateAction<"public" | "private">>;
  meshCreateChannelSlowModeSeconds: number;
  setMeshCreateChannelSlowModeSeconds: React.Dispatch<React.SetStateAction<number>>;
  connectMeshserver: (peerId: string) => Promise<MeshserverConnectionRaw>;
  loadSpaces: (connectionName: string) => Promise<void>;
  loadMeshCanCreateSpace: (connectionName: string) => Promise<void>;
  createMeshSpaceAndMaybeSelect: () => void | Promise<void>;
  loadMeshChannels: (serverId: string, connectionName: string) => Promise<void>;
  loadMeshMyPermissions: (serverId: string, connectionName: string) => Promise<void>;
  joinMeshChannel: (channel: MeshserverChannelRaw) => Promise<void>;
  createMeshChannelAndMaybeJoin: () => Promise<void>;
  resolveAvatarSrc: (src?: string) => string | undefined;
}

export function MeshJoinModal(props: MeshJoinModalProps) {
  const {
    open,
    onClose,
    meshJoinStep,
    setMeshJoinStep,
    meshPeerIdDraft,
    setMeshPeerIdDraft,
    actionBusy,
    setActionBusy,
    meshConnection,
    setMeshConnection,
    meshCanCreateSpace,
    meshCreateSpaceName,
    setMeshCreateSpaceName,
    meshCreateSpaceDesc,
    setMeshCreateSpaceDesc,
    meshCreateSpaceVisibility,
    setMeshCreateSpaceVisibility,
    meshServers,
    meshSelectedSpaceId,
    setMeshSelectedSpaceId,
    meshChannels,
    meshMyPermissions,
    meshCreateChannelType,
    setMeshCreateChannelType,
    meshCreateChannelName,
    setMeshCreateChannelName,
    meshCreateChannelDesc,
    setMeshCreateChannelDesc,
    meshCreateChannelVisibility,
    setMeshCreateChannelVisibility,
    meshCreateChannelSlowModeSeconds,
    setMeshCreateChannelSlowModeSeconds,
    connectMeshserver,
    loadSpaces,
    loadMeshCanCreateSpace,
    createMeshSpaceAndMaybeSelect,
    loadMeshChannels,
    loadMeshMyPermissions,
    joinMeshChannel,
    createMeshChannelAndMaybeJoin,
    resolveAvatarSrc
  } = props;

  return (
    <Modal open={open} onClose={onClose} title="加入space">
      <div>
        {meshJoinStep === "peer" ? (
          <>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 10 }}>
              输入你要连接的 meshserver 的 <code>peer_id</code>，连接成功后会拉取服务器与频道列表。
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 13, marginBottom: 6 }}>meshserver Peer ID</div>
              <input
                value={meshPeerIdDraft}
                onChange={e => setMeshPeerIdDraft(e.target.value)}
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
                disabled={actionBusy === "meshJoinConnect"}
                onClick={async () => {
                  const peerId = meshPeerIdDraft.trim();
                  if (!peerId) return;
                  setActionBusy("meshJoinConnect");
                  try {
                    const conn = await connectMeshserver(peerId);
                    setMeshConnection(conn);
                    await loadSpaces(conn.name);
                    await loadMeshCanCreateSpace(conn.name);
                    setMeshJoinStep("server");
                  } catch (err: any) {
                    alert("连接 meshserver 失败：" + (err?.message || String(err)));
                  } finally {
                    setActionBusy(null);
                  }
                }}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "none",
                  background: "#58a6ff",
                  color: "#08111c",
                  fontWeight: 800,
                  cursor: actionBusy === "meshJoinConnect" ? "not-allowed" : "pointer",
                  opacity: actionBusy === "meshJoinConnect" ? 0.7 : 1
                }}
              >
                {actionBusy === "meshJoinConnect" ? "连接中…" : "连接并选择服务器"}
              </button>
            </div>
          </>
        ) : null}

        {meshJoinStep === "server" ? (
          <>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 10 }}>
              选择space后，会加载该space的频道列表。
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
              <button
                type="button"
                onClick={() => setMeshJoinStep("peer")}
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "transparent",
                  color: "#e5e7eb",
                  cursor: "pointer"
                }}
              >
                返回
              </button>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                connection：{meshConnection?.name || "-"}
              </div>
            </div>

            {meshCanCreateSpace ? (
              <div
                style={{
                  padding: "12px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.10)",
                  marginBottom: 10
                }}
              >
                <div style={{ fontWeight: 900, marginBottom: 8 }}>创建 space</div>
                <div style={{ marginBottom: 10, fontSize: 12, opacity: 0.75 }}>
                  输入名称后会创建并直接进入该 space 的频道选择。
                </div>

                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>名称</div>
                  <input
                    value={meshCreateSpaceName}
                    onChange={e => setMeshCreateSpaceName(e.target.value)}
                    placeholder="例如：我的 space"
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

                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>描述（可选）</div>
                  <textarea
                    value={meshCreateSpaceDesc}
                    onChange={e => setMeshCreateSpaceDesc(e.target.value)}
                    placeholder="一段简短描述"
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
                </div>

                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>可见性</div>
                  <select
                    value={meshCreateSpaceVisibility}
                    onChange={e =>
                      setMeshCreateSpaceVisibility(e.target.value as "public" | "private")
                    }
                    style={{
                      width: "100%",
                      padding: "10px 10px",
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.16)",
                      background: "rgba(0,0,0,0.18)",
                      color: "#e5e7eb",
                      outline: "none"
                    }}
                  >
                    <option value="public">public</option>
                    <option value="private">private</option>
                  </select>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setMeshCreateSpaceName("");
                      setMeshCreateSpaceDesc("");
                      setMeshCreateSpaceVisibility("public");
                    }}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.14)",
                      background: "transparent",
                      color: "#e5e7eb",
                      cursor: "pointer"
                    }}
                    disabled={actionBusy === "meshCreateSpace"}
                  >
                    清空
                  </button>

                  <button
                    type="button"
                    onClick={createMeshSpaceAndMaybeSelect}
                    disabled={actionBusy === "meshCreateSpace"}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "none",
                      background: "#58a6ff",
                      color: "#08111c",
                      fontWeight: 900,
                      cursor:
                        actionBusy === "meshCreateSpace" ? "not-allowed" : "pointer",
                      opacity: actionBusy === "meshCreateSpace" ? 0.7 : 1
                    }}
                  >
                    {actionBusy === "meshCreateSpace" ? "创建中…" : "创建并选择频道"}
                  </button>
                </div>
              </div>
            ) : null}

            <div style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.10)", overflow: "hidden" }}>
              <div style={{ maxHeight: 280, overflowY: "auto" }}>
                {meshServers.length === 0 ? (
                  <div style={{ padding: 12, fontSize: 12, opacity: 0.7 }}>暂无space</div>
                ) : (
                  meshServers.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={async () => {
                        if (!meshConnection) return;
                        setMeshSelectedSpaceId(s.id);
                        setActionBusy("meshJoinLoadChannels");
                        try {
                          await loadMeshChannels(s.id, meshConnection.name);
                          await loadMeshMyPermissions(s.id, meshConnection.name);
                          setMeshJoinStep("channel");
                        } catch (err: any) {
                          alert("加载频道失败：" + (err?.message || String(err)));
                        } finally {
                          setActionBusy(null);
                        }
                      }}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "12px 12px",
                        border: "none",
                        borderBottom: "1px solid rgba(255,255,255,0.06)",
                        background: "transparent",
                        color: "#e5e7eb",
                        cursor: "pointer",
                        textAlign: "left"
                      }}
                    >
                      <FallbackAvatar
                        name={s.name || shortPeer(s.id)}
                        size="sm"
                        src={resolveAvatarSrc((s.avatar_url || "").trim())}
                      />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontWeight: 800,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap"
                          }}
                        >
                          {s.name || "未命名服务器"}
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
                          {s.id} {typeof s.visibility === "number" ? `· visibility:${s.visibility}` : ""}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.7, flexShrink: 0 }}>
                        {actionBusy === "meshJoinLoadChannels" && meshSelectedSpaceId === s.id
                          ? "加载中…"
                          : "选择"}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </>
        ) : null}

        {meshJoinStep === "channel" ? (
          <>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 10 }}>
              选择一个频道加入（群/广播）。
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
              <button
                type="button"
                onClick={() => setMeshJoinStep("server")}
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "transparent",
                  color: "#e5e7eb",
                  cursor: "pointer"
                }}
              >
                返回
              </button>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                space：{meshSelectedSpaceId || "-"}
              </div>
            </div>

            {meshMyPermissions?.can_create_channel ? (
              <div
                style={{
                  padding: "12px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.10)",
                  marginBottom: 10
                }}
              >
                <div style={{ fontWeight: 900, marginBottom: 8 }}>创建频道</div>
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <button
                    type="button"
                    onClick={() => setMeshCreateChannelType(1)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.14)",
                      background: meshCreateChannelType === 1 ? "rgba(88,166,255,0.18)" : "transparent",
                      color: "#e5e7eb",
                      cursor: "pointer",
                      fontWeight: 800,
                      flex: 1
                    }}
                  >
                    群(1)
                  </button>
                  <button
                    type="button"
                    onClick={() => setMeshCreateChannelType(2)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.14)",
                      background: meshCreateChannelType === 2 ? "rgba(88,166,255,0.18)" : "transparent",
                      color: "#e5e7eb",
                      cursor: "pointer",
                      fontWeight: 800,
                      flex: 1
                    }}
                  >
                    广播(2)
                  </button>
                </div>

                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>名称</div>
                  <input
                    value={meshCreateChannelName}
                    onChange={e => setMeshCreateChannelName(e.target.value)}
                    placeholder="例如：我的频道"
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

                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>描述（可选）</div>
                  <textarea
                    value={meshCreateChannelDesc}
                    onChange={e => setMeshCreateChannelDesc(e.target.value)}
                    placeholder="一段简短描述"
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
                </div>

                <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>可见性</div>
                    <select
                      value={meshCreateChannelVisibility}
                      onChange={e =>
                        setMeshCreateChannelVisibility(e.target.value as "public" | "private")
                      }
                      style={{
                        width: "100%",
                        padding: "10px 10px",
                        borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.16)",
                        background: "rgba(0,0,0,0.18)",
                        color: "#e5e7eb",
                        outline: "none"
                      }}
                    >
                      <option value="public">public</option>
                      <option value="private">private</option>
                    </select>
                  </div>
                  <div style={{ width: 140 }}>
                    <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>慢速模式(s)</div>
                    <input
                      type="number"
                      value={meshCreateChannelSlowModeSeconds}
                      onChange={e => setMeshCreateChannelSlowModeSeconds(Number(e.target.value))}
                      min={0}
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
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setMeshCreateChannelName("");
                      setMeshCreateChannelDesc("");
                      setMeshCreateChannelType(1);
                      setMeshCreateChannelVisibility("public");
                      setMeshCreateChannelSlowModeSeconds(0);
                    }}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.14)",
                      background: "transparent",
                      color: "#e5e7eb",
                      cursor: "pointer"
                    }}
                    disabled={actionBusy === "meshCreateChannel"}
                  >
                    清空
                  </button>
                  <button
                    type="button"
                    onClick={createMeshChannelAndMaybeJoin}
                    disabled={actionBusy === "meshCreateChannel"}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "none",
                      background: "#58a6ff",
                      color: "#08111c",
                      fontWeight: 900,
                      cursor: actionBusy === "meshCreateChannel" ? "not-allowed" : "pointer",
                      opacity: actionBusy === "meshCreateChannel" ? 0.7 : 1
                    }}
                  >
                    {actionBusy === "meshCreateChannel" ? "创建中…" : "创建并加入"}
                  </button>
                </div>
              </div>
            ) : null}

            <div style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.10)", overflow: "hidden" }}>
              <div style={{ maxHeight: 320, overflowY: "auto" }}>
                {meshChannels.length === 0 ? (
                  <div style={{ padding: 12, fontSize: 12, opacity: 0.7 }}>暂无频道</div>
                ) : (
                  (() => {
                    const channels = meshChannels.slice();
                    if (channels.length === 0) {
                      return (
                        <div style={{ padding: 12, fontSize: 12, opacity: 0.7 }}>
                          暂无可显示的频道
                        </div>
                      );
                    }
                    return channels.map(ch => {
                      const channelId = ch.channel_id || "";
                      const channelType = Number(ch.type);
                      const typeLabel =
                        channelType === 1
                          ? "群(1)"
                          : channelType === 2
                            ? "广播(2)"
                            : `type=${channelType || "-"}`;
                      return (
                        <div
                          key={channelId || ch.server_id}
                          style={{
                            padding: "12px 12px",
                            borderBottom: "1px solid rgba(255,255,255,0.06)",
                            cursor: "pointer"
                          }}
                          role="button"
                          tabIndex={0}
                          onClick={() => joinMeshChannel(ch)}
                          onKeyDown={e => {
                            if (e.key === "Enter" || e.key === " ") joinMeshChannel(ch);
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 10
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 10,
                                minWidth: 0
                              }}
                            >
                              <FallbackAvatar
                                name={ch.name || shortPeer(channelId)}
                                size="sm"
                                src={resolveAvatarSrc(
                                  (
                                    meshServers.find(srv => srv.id === ch.server_id)?.avatar_url ||
                                    ""
                                  ).trim()
                                )}
                              />
                              <div style={{ minWidth: 0 }}>
                                <div
                                  style={{
                                    fontWeight: 800,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap"
                                  }}
                                >
                                  {ch.name || "未命名群"}
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
                                  {channelId}
                                </div>
                              </div>
                              <div
                                style={{
                                  fontSize: 11,
                                  opacity: 0.85,
                                  padding: "4px 8px",
                                  borderRadius: 999,
                                  border: "1px solid rgba(255,255,255,0.12)",
                                  flexShrink: 0
                                }}
                              >
                                {typeLabel}
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={actionBusy === "meshJoin"}
                              onClick={e => {
                                e.stopPropagation();
                                joinMeshChannel(ch);
                              }}
                              style={{
                                padding: "8px 12px",
                                borderRadius: 10,
                                border: "none",
                                background: "#58a6ff",
                                color: "#08111c",
                                fontWeight: 800,
                                cursor:
                                  actionBusy === "meshJoin" ? "not-allowed" : "pointer",
                                opacity: actionBusy === "meshJoin" ? 0.7 : 1,
                                flexShrink: 0
                              }}
                            >
                              {actionBusy === "meshJoin" ? "加入中…" : "加入"}
                            </button>
                          </div>
                          {ch.description ? (
                            <div
                              style={{
                                fontSize: 12,
                                opacity: 0.75,
                                marginTop: 6,
                                whiteSpace: "pre-wrap",
                                overflowWrap: "anywhere",
                                wordBreak: "break-word"
                              }}
                            >
                              {ch.description}
                            </div>
                          ) : null}
                        </div>
                      );
                    });
                  })()
                )}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  );
}
