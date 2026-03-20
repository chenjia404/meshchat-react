export function isImageMime(mime?: string) {
  return !!mime && /^image\//.test(mime);
}

export function isVideoMime(mime?: string) {
  return !!mime && /^video\//.test(mime);
}
