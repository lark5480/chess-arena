/**
 * 进程内滑动窗口限流（单实例内存版，重启即清零）。
 * 仅用于防滥用，不追求精确计数。
 */
const hits = new Map<string, number[]>();

export function allowRequest(key: string, limit: number, windowMs: number): boolean {
  const nowTs = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => nowTs - t < windowMs);
  if (arr.length >= limit) {
    hits.set(key, arr);
    return false;
  }
  arr.push(nowTs);
  hits.set(key, arr);
  return true;
}

/** 清理窗口外已无记录的 key，防止 Map 无限增长（由房间清扫定期调用） */
export function pruneRateLimit(windowMs: number): void {
  const nowTs = Date.now();
  for (const [key, arr] of hits) {
    if (!arr.some((t) => nowTs - t < windowMs)) hits.delete(key);
  }
}
