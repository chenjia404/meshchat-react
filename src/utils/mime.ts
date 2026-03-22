export function isImageMime(mime?: string) {
  return !!mime && /^image\//.test(mime);
}

export function isVideoMime(mime?: string) {
  return !!mime && /^video\//.test(mime);
}

/** 語音／音訊：含 OGG 語音（常見為 application/ogg） */
export function isAudioMime(mime?: string) {
  const m = (mime || "").trim().toLowerCase();
  if (!m) return false;
  if (m.startsWith("audio/")) return true;
  if (m === "application/ogg") return true;
  return false;
}
