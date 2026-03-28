import { api } from "./config";

export async function get<T = any>(path: string): Promise<T> {
  const r = await fetch(api(path));
  const data = (await r.json().catch(() => ({}))) as any;
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data as T;
}

export async function post<T = any>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(api(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = (await r.json().catch(() => ({}))) as any;
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data as T;
}

/** multipart/form-data（不设 Content-Type，由浏览器带 boundary） */
export async function postMultipart<T = any>(path: string, form: FormData): Promise<T> {
  const r = await fetch(api(path), {
    method: "POST",
    body: form,
    credentials: "include"
  });
  const data = (await r.json().catch(() => ({}))) as any;
  if (!r.ok) throw new Error(data.error || data.message || r.statusText);
  return data as T;
}

export async function patch<T = any>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(api(path), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: body != null ? JSON.stringify(body) : undefined
  });
  const data = (await r.json().catch(() => ({}))) as any;
  if (!r.ok) throw new Error(data.error || data.message || r.statusText);
  return data as T;
}

export async function put<T = any>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(api(path), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: body != null ? JSON.stringify(body) : undefined
  });
  const text = await r.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (!r.ok) {
    throw new Error(
      data.error || data.message || (text && text.length < 500 ? text : "") || r.statusText
    );
  }
  return data as T;
}

/** 刪除資源：優先 DELETE，405 時改 POST .../delete（兼容部分後端） */
export async function deleteChatResource(pathNoQuery: string): Promise<void> {
  const url = api(pathNoQuery);
  let r = await fetch(url, { method: "DELETE" });
  if (r.ok) return;
  let data: any = {};
  try {
    data = (await r.json().catch(() => ({}))) as any;
  } catch {
    data = {};
  }
  if (r.status === 405 || r.status === 501) {
    await post(`${pathNoQuery}/delete`, {});
    return;
  }
  throw new Error(data.error || r.statusText || "刪除失敗");
}
