import type {
  ChannelSummary,
  PublicChannelListEntry,
  PublicChannelMessage,
  PublicChannelProfileDetail
} from "../types";
import { api } from "../api/config";

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

/** 解析 GET .../messages 的多种响应形态 */
export function normalizePublicChannelMessages(resp: unknown): PublicChannelMessage[] {
  if (Array.isArray(resp)) {
    return resp.map(normalizeOne).filter((m): m is PublicChannelMessage => m != null);
  }
  const r = asRecord(resp);
  if (!r) return [];
  const list =
    r.messages ??
    r.items ??
    r.data ??
    (Array.isArray(r["channel_messages"]) ? r["channel_messages"] : null);
  if (!Array.isArray(list)) return [];
  return list.map(normalizeOne).filter((m): m is PublicChannelMessage => m != null);
}

function normalizeOne(raw: unknown): PublicChannelMessage | null {
  const o = asRecord(raw);
  if (!o) return null;
  const mid = o.message_id;
  const messageId =
    typeof mid === "number"
      ? mid
      : typeof mid === "string" && /^\d+$/.test(mid)
        ? parseInt(mid, 10)
        : NaN;
  if (!Number.isFinite(messageId)) return null;
  const created =
    typeof o.created_at === "number"
      ? o.created_at
      : typeof o.created_at === "string"
        ? parseInt(o.created_at, 10)
        : 0;
  const updated =
    typeof o.updated_at === "number"
      ? o.updated_at
      : typeof o.updated_at === "string"
        ? parseInt(o.updated_at, 10)
        : created;
  const contentRaw = o.content;
  let content: PublicChannelMessage["content"] | undefined;
  if (typeof contentRaw === "string") {
    const s = contentRaw.trim();
    if (s) {
      try {
        const p = JSON.parse(contentRaw) as unknown;
        if (p && typeof p === "object" && !Array.isArray(p)) {
          content = p as PublicChannelMessage["content"];
        } else {
          content = { text: contentRaw };
        }
      } catch {
        content = { text: contentRaw };
      }
    }
  } else if (contentRaw && typeof contentRaw === "object") {
    content = { ...(contentRaw as PublicChannelMessage["content"]) };
  }
  const pickStr = (v: unknown): string | undefined =>
    typeof v === "string" ? v : undefined;
  const nestedText = pickStr(content?.text);
  const textMerged =
    (nestedText != null && nestedText.length > 0 ? nestedText : undefined) ??
    pickStr(o.text) ??
    pickStr(o.plaintext) ??
    pickStr(o.body) ??
    pickStr(o.message_text);
  if (textMerged !== undefined) {
    content = { ...(content ?? {}), text: textMerged };
  }
  return {
    channel_id: typeof o.channel_id === "string" ? o.channel_id : undefined,
    message_id: messageId,
    version: typeof o.version === "number" ? o.version : undefined,
    seq: typeof o.seq === "number" ? o.seq : undefined,
    author_peer_id:
      typeof o.author_peer_id === "string"
        ? o.author_peer_id
        : typeof o.creator_peer_id === "string"
          ? o.creator_peer_id
          : undefined,
    creator_peer_id:
      typeof o.creator_peer_id === "string" ? o.creator_peer_id : undefined,
    created_at: created,
    updated_at: updated,
    is_deleted: !!o.is_deleted,
    message_type: typeof o.message_type === "string" ? o.message_type : undefined,
    content
  };
}

/**
 * 从创建频道等接口响应中取出 channel_id（格式：`ownerPeerId:uuidv7`）。
 * 后端已保证返回时可优先匹配。
 */
export function extractChannelIdFromCreateResponse(raw: unknown): string {
  const pick = (r: Record<string, unknown>): string => {
    const a = r.channel_id;
    const b = r.channelId;
    const id = r.id;
    if (typeof a === "string" && a.trim()) return a.trim();
    if (typeof b === "string" && b.trim()) return b.trim();
    if (typeof id === "string" && id.trim()) return id.trim();
    return "";
  };

  const o = asRecord(raw);
  if (!o) return "";

  const fromNested = asRecord(o.channel);
  const fromData = asRecord(o.data);
  const fromResult = asRecord(o.result);

  return (
    pick(o) ||
    (fromNested ? pick(fromNested) : "") ||
    (fromData ? pick(fromData) : "") ||
    (fromResult ? pick(fromResult) : "")
  ).trim();
}

