import { api } from "../api/config";
import type { Me, MeshchatGroupSummary, MeshchatMessage } from "../types";

export function normalizeMeshchatServerBase(input: string): string {
  const s = input.trim().replace(/\/+$/, "");
  if (!s) throw new Error("服务器地址不能为空");
  try {
    const u = new URL(s.includes("://") ? s : `http://${s}`);
    return u.origin;
  } catch {
    throw new Error("无效的服务器地址");
  }
}

/** 解析用户粘贴的群链接，得到 MeshChat HTTP origin 与 group_id */
export function parseMeshchatGroupInviteUrl(raw: string): { serverBase: string; groupId: string } {
  const t = raw.trim();
  if (!t) throw new Error("请输入群聊地址");
  let url: URL;
  try {
    url = new URL(t.includes("://") ? t : `http://${t}`);
  } catch {
    throw new Error("无法解析地址，请使用 http(s)://主机/groups/{UUID} 形式");
  }
  const m = url.pathname.match(/\/groups\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/?$/i);
  if (!m) throw new Error("路径应为 /groups/{群ID}，且群 ID 为 UUID");
  return { serverBase: url.origin, groupId: m[1] };
}

function tokenStorageKey(serverBase: string): string {
  return `meshchat_jwt_${encodeURIComponent(serverBase)}`;
}

export function getStoredMeshchatToken(serverBase: string): string | null {
  try {
    return sessionStorage.getItem(tokenStorageKey(serverBase));
  } catch {
    return null;
  }
}

export function setStoredMeshchatToken(serverBase: string, token: string): void {
  try {
    sessionStorage.setItem(tokenStorageKey(serverBase), token);
  } catch {
    /* ignore */
  }
}

export function clearStoredMeshchatToken(serverBase: string): void {
  try {
    sessionStorage.removeItem(tokenStorageKey(serverBase));
  } catch {
    /* ignore */
  }
}

function meshchatErrorMessage(data: unknown, fallback: string): string {
  const o = data as { error?: { message?: string; code?: string }; message?: string };
  const nested = o?.error?.message || o?.error?.code;
  if (typeof nested === "string" && nested.trim()) return nested.trim();
  if (typeof o?.message === "string" && o.message.trim()) return o.message.trim();
  return fallback;
}

async function readMeshchatResponse<T>(resp: Response): Promise<T> {
  const text = await resp.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (!resp.ok) {
    throw new Error(meshchatErrorMessage(data, text.slice(0, 200) || resp.statusText));
  }
  return data as T;
}

/** meshproxy：对 MeshChat challenge 原文签名 */
export async function signMeshchatChallenge(challenge: string): Promise<{
  signature: string;
  publicKey: string;
  peerId?: string;
}> {
  const r = await fetch(api("/api/v1/identity/challenge/sign"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challenge }),
    credentials: "include"
  });
  const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) {
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : meshchatErrorMessage(data, r.statusText)
    );
  }
  const sig =
    (typeof data.signature_base64 === "string" && data.signature_base64) ||
    (typeof data.signature === "string" && data.signature) ||
    "";
  const pk =
    (typeof data.public_key_base64 === "string" && data.public_key_base64) ||
    (typeof data.public_key === "string" && data.public_key) ||
    "";
  if (!sig || !pk) throw new Error("签名响应缺少 signature / public_key");
  const peerId =
    typeof data.peer_id === "string" ? data.peer_id : undefined;
  return { signature: sig, publicKey: pk, peerId };
}

