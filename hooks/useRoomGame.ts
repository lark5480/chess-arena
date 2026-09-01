"use client";

import { useEffect } from "react";
import { useGameStore } from "@/stores/game-store";
import type { LobbyInfo } from "@/types";

const LOBBY_KEY = "chess-arena-lobby";

export function readLobby(): LobbyInfo | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(LOBBY_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LobbyInfo;
  } catch {
    return null;
  }
}

export function writeLobby(info: LobbyInfo): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(LOBBY_KEY, JSON.stringify(info));
}

export function clearLobby(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(LOBBY_KEY);
}

function handleEventDispatch(e: unknown) {
  // AI 触发在 store.handleEvent 内部统一处理，这里不要重复调用
  useGameStore.getState().handleEvent(e as any);
}

/**
 * 建立 SSE 连接并处理断线：
 * - 可恢复错误交给浏览器自动重连，同时提示用户；
 * - 指数退避重试（3s 起、上限 30s，带随机抖动），避免故障期所有客户端同步重连风暴；
 * - 致命关闭（如房间被清理返回 404）时确认一次房间状态，
 *   仍存在则延迟重建连接，否则停止重连并提示。
 */
function connectStream(opts: {
  code: string;
  playerId?: string;
  onFatalGone?: () => void;
}): () => void {
  const { code, playerId, onFatalGone } = opts;
  let es: EventSource | null = null;
  let disposed = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryCount = 0;

  const scheduleRetry = () => {
    if (disposed || retryTimer) return;
    const backoff = Math.min(3000 * 2 ** retryCount, 30_000);
    const delay = backoff + Math.random() * 1000; // 抖动打散各客户端的重连节奏
    retryCount += 1;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      connect();
    }, delay);
  };

  const confirmRoomGone = () => {
    fetch(`/api/rooms/${code}`)
      .then((r) => {
        if (disposed) return;
        if (r.status === 404) onFatalGone?.();
        else scheduleRetry();
      })
      .catch(() => {
        if (!disposed) scheduleRetry();
      });
  };

  const connect = () => {
    if (disposed) return;
    es?.close();
    const qs = playerId ? `?playerId=${encodeURIComponent(playerId)}` : "";
    es = new EventSource(`/api/rooms/${code}/stream${qs}`);
    es.addEventListener("room", (ev) => {
      try {
        handleEventDispatch(JSON.parse((ev as MessageEvent).data));
      } catch {
        /* ignore malformed */
      }
    });
    es.onopen = () => {
      retryCount = 0;
      useGameStore.getState().setToast(null);
    };
    es.onerror = () => {
      if (!es || es.readyState === EventSource.CLOSED) {
        confirmRoomGone();
      } else {
        useGameStore.getState().setToast("连接中断，正在重连…");
      }
    };
  };

  connect();

  return () => {
    disposed = true;
    if (retryTimer) clearTimeout(retryTimer);
    es?.close();
  };
}

/**
 * 玩家对局连接：读取大厅身份，建立 SSE 事件流并同步状态。
 * 大厅信息优先来自 sessionStorage（刷新后可恢复），并同步到 store。
 */
export function useRoomGame() {
  const playerId = useGameStore((s) => s.playerId);
  const code = useGameStore((s) => s.code);
  const setLobby = useGameStore((s) => s.setLobby);

  // 刷新后从 sessionStorage 恢复身份
  useEffect(() => {
    if (useGameStore.getState().playerId) return;
    const info = readLobby();
    if (info?.code) setLobby(info);
  }, [setLobby]);

  useEffect(() => {
    if (!playerId || !code) return;

    // 全量状态由 SSE 建连时的初始快照推送，无需重复 fetch
    return connectStream({
      code,
      playerId,
      onFatalGone: () => useGameStore.getState().setToast("房间不存在或已结束"),
    });
  }, [playerId, code]);
}

/** 观战连接：只读订阅，不写入 playerId */
export function useSpectate(code: string) {
  const handleEvent = useGameStore((s) => s.handleEvent);

  useEffect(() => {
    if (!code) return;
    return connectStream({ code });
  }, [code, handleEvent]);
}