/** 比较两个 libp2p peer id 是否相同（去首尾空白，避免接口与本地格式不一致） */
export function peerIdsEqual(
  a: string | undefined | null,
  b: string | undefined | null
): boolean {
  const x = (a ?? "").trim();
  const y = (b ?? "").trim();
  if (!x || !y) return false;
  return x === y;
}

function parseUnixSec(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return Math.floor(v);
  if (typeof v === "string" && /^\d+$/.test(v.trim())) return parseInt(v.trim(), 10);
  return undefined;
}

function unwrapSubscriptionsArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  const o = asRecord(raw);
  if (!o) return [];
  for (const k of [
    "channels",
    "subscriptions",
    "summaries",
    "items",
    "data",
    "channel_summaries",
    "public_channels",
    "results"
  ]) {
    const v = o[k];
    if (Array.isArray(v)) return v;
  }
  return [];
}

/** 解析 GET /api/v1/public-channels/subscriptions 的 ChannelSummary[]（顺序与后端一致） */
export function normalizeChannelSubscriptionsResponse(raw: unknown): ChannelSummary[] {
  const arr = unwrapSubscriptionsArray(raw);
  const out: ChannelSummary[] = [];
  for (const row of arr) {
    const s = parseChannelSummaryRow(row);
    if (s) out.push(s);
  }
  return out;
}

function parseChannelSummaryRow(raw: unknown): ChannelSummary | null {
  const row = asRecord(raw);
  if (!row) return null;

  /** mesh-proxy：订阅列表常见为 { profile, head, sync }，元数据在 profile */
  const profile = asRecord(row.profile);
  const head = asRecord(row.head);

  const nested =
    asRecord(row.channel) ??
    asRecord(row.public_channel) ??
    asRecord(row.subscription) ??
    profile ??
    head;

  const channelId = String(
    profile?.channel_id ??
      profile?.channelId ??
      head?.channel_id ??
      head?.channelId ??
      nested?.channel_id ??
      nested?.channelId ??
      row.channel_id ??
      row.channelId ??
      ""
  ).trim();
  if (!channelId) return null;

  const sync =
    asRecord(row.sync) ??
    asRecord(row.public_channel_sync_state) ??
    asRecord(row.sync_state) ??
    asRecord(row.syncState) ??
    (nested ? asRecord(nested.sync) : null);

  const syncUpdated =
    parseUnixSec(sync?.updated_at) ??
    parseUnixSec(sync?.updatedAt) ??
    parseUnixSec(row.sync_updated_at) ??
    parseUnixSec(row.syncUpdatedAt);

  const fallbackUpdated =
    parseUnixSec(head?.updated_at) ??
    parseUnixSec(head?.updatedAt) ??
    parseUnixSec(profile?.updated_at) ??
    parseUnixSec(profile?.updatedAt) ??
    parseUnixSec(row.updated_at) ??
    parseUnixSec(row.updatedAt) ??
    Math.floor(Date.now() / 1000);

  const updatedForSort = syncUpdated ?? fallbackUpdated;

  const owner = String(
    profile?.owner_peer_id ??
      profile?.ownerPeerId ??
      head?.owner_peer_id ??
      head?.ownerPeerId ??
      nested?.owner_peer_id ??
      nested?.ownerPeerId ??
      row.owner_peer_id ??
      row.ownerPeerId ??
      ""
  ).trim();
  const name = String(
    profile?.name ?? nested?.name ?? row.name ?? ""
  ).trim();

  const internalId =
    typeof row.id === "number" && Number.isFinite(row.id)
      ? row.id
      : typeof row.channel_db_id === "number" && Number.isFinite(row.channel_db_id)
        ? row.channel_db_id
        : typeof nested?.id === "number" && Number.isFinite(nested.id)
          ? nested.id
          : undefined;

  let isOwner: boolean | undefined;
  if (typeof row.is_owner === "boolean") isOwner = row.is_owner;
  else if (typeof row.isOwner === "boolean") isOwner = row.isOwner;
  else if (nested && typeof nested.is_owner === "boolean") isOwner = nested.is_owner;
  else if (nested && typeof nested.isOwner === "boolean") isOwner = nested.isOwner;

  return {
    channel_id: channelId,
    name: name || undefined,
    owner_peer_id: owner || undefined,
    is_owner: isOwner,
    sync_updated_at: updatedForSort,
    id: internalId
  };
}