async function meshchatPostJson<T>(
  serverBase: string,
  path: string,
  body: unknown,
  token?: string | null
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`${serverBase}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
  return readMeshchatResponse<T>(r);
}

async function meshchatGetJson<T>(
  serverBase: string,
  path: string,
  token: string
): Promise<T> {
  const r = await fetch(`${serverBase}${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return readMeshchatResponse<T>(r);
}

export interface MeshchatLoginResult {
  token: string;
  userId: number;
}

export async function loginMeshchatServer(
  serverBase: string,
  peerId: string
): Promise<MeshchatLoginResult> {
  const pid = peerId.trim();
  if (!pid) throw new Error("缺少 peer_id，请先登录 meshchat 账号");

  const ch = await meshchatPostJson<{
    challenge_id: string;
    challenge: string;
  }>(serverBase, "/auth/challenge", { peer_id: pid });

  const signed = await signMeshchatChallenge(ch.challenge);

  const login = await meshchatPostJson<{ token: string; user?: { id?: number } }>(
    serverBase,
    "/auth/login",
    {
      peer_id: pid,
      challenge_id: ch.challenge_id,
      signature: signed.signature,
      public_key: signed.publicKey
    }
  );

  if (!login.token) throw new Error("登录失败：未返回 token");
  const userId =
    typeof login.user?.id === "number" && Number.isFinite(login.user.id)
      ? login.user.id
      : 0;
  setStoredMeshchatToken(serverBase, login.token);
  return { token: login.token, userId };
}

export async function meshchatRequestWithToken<T>(
  serverBase: string,
  path: string,
  token: string,
  init?: RequestInit
): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  const r = await fetch(`${serverBase}${path}`, { ...init, headers });
  return readMeshchatResponse<T>(r);
}

export async function joinMeshchatGroup(
  serverBase: string,
  groupId: string,
  token: string
): Promise<unknown> {
  return meshchatRequestWithToken(serverBase, `/groups/${encodeURIComponent(groupId)}/join`, token, { method: "POST" });
}

/** POST /groups/{group_id}/leave — 群主须先转让群主 */
export async function leaveMeshchatGroup(
  serverBase: string,
  groupId: string,
  token: string
): Promise<unknown> {
  return meshchatRequestWithToken(serverBase, `/groups/${encodeURIComponent(groupId)}/leave`, token, {
    method: "POST"
  });
}

export async function getMeshchatGroup(
  serverBase: string,
  groupId: string,
  token: string
): Promise<MeshchatGroupSummary> {
  return meshchatGetJson<MeshchatGroupSummary>(
    serverBase,
    `/groups/${encodeURIComponent(groupId)}`,
    token
  );
}

/** 生成可分享的群链接（与 parseMeshchatGroupInviteUrl 对应） */
export function formatMeshchatGroupInviteLink(serverBase: string, groupId: string): string {
  const gid = (groupId || "").trim();
  if (!gid) return "";
  try {
    const base = normalizeMeshchatServerBase(serverBase);
    return `${base}/groups/${encodeURIComponent(gid)}`;
  } catch {
    return "";
  }
}

/** 根据 GET /groups/:id 返回字段判断是否具备管理权限（服务端字段名可能不同） */
export function meshchatGroupIsAdmin(
  summary: MeshchatGroupSummary,
  myUserId?: number
): boolean {
  const s = summary as MeshchatGroupSummary & Record<string, unknown>;
  if (s.is_admin === true || s.can_manage === true) return true;
  const r = (s.my_role || s.role || s.membership?.role || "") as string;
  if (r && /^(admin|owner|controller|moderator)$/i.test(r.trim())) return true;
  if (r && /admin|owner/i.test(r)) return true;
  const ownerId = s.owner_user_id;
  if (typeof ownerId === "number" && typeof myUserId === "number" && ownerId === myUserId) {
    return true;
  }
  const perms = s.permissions ?? s.abilities;
  if (Array.isArray(perms) && perms.some(p => /manage|admin|group/i.test(String(p)))) {
    return true;
  }
  return false;
}

export async function patchMeshchatGroup(
  serverBase: string,
  groupId: string,
  token: string,
  patch: { title?: string; about?: string }
): Promise<MeshchatGroupSummary> {
  return meshchatRequestWithToken<MeshchatGroupSummary>(
    serverBase,
    `/groups/${encodeURIComponent(groupId)}`,
    token,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    }
  );
}

