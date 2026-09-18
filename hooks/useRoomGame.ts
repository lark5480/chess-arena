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
 * - 断线后主动 close 并统一走自研指数退避（3s 起、上限 30s，带随机抖动）：
 *   EventSource 原生自动重连固定约 3s 且无退避，故障期会造成请求风暴（曾表现为刷屏 429）；
 * - 服务端在平台函数超时前会主动轮换连接（先发 rotate 事件再关闭），
 *   此时静默快速重连、不提示用户；
 * - 连续失败多次后确认一次房间状态（404 才停止重连并提示）。
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
  // 服务端主动轮换标记：收到 rotate 事件后关闭属于预期行为，静默重连即可
  let serverRotated = false;

  const scheduleRetry = (instant = false) => {
    if (disposed || retryTimer) return;
    const backoff = instant ? 0 : Math.min(3000 * 2 ** retryCount, 30_000);
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
    // 服务端连接轮换信号（随后会主动关闭）：立即静默重连，不打扰用户
    es.addEventListener("rotate", () => {
      serverRotated = true;
    });
    es.onopen = () => {
      retryCount = 0;
      serverRotated = false;
      useGameStore.getState().setToast(null);
    };
    es.onerror = () => {
      if (disposed) return;
      // 接管重连：关闭浏览器原生自动重连，统一走指数退避，避免故障期请求风暴
      es?.close();
      if (serverRotated) {
        // 平台函数超时前的正常轮换：静默快速重连
        serverRotated = false;
        scheduleRetry(true);
        return;
      }
      useGameStore.getState().setToast("连接中断，正在重连…");
      // 连续多次失败后确认房间是否已被清理（404 才停止重连）
      if (retryCount >= 3) confirmRoomGone();
      else scheduleRetry();
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
