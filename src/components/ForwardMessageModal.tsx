import React, { useEffect, useMemo, useState } from "react";
import { Modal } from "./Modal";
import type { ChatThreadListItem } from "../features/chat";
import type { ThreadKind } from "../types";

const listMaxHeight = () =>
  typeof window !== "undefined" ? Math.min(360, window.innerHeight * 0.45) : 360;

function threadKey(t: ChatThreadListItem): string {
  return `${t.kind}:${t.id}`;
}

export interface ForwardMessageModalProps {
  open: boolean;
  onClose: () => void;
  threads: ChatThreadListItem[];
  busy: boolean;
  onConfirm: (threads: ChatThreadListItem[]) => void | Promise<void>;
}

export function ForwardMessageModal({
  open,
  onClose,
  threads,
  busy,
  onConfirm
}: ForwardMessageModalProps) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  useEffect(() => {
    if (open) setSelected(new Set());
  }, [open]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return threads;
    return threads.filter(t => {
      const hay = `${t.title} ${t.subtitle || ""} ${t.lastMessage || ""}`.toLowerCase();
      return hay.includes(s);
    });
  }, [threads, q]);

  const selectedThreads = useMemo(
    () => threads.filter(t => selected.has(threadKey(t))),
    [threads, selected]
  );

  const toggle = (t: ChatThreadListItem) => {
    const k = threadKey(t);
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelected(prev => {
      const next = new Set(prev);
      filtered.forEach(t => next.add(threadKey(t)));
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const n = selected.size;

  return (
    <Modal open={open} onClose={onClose} title="转发到">
      <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 10 }}>
        选择一个或多个会话；可搜索筛选列表。
      </div>
      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="搜索会话…"
        style={{
          width: "100%",
          padding: "10px 10px",
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.16)",
          background: "rgba(0,0,0,0.18)",
          color: "#e5e7eb",
          outline: "none",
          marginBottom: 8,
          boxSizing: "border-box"
        }}
      />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
          gap: 8,
          flexWrap: "wrap"
        }}
      >
        <span style={{ fontSize: 12, opacity: 0.8 }}>已选 {n} 个</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={selectAllFiltered}
            disabled={busy || filtered.length === 0}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "transparent",
              color: "#e5e7eb",
              cursor: busy ? "wait" : "pointer",
              fontSize: 12
            }}
          >
            全选当前列表
          </button>
          <button
            type="button"
            onClick={clearSelection}
            disabled={busy || n === 0}
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "transparent",
              color: "#e5e7eb",
              cursor: busy ? "wait" : "pointer",
              fontSize: 12
            }}
          >
            清除
          </button>
        </div>
      </div>
      <div
        style={{
          maxHeight: listMaxHeight(),
          overflowY: "auto",
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(0,0,0,0.12)"
        }}
      >
        {filtered.length === 0 ? (
          <div style={{ padding: 14, color: "#9ca3af", fontSize: 13 }}>没有匹配的会话</div>
        ) : (
          filtered.map(t => {
            const k = threadKey(t);
            const checked = selected.has(k);
            return (
              <button
                key={k}
                type="button"
                disabled={busy}
                onClick={() => toggle(t)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 12px",
                  border: "none",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                  background: checked ? "rgba(88,166,255,0.10)" : "transparent",
                  color: "#e5e7eb",
                  cursor: busy ? "wait" : "pointer",
                  fontSize: 14,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10
                }}
              >
                <input
                  type="checkbox"
                  readOnly
                  checked={checked}
                  tabIndex={-1}
                  style={{
                    marginTop: 2,
                    width: 16,
                    height: 16,
                    flexShrink: 0,
                    accentColor: "#58a6ff",
                    pointerEvents: "none"
                  }}
                />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>
                    {threadKindLabel(t.kind)} · {t.title}
                  </div>
                  {t.subtitle ? (
                    <div style={{ fontSize: 12, opacity: 0.65, marginTop: 4 }}>{t.subtitle}</div>
                  ) : null}
                </div>
              </button>
            );
          })
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 12 }}>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "transparent",
            color: "#e5e7eb",
            cursor: busy ? "wait" : "pointer"
          }}
        >
          取消
        </button>
        <button
          type="button"
          disabled={busy || n === 0}
          onClick={() => void onConfirm(selectedThreads)}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "none",
            background: n === 0 || busy ? "rgba(88,166,255,0.35)" : "#58a6ff",
            color: "#08111c",
            fontWeight: 800,
            cursor: busy || n === 0 ? "not-allowed" : "pointer"
          }}
        >
          {busy ? "发送中…" : `转发${n > 0 ? `（${n}）` : ""}`}
        </button>
      </div>
    </Modal>
  );
}

function threadKindLabel(kind: ThreadKind): string {
  if (kind === "direct") return "私聊";
  if (kind === "group") return "群聊";
  if (kind === "public_channel") return "公开频道";
  return "Mesh";
}
