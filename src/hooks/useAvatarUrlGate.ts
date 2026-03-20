import React, { useCallback, useEffect, useState } from "react";
import { avatarUrl } from "../api";
import type { Me } from "../types";

/**
 * 預載聯絡人與「我」的頭像 URL，僅在載入成功後才交給 Avatar 顯示，避免破圖。
 */
export function useAvatarUrlGate(
  contactAvatarMap: Map<string, string>,
  me: Me | null
): {
  resolveAvatarSrc: (src?: string) => string | undefined;
} {
  const [badAvatarUrls, setBadAvatarUrls] = useState<Set<string>>(new Set());
  const [goodAvatarUrls, setGoodAvatarUrls] = useState<Set<string>>(new Set());
  const loadedAvatarUrlsRef = React.useRef<Set<string>>(new Set());

  useEffect(() => {
    const candidates: string[] = [];
    for (const url of contactAvatarMap.values()) candidates.push(url);
    const myUrl = avatarUrl(me?.avatar);
    if (myUrl) candidates.push(myUrl);

    for (const url of candidates) {
      if (loadedAvatarUrlsRef.current.has(url)) continue;
      loadedAvatarUrlsRef.current.add(url);

      const img = new Image();
      img.onload = () => {
        setGoodAvatarUrls(prev => {
          if (prev.has(url)) return prev;
          const next = new Set(prev);
          next.add(url);
          return next;
        });
      };
      img.onerror = () => {
        setBadAvatarUrls(prev => {
          const next = new Set(prev);
          next.add(url);
          return next;
        });
      };
      img.src = url;
    }
  }, [contactAvatarMap, me?.avatar]);

  const resolveAvatarSrc = useCallback(
    (src?: string) => {
      const s = (src || "").trim();
      if (!s) return undefined;
      if (badAvatarUrls.has(s)) return undefined;
      return goodAvatarUrls.has(s) ? s : undefined;
    },
    [badAvatarUrls, goodAvatarUrls]
  );

  return { resolveAvatarSrc };
}
