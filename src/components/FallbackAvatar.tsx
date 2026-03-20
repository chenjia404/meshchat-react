import React from "react";
import { Avatar } from "@chatscope/chat-ui-kit-react";

export type AvatarSize = "sm" | "md" | "lg";

export function textAvatarLetter(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  return trimmed.charAt(0).toUpperCase();
}

export function avatarPx(size?: AvatarSize): number {
  if (size === "sm") return 32;
  if (size === "lg") return 48;
  return 40; // md / default
}

export const FallbackAvatar: React.FC<{
  name: string;
  src?: string;
  size?: AvatarSize;
}> = ({ name, src, size = "md" }) => {
  const letter = textAvatarLetter(name);
  const px = avatarPx(size);
  const hasSrc = !!(src && src.trim());

  if (hasSrc) {
    return <Avatar name={name} src={src} size={size as any} />;
  }

  return (
    <div
      aria-label={name}
      title={name}
      style={{
        width: px,
        height: px,
        borderRadius: "50%",
        background: "#1f2933",
        color: "#e5e7eb",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.max(12, Math.floor(px * 0.42)),
        fontWeight: 700,
        flexShrink: 0,
        userSelect: "none"
      }}
    >
      {letter}
    </div>
  );
};
