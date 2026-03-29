import React from "react";
import { Modal } from "../../components/Modal";
import { FallbackAvatar } from "../../components/FallbackAvatar";
import type { PublicChannelProfileDetail } from "../../types";
import { copyTextToClipboard } from "../../utils/clipboard";
import { formatTimeFromUnixSec, shortPeer } from "../../utils";

export interface PublicChannelProfileModalProps {
  open: boolean;
  isMobile: boolean;
  onClose: () => void;
  loading: boolean;
  error: string | null;
  detail: PublicChannelProfileDetail | null;
  /** 当前用户是否为该频道 owner（可编辑资料） */
  isOwner: boolean;
  nameDraft: string;
  onNameDraftChange: (v: string) => void;
  bioDraft: string;
  onBioDraftChange: (v: string) => void;
  saveBusy: boolean;
  onSave: () => void;
  /** 非创建者：取消订阅当前频道 */
  unsubscribeBusy?: boolean;
  onUnsubscribe?: () => void | Promise<void>;
  resolveAvatarSrc: (src?: string) => string | undefined;
}

function CopyRow(props: {
  label: string;
  value: string;
  monospace?: boolean;
}) {
  const [hint, setHint] = React.useState<string | null>(null);
  const { label, value, monospace } = props;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 4 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 13,
            wordBreak: "break-all",
            ...(monospace ? { fontFamily: "ui-monospace, monospace" } : {})
          }}
          title={value}
        >
          {value || "—"}
        </div>
        {value ? (
          <button
            type="button"
            onClick={async () => {
              const ok = await copyTextToClipboard(value);
              setHint(ok ? "已复制" : "复制失败");
              window.setTimeout(() => setHint(null), 1600);
            }}
            style={{
              flexShrink: 0,
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.06)",
              color: "#e5e7eb",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600
            }}
          >
            复制
          </button>
        ) : null}
        {hint ? (
          <span style={{ fontSize: 12, opacity: 0.85, alignSelf: "center" }}>{hint}</span>
        ) : null}
      </div>
    </div>
  );
}

export function PublicChannelProfileModal({
  open,
  isMobile,
  onClose,
  loading,
  error,
  detail,
  isOwner,
  nameDraft,
  onNameDraftChange,
  bioDraft,
  onBioDraftChange,
  saveBusy,
  onSave,
  unsubscribeBusy,
  onUnsubscribe,
  resolveAvatarSrc
}: PublicChannelProfileModalProps) {
  const body = (
    <div>
      {loading ? (
        <div style={{ fontSize: 13, opacity: 0.8 }}>加载中…</div>
      ) : error ? (
        <div style={{ fontSize: 13, color: "#fca5a5" }}>{error}</div>
      ) : detail ? (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <FallbackAvatar
              name={detail.name}
              size="lg"
              src={resolveAvatarSrc(undefined)}
            />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{detail.name || "公开频道"}</div>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                {isOwner ? "你是创建者 · 可编辑资料" : "公开频道 · 只读资料"}
              </div>
            </div>
          </div>

          <CopyRow
            label="频道 ID（ownerPeerId:uuidv7）"
            value={detail.channelId}
            monospace
          />

          <CopyRow
            label="创建者 Peer ID"
            value={detail.ownerPeerId}
            monospace
          />
          {detail.ownerPeerId ? (
            <div style={{ fontSize: 12, opacity: 0.6, marginTop: -6, marginBottom: 12 }}>
              缩写：{shortPeer(detail.ownerPeerId)}
            </div>
          ) : null}

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, marginBottom: 6 }}>频道名称</div>
            {isOwner ? (
              <input
                value={nameDraft}
                onChange={e => onNameDraftChange(e.target.value)}
                placeholder="频道名称"
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
            ) : (
              <div style={{ fontSize: 14 }}>{detail.name}</div>
            )}
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, marginBottom: 6 }}>简介</div>
            {isOwner ? (
              <textarea
                value={bioDraft}
                onChange={e => onBioDraftChange(e.target.value)}
                placeholder="频道简介"
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
                  minHeight: 80
                }}
              />
            ) : (
              <div style={{ fontSize: 14, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {detail.bio?.trim() ? detail.bio : <span style={{ opacity: 0.5 }}>暂无简介</span>}
              </div>
            )}
          </div>

          <div
            style={{
              fontSize: 12,
              opacity: 0.75,
              borderTop: "1px solid rgba(255,255,255,0.08)",
              paddingTop: 12,
              display: "grid",
              gap: 6
            }}
          >
            {detail.ownerVersion != null ? (
              <div>owner_version：{detail.ownerVersion}</div>
            ) : null}
            {detail.profileVersion != null ? (
              <div>profile_version：{detail.profileVersion}</div>
            ) : null}
            {detail.createdAtSec != null ? (
              <div>创建时间：{formatTimeFromUnixSec(detail.createdAtSec)}</div>
            ) : null}
            <div>资料更新时间：{formatTimeFromUnixSec(detail.updatedAtSec)}</div>
            {detail.signatureBase64 ? (
              <div style={{ wordBreak: "break-all" }}>
                签名（只读）：{detail.signatureBase64.length > 48
                  ? `${detail.signatureBase64.slice(0, 48)}…`
                  : detail.signatureBase64}
              </div>
            ) : null}
          </div>

          {isOwner ? (
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button
                type="button"
                disabled={saveBusy}
                onClick={onSave}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "none",
                  background: "#58a6ff",
                  color: "#08111c",
                  fontWeight: 900,
                  cursor: saveBusy ? "not-allowed" : "pointer",
                  opacity: saveBusy ? 0.7 : 1
                }}
              >
                {saveBusy ? "保存中…" : "保存资料"}
              </button>
            </div>
          ) : (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, opacity: 0.65, marginBottom: onUnsubscribe ? 12 : 0 }}>
                仅创建者可修改频道名称与简介。
              </div>
              {onUnsubscribe ? (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    disabled={!!unsubscribeBusy}
                    onClick={() => void onUnsubscribe()}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 10,
                      border: "1px solid rgba(248,113,113,0.45)",
                      background: "rgba(127,29,29,0.35)",
                      color: "#fecaca",
                      fontWeight: 700,
                      cursor: unsubscribeBusy ? "not-allowed" : "pointer",
                      opacity: unsubscribeBusy ? 0.65 : 1
                    }}
                  >
                    {unsubscribeBusy ? "处理中…" : "取消订阅"}
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </>
      ) : (
        <div style={{ fontSize: 12, opacity: 0.75 }}>暂无资料</div>
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
          <div style={{ fontWeight: 900 }}>频道资料</div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>{body}</div>
      </div>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="频道资料">
      {body}
    </Modal>
  );
}