/** ChannelSummary → 会话列表项（subscriptionOrder 与接口数组下标一致，用于同秒排序） */
export function publicChannelListEntryFromSummary(
  s: ChannelSummary,
  mePeerId?: string | null,
  subscriptionOrder?: number
): PublicChannelListEntry {
  const ownerPeerId = (s.owner_peer_id ?? "").trim();
  const updatedAtSec = Math.max(0, s.sync_updated_at ?? Math.floor(Date.now() / 1000));
  const isOwner =
    typeof s.is_owner === "boolean"
      ? s.is_owner
      : peerIdsEqual(mePeerId, ownerPeerId);

  return {
    channelId: s.channel_id,
    name: (s.name ?? "").trim() || "公开频道",
    ownerPeerId,
    isOwner,
    updatedAtSec,
    subscriptionOrder,
    lastMessagePreview: undefined
  };
}

/**
 * 用 GET /subscriptions 结果更新会话列表：以接口为准，仅把本地的 lastMessagePreview 合并进仍存在的频道；
 * 接口未返回的频道视为已取消订阅，不再保留（否则会写回 localStorage）。
 * 接口解析为空数组时不覆盖本地（避免异常响应清空列表）。
 */
export function mergePublicChannelPreviewFromPrevious(
  prev: PublicChannelListEntry[],
  next: PublicChannelListEntry[]
): PublicChannelListEntry[] {
  if (!next.length) return prev;

  const previewById = new Map(
    prev.map(e => [e.channelId, e.lastMessagePreview] as const)
  );
  return next.map(e => ({
    ...e,
    lastMessagePreview: previewById.get(e.channelId) ?? e.lastMessagePreview
  }));
}

/** 解析 GET /api/v1/public-channels/{id} 的资料（兼容 channel/data/profile 包装与驼峰字段） */
export function parsePublicChannelProfile(
  raw: unknown,
  fallbackChannelId: string
): Omit<PublicChannelListEntry, "isOwner" | "lastMessagePreview"> | null {
  const root = asRecord(raw);
  if (!root) return null;
  const inner =
    asRecord(root.channel) ??
    asRecord(root.data) ??
    asRecord(root.result) ??
    asRecord(root.profile) ??
    root;

  const channelId =
    String(
      inner.channel_id ??
        inner.channelId ??
        root.channel_id ??
        root.channelId ??
        inner.id ??
        root.id ??
        fallbackChannelId
    ).trim() || fallbackChannelId;

  const name =
    String(inner.name ?? root.name ?? "").trim() || "公开频道";

  const ownerPeerId = String(
    inner.owner_peer_id ??
      inner.ownerPeerId ??
      root.owner_peer_id ??
      root.ownerPeerId ??
      ""
  ).trim();

  const updatedAtRaw =
    inner.updated_at ?? root.updated_at ?? inner.created_at ?? root.created_at;
  const updatedAt =
    typeof updatedAtRaw === "number"
      ? updatedAtRaw
      : typeof updatedAtRaw === "string"
        ? parseInt(updatedAtRaw, 10)
        : Math.floor(Date.now() / 1000);

  return {
    channelId,
    name,
    ownerPeerId,
    updatedAtSec: Number.isFinite(updatedAt) ? updatedAt : Math.floor(Date.now() / 1000)
  };
}

