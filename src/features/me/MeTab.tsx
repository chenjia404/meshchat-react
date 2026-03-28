import React, { useId } from "react";
import type { Me } from "../../types";
import { FallbackAvatar } from "../../components/FallbackAvatar";
import { avatarUrl } from "../../api";

export interface MeTabProps {
  me: Me | null;
  meNicknameDraft: string;
  setMeNicknameDraft: (v: string) => void;
  meBioDraft: string;
  setMeBioDraft: (v: string) => void;
  resolveAvatarSrc: (src?: string) => string | undefined;
  onSaveProfile: () => void;
  /** 选择图片后上传并写入资料（由上层调 IPFS + /chat/profile） */
  onAvatarFile: (file: File) => void | Promise<void>;
  avatarBusy?: boolean;
}

export function MeTab({
  me,
  meNicknameDraft,
  setMeNicknameDraft,
  meBioDraft,
  setMeBioDraft,
  resolveAvatarSrc,
  onSaveProfile,
  onAvatarFile,
  avatarBusy = false
}: MeTabProps) {
  const avatarInputId = useId();

  return (
    <div style={{ padding: "20px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <input
          id={avatarInputId}
          type="file"
          accept="image/*"
          style={{ position: "absolute", width: 0, height: 0, opacity: 0, pointerEvents: "none" }}
          disabled={avatarBusy}
          onChange={e => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void Promise.resolve(onAvatarFile(f));
          }}
        />
        <label
          htmlFor={avatarInputId}
          title="点击更换头像"
          style={{
            position: "relative",
            display: "inline-flex",
            cursor: avatarBusy ? "wait" : "pointer",
            borderRadius: "50%",
            outline: "none",
            opacity: avatarBusy ? 0.75 : 1
          }}
        >
          <FallbackAvatar
            name={meNicknameDraft || "我"}
            size="lg"
            src={resolveAvatarSrc(avatarUrl(me?.avatar))}
          />
          <span
            style={{
              position: "absolute",
              right: -2,
              bottom: -2,
              fontSize: 11,
              fontWeight: 700,
              padding: "2px 6px",
              borderRadius: 8,
              background: "rgba(88,166,255,0.95)",
              color: "#08111c",
              pointerEvents: "none",
              boxShadow: "0 1px 4px rgba(0,0,0,0.35)"
            }}
          >
            {avatarBusy ? "…" : "换"}
          </span>
        </label>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 600 }}>我的名片</div>
          <div
            style={{
              fontSize: 16,
              fontWeight: 600,
              marginTop: 6,
              color: "#e6edf3",
              opacity: meNicknameDraft.trim() ? 1 : 0.55
            }}
          >
            昵称：{meNicknameDraft.trim() || "（未设置）"}
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginTop: 4 }}>
            <div
              style={{
                fontSize: 12,
                opacity: 0.8,
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
                wordBreak: "break-word"
              }}
            >
              Peer ID：{me?.peer_id || "-"}
            </div>
            <button
              type="button"
              disabled={!me?.peer_id}
              onClick={async () => {
                const text = me?.peer_id || "";
                if (!text) return;
                try {
                  await navigator.clipboard.writeText(text);
                } catch {
                  const ta = document.createElement("textarea");
                  ta.value = text;
                  ta.style.position = "fixed";
                  ta.style.left = "-9999px";
                  document.body.appendChild(ta);
                  ta.select();
                  document.execCommand("copy");
                  document.body.removeChild(ta);
                }
                alert("已复制 Peer ID");
              }}
              style={{
                padding: "6px 10px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "transparent",
                color: "#e5e7eb",
                cursor: !me?.peer_id ? "not-allowed" : "pointer",
                opacity: !me?.peer_id ? 0.6 : 1,
                fontSize: 12,
                flexShrink: 0
              }}
              title="复制 Peer ID"
            >
              复制
            </button>
          </div>
          <div
            style={{
              fontSize: 12,
              opacity: 0.8,
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              wordBreak: "break-word"
            }}
          >
            Chat KEX：{me?.chat_kex_pub || "-"}
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
            简介：{me?.bio ? me.bio : "（无）"}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 24, maxWidth: 360 }}>
        <div style={{ fontSize: 14, marginBottom: 4 }}>昵称</div>
        <input
          type="text"
          value={meNicknameDraft}
          onChange={e => setMeNicknameDraft(e.target.value)}
          placeholder="输入昵称"
          style={{
            width: "100%",
            padding: "8px 10px",
            borderRadius: 6,
            border: "1px solid #ccc",
            outline: "none"
          }}
        />

        <div style={{ fontSize: 14, marginBottom: 4, marginTop: 14 }}>简介（bio）</div>
        <textarea
          value={meBioDraft}
          onChange={e => setMeBioDraft(e.target.value)}
          placeholder="写几句介绍自己（可留空）"
          style={{
            width: "100%",
            padding: "8px 10px",
            borderRadius: 6,
            border: "1px solid #ccc",
            outline: "none",
            minHeight: 88,
            resize: "vertical"
          }}
        />
        <button
          style={{
            marginTop: 12,
            padding: "8px 16px",
            borderRadius: 6,
            border: "none",
            background: "#58a6ff",
            color: "#08111c",
            cursor: "pointer"
          }}
          onClick={onSaveProfile}
        >
          保存名片
        </button>
      </div>
    </div>
  );
}
