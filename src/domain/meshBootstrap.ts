import type { MeshserverGroupThread } from "../types";
import { normalizeEntityList } from "../utils";

type GetFn = <T>(path: string) => Promise<T>;

/**
 * 開機時從 meshserver 拉取已加入的頻道，用於會話列表（與 App 初始化 effect 邏輯一致）。
 */
export async function fetchInitialMeshGroupThreads(get: GetFn): Promise<MeshserverGroupThread[]> {
  const connResp = await get<unknown>("/api/v1/meshserver/connections").catch(() => null);
  const connections: unknown[] = Array.isArray((connResp as { connections?: unknown[] })?.connections)
    ? ((connResp as { connections: unknown[] }).connections)
    : [];
  const activeConn = (connections[0] || null) as Record<string, unknown> | null;
  const connectionName =
    typeof activeConn?.name === "string" ? activeConn.name : undefined;
  const myUserId = typeof activeConn?.user_id === "string" ? activeConn.user_id : undefined;

  if (!connectionName) return [];

  const q = `?connection=${encodeURIComponent(connectionName)}`;

  const myServersResp = await get<unknown>(`/api/v1/meshserver/my_servers${q}`).catch(() => null);

  const myServers: unknown[] = Array.isArray((myServersResp as { servers?: unknown[] })?.servers)
    ? ((myServersResp as { servers: unknown[] }).servers)
    : [];

  const spaceIds = myServers
    .map(e => {
      const x = e as {
        space?: { space_id?: string };
        space_id?: string;
        server_id?: string;
      };
      return x?.space?.space_id || x?.space_id || x?.server_id || "";
    })
    .filter(Boolean) as string[];

  const nextThreads: MeshserverGroupThread[] = [];

  for (const spaceId of spaceIds) {
    const groupsResp = await get<unknown>(
      `/api/v1/meshserver/spaces/${encodeURIComponent(spaceId)}/my_groups${q}`
    ).catch(() => null);

    const groups = normalizeEntityList<Record<string, unknown>>(groupsResp, ["groups"]);

    for (const g of groups) {
      const channelId =
        (g?.channel_id as string) || (g?.channelId as string) || (g?.id as string) || "";
      if (!channelId) continue;
      if ((g as { can_view?: boolean }).can_view === false) continue;
      nextThreads.push({
        kind: "meshserver_group",
        threadId: channelId,
        channel_id: channelId,
        server_id: spaceId,
        title: (g?.name as string) || "未命名群",
        subtitle: "中心化群",
        connectionName,
        myUserId
      });
    }
  }

  return nextThreads;
}