/** 解析 GET /api/v1/public-channels/{id} 用于简介页（含 bio、版本号等） */
export function parsePublicChannelProfileDetail(
  raw: unknown,
  fallbackChannelId: string
): PublicChannelProfileDetail | null {
  const base = parsePublicChannelProfile(raw, fallbackChannelId);
  if (!base) return null;

  const root = asRecord(raw);
  const inner =
    asRecord(root?.channel) ??
    asRecord(root?.data) ??
    asRecord(root?.result) ??
    asRecord(root?.profile) ??
    root;

  const bio = String(inner?.bio ?? root?.bio ?? "").trim();

  const ownerVersion =
    typeof inner?.owner_version === "number"
      ? inner.owner_version
      : typeof inner?.ownerVersion === "number"
        ? inner.ownerVersion
        : undefined;
  const profileVersion =
    typeof inner?.profile_version === "number"
      ? inner.profile_version
      : typeof inner?.profileVersion === "number"
        ? inner.profileVersion
        : undefined;
  const sig =
    typeof inner?.signature === "string" ? inner.signature : undefined;
  const createdAtRaw = inner?.created_at ?? root?.created_at;
  let createdAtSec: number | undefined;
  if (typeof createdAtRaw === "number" && Number.isFinite(createdAtRaw)) {
    createdAtSec = Math.floor(createdAtRaw);
  } else if (typeof createdAtRaw === "string" && /^\d+$/.test(createdAtRaw.trim())) {
    createdAtSec = parseInt(createdAtRaw.trim(), 10);
  }

  return {
    channelId: base.channelId,
    name: base.name,
    ownerPeerId: base.ownerPeerId,
    bio,
    updatedAtSec: base.updatedAtSec,
    createdAtSec,
    ownerVersion,
    profileVersion,
    signatureBase64: sig
  };
}

/**
 * 根据 MIME 推断 POST /messages 的 message_type（协议 v1：text / image / file / …）
 * 视频、音频、其它附件统一走 file。
 */
