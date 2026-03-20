import type { MeshserverSyncMessage } from "../types";
import {
  buildMeshserverMediaUrl,
  looksLikeImageSrc,
  resolveMeshserverAssetUrl
} from "./meshMedia";

export function extractMeshserverImageSrc(
  m: MeshserverSyncMessage,
  connectionName?: string
): string | undefined {
  const anyMsg = m as any;
  const contentAny = (anyMsg?.content || {}) as any;

  const images = contentAny?.images;
  const files = contentAny?.files;

  // 按文档：image(2) 优先使用 content.images[0]
  if (Array.isArray(images) && images.length > 0) {
    const first = images[0] || {};
    const url = first?.url;
    const mediaId = first?.media_id || first?.mediaId;
    const mimeType = first?.mime_type || first?.mimeType || "image/jpeg";
    const inline = first?.inline_data || first?.inlineData;

    const mediaUrl = buildMeshserverMediaUrl(mediaId, connectionName);
    if (mediaUrl) return mediaUrl;
    if (looksLikeImageSrc(url)) return resolveMeshserverAssetUrl(url);
    if (inline && typeof inline === "string" && inline.trim()) {
      return `data:${mimeType};base64,${inline.trim()}`;
    }
  }

  // 有些实现把图片放到 files 里（兜底）
  if (Array.isArray(files) && files.length > 0) {
    const first = files[0] || {};
    const url = first?.url;
    const mediaId = first?.media_id || first?.mediaId;
    const mimeType = first?.mime_type || first?.mimeType || "application/octet-stream";
    const inline = first?.inline_data || first?.inlineData;

    const mediaUrl = buildMeshserverMediaUrl(mediaId, connectionName);
    if (mediaUrl) return mediaUrl;
    if (looksLikeImageSrc(url)) return resolveMeshserverAssetUrl(url);
    if (inline && typeof inline === "string" && inline.trim()) {
      return `data:${mimeType};base64,${inline.trim()}`;
    }
  }

  // 有些实现会把 media_id 直接放在 content 根层
  const rootMediaId =
    contentAny?.media_id ||
    contentAny?.mediaId ||
    contentAny?.image_media_id ||
    contentAny?.imageMediaId;
  const rootMediaUrl = buildMeshserverMediaUrl(rootMediaId, connectionName);
  if (rootMediaUrl) return rootMediaUrl;

  // 旧字段兼容（可能是 url/base64 直接挂在 content 上）
  const candidates: Array<string | null | undefined> = [
    contentAny?.image_url,
    contentAny?.imageUrl,
    contentAny?.url,
    contentAny?.image,
    contentAny?.file_url,
    contentAny?.fileUrl,
    contentAny?.data_url,
    contentAny?.dataUrl,
    contentAny?.base64,
    contentAny?.base64_image,
    anyMsg?.image_url,
    anyMsg?.imageUrl,
    anyMsg?.url,
    anyMsg?.image,
    contentAny?.media?.image_url,
    contentAny?.media?.imageUrl,
    contentAny?.media?.url,
    contentAny?.text
  ];

  for (const c of candidates) {
    if (looksLikeImageSrc(c)) return resolveMeshserverAssetUrl(c || undefined);
  }

  // base64 without data prefix: best-effort
  const base64 = String(contentAny?.base64 || contentAny?.base64_image || "").trim();
  const looksBase64 =
    base64.length > 100 && /^[A-Za-z0-9+/]+={0,2}$/.test(base64) && !base64.includes(" ");
  if (looksBase64) {
    const mime = String(contentAny?.mime_type || contentAny?.mime || "image/jpeg").trim();
    return `data:${mime};base64,${base64}`;
  }

  return undefined;
}

export function mergeMeshSyncMessages(
  prev: MeshserverSyncMessage[],
  incoming: MeshserverSyncMessage[]
): MeshserverSyncMessage[] {
  const map = new Map<string, MeshserverSyncMessage>();
  for (const m of prev) map.set(m.message_id, m);
  for (const m of incoming) map.set(m.message_id, m);
  return Array.from(map.values()).sort((a, b) => {
    const sa = a.seq ?? 0;
    const sb = b.seq ?? 0;
    if (sa !== sb) return sa - sb;
    const ta = a.created_at_ms ?? 0;
    const tb = b.created_at_ms ?? 0;
    return ta - tb;
  });
}
