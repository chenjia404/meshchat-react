import { api } from "../api/config";

export function resolveMeshserverAssetUrl(candidate?: string | null): string | undefined {
  const v = (candidate || "").trim();
  if (!v) return undefined;
  if (v.startsWith("data:image/")) return v;
  if (v.startsWith("http://") || v.startsWith("https://")) return v;
  // 后端可能返回 /blobs/xxx 或相对路径，这里交给 api() 处理相对拼接
  return api(v);
}

export function buildMeshserverMediaUrl(
  mediaId?: string | null,
  connectionName?: string | null
): string | undefined {
  const id = String(mediaId || "").trim();
  const conn = String(connectionName || "").trim();
  if (!id || !conn) return undefined;
  return api(
    `/api/v1/meshserver/media/${encodeURIComponent(id)}?connection=${encodeURIComponent(conn)}`
  );
}

export function looksLikeImageSrc(text?: string | null): boolean {
  const v = (text || "").trim();
  if (!v) return false;
  if (v.startsWith("data:image/")) return true;
  if (v.startsWith("http://") || v.startsWith("https://")) return true;
  if (v.startsWith("/")) return true;
  return false;
}