export function inferPublicChannelMessageTypeFromMime(mime: string): string {
  const m = (mime || "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  return "file";
}

/**
 * 从 content.images[] / files[] 单条取资源引用：url 优先；无 url 时 blob_id 即 CID。
 */
export function publicChannelMediaRef(row: Record<string, unknown> | undefined): string {
  if (!row) return "";
  const url = typeof row.url === "string" ? row.url.trim() : "";
  if (url) return url;
  const blob =
    typeof row.blob_id === "string"
      ? row.blob_id.trim()
      : typeof row.file_id === "string"
        ? row.file_id.trim()
        : typeof row.blobId === "string"
          ? row.blobId.trim()
          : "";
  return blob;
}

/** mesh-proxy 本地网关：`/ipfs/{blob_id}/?filename=`（如 `?filename=1.mp4`）便于类型与 Content-Disposition */
function buildIpfsGatewayUrl(cid: string, fileNameHint?: string): string {
  const id = cid.trim();
  const fn = (fileNameHint || "").trim();
  const pathBase = `/ipfs/${encodeURIComponent(id)}/`;
  if (fn) {
    return api(`${pathBase}?filename=${encodeURIComponent(fn)}`);
  }
  return api(pathBase);
}

/**
 * 相对路径 `/ipfs/...` 规范：
 * - `/ipfs/{cid}/` + `?filename=`
 * - 错误形态 `/ipfs/{cid}/{filename}` → 同上（文件名从路径末段或 fileNameHint 来）
 */
function resolveRelativeIpfsPath(u: string, fileNameHint?: string): string | null {
  const noHash = u.split("#")[0] ?? u;
  const qIdx = noHash.indexOf("?");
  const pathOnly = qIdx >= 0 ? noHash.slice(0, qIdx) : noHash;
  const existingQuery = qIdx >= 0 ? noHash.slice(qIdx + 1) : "";

  const m2 = pathOnly.match(/^\/ipfs\/([^/]+)\/([^/]+)\/?$/);
  if (m2) {
    const cid = decodeURIComponent(m2[1]).trim();
    const pathTail = decodeURIComponent(m2[2]).trim();
    if (!cid || !pathTail) return null;
    const fn = (fileNameHint || "").trim() || pathTail;
    const params = new URLSearchParams(existingQuery);
    if (fn && !params.has("filename")) params.set("filename", fn);
    const qs = params.toString();
    const pathBase = `/ipfs/${encodeURIComponent(cid)}/`;
    return api(qs ? `${pathBase}?${qs}` : pathBase);
  }

  const m = pathOnly.match(/^\/ipfs\/([^/]+)\/?$/);
  if (!m) return null;
  const cid = decodeURIComponent(m[1]).trim();
  if (!cid) return null;
  const fn = (fileNameHint || "").trim();
  const params = new URLSearchParams(existingQuery);
  if (fn && !params.has("filename")) params.set("filename", fn);
  const qs = params.toString();
  const pathBase = `/ipfs/${encodeURIComponent(cid)}/`;
  return api(qs ? `${pathBase}?${qs}` : pathBase);
}

/** `https?://.../ipfs/{cid}/{filename}` 与相对路径同样改为 `.../ipfs/{cid}/?filename=` */
function tryNormalizeHttpIpfsWrongPath(u: string, fileNameHint?: string): string | null {
  try {
    const parsed = new URL(u);
    const pathOnly = parsed.pathname;
    const m2 = pathOnly.match(/^\/ipfs\/([^/]+)\/([^/]+)\/?$/);
    if (!m2) return null;
    const cid = decodeURIComponent(m2[1]).trim();
    const pathTail = decodeURIComponent(m2[2]).trim();
    if (!cid || !pathTail) return null;
    const fn = (fileNameHint || "").trim() || pathTail;
    const params = new URLSearchParams(
      parsed.search.startsWith("?") ? parsed.search.slice(1) : parsed.search
    );
    if (fn && !params.has("filename")) params.set("filename", fn);
    const qs = params.toString();
    const pathBase = `/ipfs/${encodeURIComponent(cid)}/`;
    const pathAndQuery = qs ? `${pathBase}?${qs}` : pathBase;
    return `${parsed.origin}${pathAndQuery}${parsed.hash}`;
  } catch {
    return null;
  }
}

/**
 * 将接口返回的路径或裸 CID 补全为可请求的 URL。
 * 规范形态：`/ipfs/{blob_id}/?filename=`；若收到错误形态 `/ipfs/{blob_id}/{filename}`、`ipfs://…/{filename}`、
 * `https://…/ipfs/{blob_id}/{filename}` 或裸 `blob_id/filename`，会改为查询参数 `filename`。
 * @param fileNameHint 来自 content.files[].file_name 等；未传则仅保证尾斜杠 `/ipfs/{cid}/`（单段路径时）
 */
export function resolvePublicChannelAssetUrl(
  raw?: string,
  fileNameHint?: string
): string {
  if (raw == null || typeof raw !== "string") return "";
  const u = raw.trim();
  if (!u) return "";
  if (u.startsWith("http://") || u.startsWith("https://")) {
    const fixed = tryNormalizeHttpIpfsWrongPath(u, fileNameHint);
    return fixed ?? u;
  }
  if (u.startsWith("ipfs://")) {
    const rest = u.slice("ipfs://".length).replace(/^\/+/, "");
    if (!rest) return "";
    const slash = rest.indexOf("/");
    if (slash > 0) {
      const cidPart = rest.slice(0, slash);
      const after = rest.slice(slash + 1).replace(/^\/+/, "");
      if (cidPart && after && !after.includes("/")) {
        return buildIpfsGatewayUrl(cidPart, fileNameHint || after);
      }
    }
    return buildIpfsGatewayUrl(rest, fileNameHint);
  }
  if (u.startsWith("/")) {
    const normalized = resolveRelativeIpfsPath(u, fileNameHint);
    if (normalized != null) return normalized;
    return api(u);
  }
  const slash = u.indexOf("/");
  if (slash > 0) {
    const cidPart = u.slice(0, slash);
    const after = u.slice(slash + 1).replace(/^\/+/, "");
    if (cidPart && after && !after.includes("/")) {
      return buildIpfsGatewayUrl(cidPart, fileNameHint || after);
    }
  }
  return buildIpfsGatewayUrl(u, fileNameHint);
}

function parsePublicChannelHttpError(data: Record<string, unknown>): string {
  const e = data.error ?? data.message;
  if (typeof e === "string" && e.trim()) return e.trim();
  const d = data.detail;
  if (typeof d === "string" && d.trim()) return d.trim();
  if (Array.isArray(d) && d.length) {
    const first = d[0] as Record<string, unknown> | undefined;
    if (first && typeof first.msg === "string") return first.msg;
  }
  return "";
}

/** 补全文件名与 MIME，避免部分浏览器拖拽文件无 type 导致后端拒收 */
function normalizePublicChannelUploadFile(file: File): File {
  const name = (file.name || "").trim() || "upload.bin";
  let type = file.type && file.type.length > 0 ? file.type : "";
  if (!type) {
    const lower = name.toLowerCase();
    if (/\.(png|jpe?g|gif|webp|bmp)$/i.test(lower)) {
      type = lower.endsWith(".png")
        ? "image/png"
        : lower.endsWith(".gif")
          ? "image/gif"
          : lower.endsWith(".webp")
            ? "image/webp"
            : "image/jpeg";
    } else if (/\.(mp4|webm|mov)$/i.test(lower)) type = "video/mp4";
    else if (/\.(mp3|wav|m4a|ogg)$/i.test(lower)) type = "audio/mpeg";
    else type = "application/octet-stream";
  }
  if (file.name === name && file.type === type) return file;
  return new File([file], name, { type });
}

/**
 * 发送图片/视频/语音/文件消息（mesh-proxy 文档 §8.2）
 * POST /api/v1/public-channels/{channel_id}/messages/file
 * multipart：file（必填）、text（可选）、mime_type（可选，不传则服务端自动检测）
 * @see https://github.com/chenjia404/meshproxy/blob/master/docs/%E5%85%AC%E5%BC%80%E9%A2%91%E9%81%93%20API%20%E6%8E%A5%E5%85%A5%E6%96%87%E6%A1%A3.md
 */
export async function postPublicChannelFileMessage(
  channelId: string,
  file: File
): Promise<void> {
  const blob = normalizePublicChannelUploadFile(file);
  const fileName = blob.name || "upload.bin";
  const url = api(
    `/api/v1/public-channels/${encodeURIComponent(channelId)}/messages/file`
  );
  const form = new FormData();
  form.append("file", blob, fileName);
  if (blob.type) {
    form.append("mime_type", blob.type);
  }
  const resp = await fetch(url, {
    method: "POST",
    body: form,
    credentials: "include"
  });
  const text = await resp.text();
  if (resp.ok) return;
  let msg = "";
  try {
    const o = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    msg =
      parsePublicChannelHttpError(o) || String(o.error || o.message || "").trim();
  } catch {
    msg = text.trim();
  }
  throw new Error(msg || resp.statusText || `HTTP ${resp.status}`);
}

export function peekPublicChannelPreview(messages: PublicChannelMessage[]): string {
  const sorted = [...messages].sort((a, b) => b.message_id - a.message_id);
  for (const m of sorted) {
    if (m.is_deleted || m.message_type === "deleted") continue;
    const t = (m.content?.text ?? "").replace(/\s+/g, " ").trim();
    if (t) return t.length > 80 ? t.slice(0, 80) + "…" : t;
    if (m.message_type === "image" || (m.content?.images?.length ?? 0) > 0)
      return "[图片]";
    if (m.message_type === "file" || (m.content?.files?.length ?? 0) > 0)
      return "[文件]";
  }
  return "";
}
