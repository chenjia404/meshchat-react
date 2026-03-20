import React from "react";

export type ListItemMenuState = {
  x: number;
  y: number;
  kind: "contact" | "conversation";
  id: string;
  title: string;
};

export interface ListItemContextMenuProps {
  menu: ListItemMenuState | null;
  onClose: () => void;
  onDelete: (kind: "contact" | "conversation", id: string, title: string) => void;
}

export function ListItemContextMenu({
  menu,
  onClose,
  onDelete
}: ListItemContextMenuProps) {
  if (!menu) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: "fixed",
          left: menu.x,
          top: menu.y,
          width: 200,
          borderRadius: 12,
          background: "rgba(17,24,39,0.98)",
          border: "1px solid rgba(255,255,255,0.12)",
          boxShadow: "0 18px 60px rgba(0,0,0,0.45)",
          padding: 6
        }}
      >
        <button
          type="button"
          onClick={() => {
            const { kind, id, title } = menu;
            onClose();
            onDelete(kind, id, title);
          }}
          style={{
            width: "100%",
            padding: "10px 10px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(248,81,73,0.12)",
            color: "#fecaca",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 700,
            textAlign: "left"
          }}
        >
          {menu.kind === "contact" ? "删除联系人" : "删除会话"}
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{
            width: "100%",
            marginTop: 6,
            padding: "10px 10px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "transparent",
            color: "#e5e7eb",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 600,
            textAlign: "left"
          }}
        >
          取消
        </button>
      </div>
    </div>
  );
}
