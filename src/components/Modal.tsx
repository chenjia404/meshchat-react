import React from "react";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.55)" }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "min(560px, 92vw)",
          margin: "10vh auto 0",
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(17,24,39,0.98)",
          boxShadow: "0 22px 80px rgba(0,0,0,0.55)",
          overflow: "hidden"
        }}
      >
        <div
          style={{
            padding: "12px 14px",
            fontWeight: 800,
            borderBottom: "1px solid rgba(255,255,255,0.08)"
          }}
        >
          {title}
        </div>
        <div style={{ padding: 14 }}>{children}</div>
      </div>
    </div>
  );
}
