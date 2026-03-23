export function isImageMime(mime?: string) {
  return !!mime && /^image\//.test(mime);
}

export function isVideoMime(mime?: string) {
  return !!mime && /^video\//.test(mime);
}

/** 語音／音訊：含 OGG 語音（常見為 application/ogg，可能帶 ;codecs=…） */
export function isAudioMime(mime?: string) {
  const m = (mime || "").trim().toLowerCase();
  if (!m) return false;
  const base = m.split(";")[0].trim();
  if (base.startsWith("audio/")) return true;
  if (base === "application/ogg") return true;
  return false;
}
