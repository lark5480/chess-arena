"use client";

import { useEffect } from "react";
import { useGameStore } from "@/stores/game-store";

/** error 短暂展示后自动消失，避免残留在界面上 */
const ERROR_TTL_MS = 4000;

/**
 * 全局操作反馈：store.error（非法走子/操作失败等）与 store.toast（连接状态）。
 * toast 由 SSE open 事件清除；error 定时自动清除。
 */
export function StatusNotice() {
  const error = useGameStore((s) => s.error);
  const toast = useGameStore((s) => s.toast);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => useGameStore.setState({ error: null }), ERROR_TTL_MS);
    return () => clearTimeout(t);
  }, [error]);

  if (!error && !toast) return null;

  return (
    <div className="flex flex-col gap-2" aria-live="polite">
      {toast && (
        <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-300">
          {toast}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}