/** 邀请好友（Mesh 侧 peer_id）；若服务端路径或字段不同，可在此统一调整 */
export async function invitePeerToMeshchatGroup(
  serverBase: string,
  groupId: string,
  token: string,
  peerId: string
): Promise<unknown> {
  return meshchatRequestWithToken(
    serverBase,
    `/groups/${encodeURIComponent(groupId)}/invite`,
    token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ peer_id: peerId.trim() })
    }
  );
}

export async function getMeshchatMessages(
  serverBase: string,
  groupId: string,
  token: string,
  opts?: { beforeSeq?: number; limit?: number }
): Promise<MeshchatMessage[]> {
  const q = new URLSearchParams();
  if (opts?.beforeSeq != null) q.set("before_seq", String(opts.beforeSeq));
  if (opts?.limit != null) q.set("limit", String(opts.limit));
  const qs = q.toString();
  const path = `/groups/${encodeURIComponent(groupId)}/messages${qs ? `?${qs}` : ""}`;
  const r = await fetch(`${serverBase}${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await readMeshchatResponse<unknown>(r);
  if (Array.isArray(data)) return data as MeshchatMessage[];
  const o = data as { messages?: unknown[] };
  if (Array.isArray(o.messages)) return o.messages as MeshchatMessage[];
  return [];
}

export async function postMeshchatTextMessage(
  serverBase: string,
  groupId: string,
  token: string,
  text: string
): Promise<MeshchatMessage> {
  return meshchatRequestWithToken<MeshchatMessage>(
    serverBase,
    `/groups/${encodeURIComponent(groupId)}/messages`,
    token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content_type: "text",
        payload: { text },
        reply_to_message_id: null,
        forward_from_message_id: null,
        signature: ""
      })
    }
  );
}

export async function postMeshchatMessageRaw(
  serverBase: string,
  groupId: string,
  token: string,
  body: Record<string, unknown>
): Promise<MeshchatMessage> {
  return meshchatRequestWithToken<MeshchatMessage>(
    serverBase,
    `/groups/${encodeURIComponent(groupId)}/messages`,
    token,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }
  );
}

export async function postMeshchatFileRecord(
  serverBase: string,
  token: string,
  meta: {
    cid: string;
    mime_type: string;
    size: number;
    file_name: string;
    width?: number | null;
    height?: number | null;
    duration_seconds?: number | null;
    thumbnail_cid?: string;
  }
): Promise<unknown> {
  return meshchatRequestWithToken(serverBase, "/files", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cid: meta.cid,
      mime_type: meta.mime_type,
      size: meta.size,
      width: meta.width ?? null,
      height: meta.height ?? null,
      duration_seconds: meta.duration_seconds ?? null,
      file_name: meta.file_name,
      thumbnail_cid: meta.thumbnail_cid ?? ""
    })
  });
}

export interface IpfsAddResult {
  cid: string;
  size: number;
}

export async function ipfsAddViaMeshproxy(file: File): Promise<IpfsAddResult> {
  const form = new FormData();
  form.append("file", file, file.name || "upload.bin");
  const r = await fetch(api("/api/ipfs/add"), {
    method: "POST",
    body: form,
    credentials: "include"
  });
  const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) {
    const msg =
      (typeof data.error === "object" &&
        data.error &&
        typeof (data.error as { message?: string }).message === "string" &&
        (data.error as { message: string }).message) ||
      (typeof data.message === "string" ? data.message : "") ||
      r.statusText;
    throw new Error(msg || `IPFS 上传失败 HTTP ${r.status}`);
  }
  const cid = typeof data.cid === "string" ? data.cid : "";
  if (!cid) throw new Error("IPFS 未返回 cid");
  const size = typeof data.size === "number" ? data.size : file.size || 0;
  return { cid, size };
}

export function buildMeshchatIpfsUrl(cid: string, filename?: string): string {
  const id = cid.trim();
  const fn = (filename || "").trim();
  const base = `/ipfs/${encodeURIComponent(id)}/`;
  if (fn) return api(`${base}?filename=${encodeURIComponent(fn)}`);
  return api(base);
}

export function peekMeshchatMessagePreview(m: MeshchatMessage): string {
  const t = (m.content_type || "").toLowerCase();
  const p = m.payload || {};
  if (t === "text" && typeof p.text === "string") {
    const s = p.text.replace(/\s+/g, " ").trim();
    return s.length > 48 ? s.slice(0, 48) + "…" : s;
  }
  if (t === "image") return "[图片]";
  if (t === "video") return "[视频]";
  if (t === "voice") return "[语音]";
  if (t === "file") return "[文件]";
  return "[消息]";
}

export async function retractMeshchatMessage(
  serverBase: string,
  groupId: string,
  token: string,
  messageId: string
): Promise<void> {
  await meshchatRequestWithToken(
    serverBase,
    `/groups/${encodeURIComponent(groupId)}/messages/${encodeURIComponent(messageId)}/retract`,
    token,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }
  );
}

/** MeshChat：PATCH /users/{peer_id}/profile 请求体（peer_id 须与当前登录用户一致） */
export interface MeshchatPatchProfileBody {
  display_name?: string;
  avatar_cid?: string;
  bio?: string;
  status?: string;
}

/**
 * 从头像字段解析 IPFS CID：支持裸 CID、`ipfs://`、`…/ipfs/{cid}` 网关 URL 等。
 */
export function extractMeshchatAvatarCid(raw: string | undefined): string | undefined {
  const s = (raw ?? "").trim();
  if (!s) return undefined;
  const ipfsProto = s.match(/^ipfs:\/\/([^/?#]+)/i);
  if (ipfsProto?.[1]) return ipfsProto[1].trim();
  const ipfsPath = s.match(/\/ipfs\/([^/?#]+)/i);
  if (ipfsPath?.[1]) return ipfsPath[1].trim();
  const bare = s;
  if (/^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(bare)) return bare;
  if (/^baf[a-z2-7]{50,}$/i.test(bare)) return bare.toLowerCase();
  if (/^baf[a-zA-Z0-9]{50,}$/.test(bare)) return bare;
  return undefined;
}

/** 将本地 Me 映射为超级群服务器资料 PATCH 体 */
export function meToMeshchatProfilePatch(me: Me): MeshchatPatchProfileBody {
  const display_name = (me.nickname || me.remote_nickname || "").trim();
  const bio = (me.bio || "").trim();
  const patch: MeshchatPatchProfileBody = { status: "active" };
  if (display_name) patch.display_name = display_name;
  if (bio) patch.bio = bio;
  const cidRaw = (me.avatar_cid || "").trim() || extractMeshchatAvatarCid(me.avatar);
  if (cidRaw) patch.avatar_cid = cidRaw;
  return patch;
}

/**
 * PATCH /users/{peer_id}/profile — 按 peer_id 更新当前登录用户资料，path 中的 peer_id 必须与 token 对应用户一致。
 */
export async function patchMeshchatUserProfile(
  serverBase: string,
  token: string,
  peerId: string,
  patch: MeshchatPatchProfileBody
): Promise<unknown> {
  const pid = peerId.trim();
  if (!pid) throw new Error("缺少 peer_id");
  return meshchatRequestWithToken(
    serverBase,
    `/users/${encodeURIComponent(pid)}/profile`,
    token,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    }
  );
}

/**
 * 向已加入超级群所在服务器同步个人资料（PATCH /users/{peer_id}/profile）。
 * serverBases 为各超级群 HTTP origin。
 */
export async function syncMeshchatProfileToJoinedServers(
  me: Me | null | undefined,
  serverBases: string[]
): Promise<void> {
  const peerId = (me?.peer_id || "").trim();
  if (!peerId || !me) return;
  const patch = meToMeshchatProfilePatch(me);
  const uniq = [...new Set(serverBases.map(s => s.trim()).filter(Boolean))];
  for (const serverBase of uniq) {
    let token = getStoredMeshchatToken(serverBase);
    if (!token) {
      const login = await loginMeshchatServer(serverBase, peerId);
      token = login.token;
    }
    await patchMeshchatUserProfile(serverBase, token, peerId, patch);
  }
}

