export function normalizeList<T = any>(value: any): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && Array.isArray(value.messages)) return value.messages as T[];
  if (value && Array.isArray(value.items)) return value.items as T[];
  if (value && Array.isArray(value.data)) return value.data as T[];
  return [];
}

export function normalizeEntityList<T = any>(value: any, keys: string[]): T[] {
  if (Array.isArray(value)) return value as T[];
  if (!value || typeof value !== "object") return [];
  for (const k of keys) {
    const v = (value as any)[k];
    if (Array.isArray(v)) return v as T[];
  }
  // 兼容一些通用包裹格式
  return normalizeList<T>(value);
}

export function safeJsonParse<T = any>(value: unknown): T | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
