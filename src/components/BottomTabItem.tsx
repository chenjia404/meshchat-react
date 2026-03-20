import React from "react";

export interface BottomTabItemProps {
  active: boolean;
  label: string;
  onClick: () => void;
}

export const BottomTabItem: React.FC<BottomTabItemProps> = ({
  active,
  label,
  onClick
}) => (
  <button
    onClick={onClick}
    style={{
      flex: 1,
      border: "none",
      background: "transparent",
      color: active ? "#58a6ff" : "#9ca3af",
      fontSize: 13,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer"
    }}
  >
    <span style={{ marginBottom: 2 }}>{label}</span>
    <div
      style={{
        width: 24,
        height: 2,
        borderRadius: 999,
        background: active ? "#58a6ff" : "transparent"
      }}
    />
  </button>
);
