import React, { useEffect } from "react";

export interface ImageLightboxProps {
  open: boolean;
  src: string;
  alt?: string;
  onClose: () => void;
}

export function ImageLightbox({ open, src, alt, onClose }: ImageLightboxProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !src) return null;

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "rgba(0,0,0,0.92)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        boxSizing: "border-box",
        cursor: "zoom-out"
      }}
    >
      <button
        type="button"
        aria-label="关闭"
        onClick={onClose}
        style={{
          position: "fixed",
          top: 12,
          right: 12,
          zIndex: 10001,
          width: 40,
          height: 40,
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.2)",
          background: "rgba(17,24,39,0.85)",
          color: "#e5e7eb",
          fontSize: 22,
          lineHeight: 1,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        ×
      </button>
      <img
        src={src}
        alt={alt || ""}
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: "min(100vw - 32px, 100%)",
          maxHeight: "min(100vh - 32px, 100%)",
          width: "auto",
          height: "auto",
          objectFit: "contain",
          borderRadius: 8,
          cursor: "default"
        }}
      />
    </div>
  );
}
