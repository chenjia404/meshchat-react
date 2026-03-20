import type { MeshserverServerRaw } from "../types";
import { normalizeEntityList } from "../utils";

/** 從後端各種包裹形态中抽出陣列（與 App 原 loadSpaces 一致）。 */
export function extractJsonArrayList(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (!v || typeof v !== "object") return [];
  const o = v as Record<string, unknown>;
  if (Array.isArray(o.items)) return o.items;
  if (Array.isArray(o.data)) return o.data as unknown[];
  if (Array.isArray(o.results)) return o.results as unknown[];
  if (Array.isArray(o.list)) return o.list as unknown[];
  if (Array.isArray(o.rows)) return o.rows as unknown[];
  if (Array.isArray(o.entries)) return o.entries as unknown[];
  if (Array.isArray(o.records)) return o.records as unknown[];
  if (o.page && typeof o.page === "object" && Array.isArray((o.page as { items?: unknown }).items)) {
    return (o.page as { items: unknown[] }).items;
  }
  if (Array.isArray(o.spaces)) return o.spaces as unknown[];
  for (const k of Object.keys(o)) {
    const vv = o[k];
    if (Array.isArray(vv)) return vv;
  }
  return [];
}

/**
 * 將 GET `/api/v1/meshserver/spaces?connection=...` 的响应解析為 space 列表。
 */
export function normalizeMeshSpacesFromResponse(resp: unknown): MeshserverServerRaw[] {
  const r = resp as Record<string, unknown> | null | undefined;
  let list: unknown[] = [];
  const spacesVal = r?.spaces;
  const dataSpacesVal = r?.data && typeof r.data === "object" ? (r.data as { spaces?: unknown }).spaces : undefined;
  const resultSpacesVal =
    r?.result && typeof r.result === "object"
      ? (r.result as { spaces?: unknown }).spaces
      : undefined;

  list = extractJsonArrayList(spacesVal);
  if (!list.length) list = extractJsonArrayList(dataSpacesVal);
  if (!list.length) list = extractJsonArrayList(resultSpacesVal);
  if (!list.length) list = extractJsonArrayList(r?.items);
  if (!list.length) list = normalizeEntityList<any>(resp, ["spaces"]);

  const mapped = (Array.isArray(list) ? list : []).map(item => {
    const it = item as Record<string, unknown>;
    const spaceObj = (it && (it.space || it.server)) || it || {};

    const so = spaceObj as Record<string, unknown>;
    const spaceId =
      so?.id ??
      so?.space_id ??
      so?.spaceId ??
      so?.spaceID ??
      so?.space_uuid ??
      so?.spaceUuid ??
      it?.id ??
      it?.space_id ??
      it?.spaceId ??
      it?.spaceID ??
      so?.server_id ??
      so?.serverId ??
      it?.server_id ??
      it?.serverId ??
      "";

    const name =
      so?.name ??
      so?.title ??
      so?.space_name ??
      so?.spaceName ??
      it?.name ??
      it?.title ??
      "";

    return {
      id: String(spaceId ?? ""),
      name: String(name || ""),
      avatar_url:
        so?.avatar_url ?? so?.avatarUrl ?? so?.avatar ?? it?.avatar_url,
      description: so?.description ?? so?.desc ?? "",
      visibility: so?.visibility ?? so?.public ?? so?.is_public,
      member_count:
        so?.member_count ??
        so?.memberCount ??
        so?.members_count ??
        so?.membersCount,
      allow_channel_creation:
        so?.allow_channel_creation ??
        so?.allowChannelCreation ??
        so?.can_create_channel ??
        it?.allow_channel_creation
    } as MeshserverServerRaw;
  });

  return mapped.filter(s => (s.id ?? "") !== "");
}
