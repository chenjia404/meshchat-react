const SIZE_UNITS = ["B", "KB", "MB", "GB", "TB"];

export function formatFileSize(bytes?: number | null): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes === 0) return "0 B";
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < SIZE_UNITS.length - 1) {
    size /= 1024;
    unit++;
  }
  const value = size >= 10 || unit === 0 ? Math.round(size) : Math.round(size * 10) / 10;
  return `${value} ${SIZE_UNITS[unit]}`;
}
