"use client";

import { useCallback, useEffect, useRef } from "react";
import { useGameStore } from "@/stores/game-store";
import { triggerAIMoveIfNeeded } from "@/stores/game-store";
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
  useGameStore.getState().handleEvent(e as any);
  triggerAIMoveIfNeeded();
}

/**
 * 玩家对局连接：读取大厅身份，建立 SSE 事件流并同步状态。
 * 大厅信息优先来自 sessionStorage（刷新后可恢复），并同步到 store。
 */
export function useRoomGame() {
  const playerId = useGameStore((s) => s.playerId);
  const code = useGameStore((s) => s.code);
  const setLobby = useGameStore((s) => s.setLobby);
  const handleEvent = useGameStore((s) => s.handleEvent);

  const esRef = useRef<EventSource | null>(null);
  const codeRef = useRef<string>("");

  // 刷新后从 sessionStorage 恢复身份
  useEffect(() => {
    if (useGameStore.getState().playerId) return;
    const info = readLobby();
    if (info?.code) setLobby(info);
  }, [setLobby]);

  useEffect(() => {
    if (!playerId || !code) return;
    if (esRef.current && codeRef.current === code) return;

    esRef.current?.close();
    codeRef.current = code;

    // 连接即拉取当前全量状态（重连/加入）
    fetch(`/api/rooms/${code}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((room) => {
        if (room) handleEvent({ type: "state", room });
      })
      .catch(() => {});

    const es = new EventSource(`/api/rooms/${code}/stream`);
    es.addEventListener("room", (ev) => {
      try {
        handleEventDispatch(JSON.parse((ev as MessageEvent).data));
      } catch {
        /* ignore malformed */
      }
    });
    es.onerror = () => {
      /* 浏览器会自动重连 */
    };
    esRef.current = es;

    return () => {
      es.close();
      esRef.current = null;
      codeRef.current = "";
    };
  }, [playerId, code, handleEvent]);
}

/** 观战连接：只读订阅，不写入 playerId */
export function useSpectate(code: string) {
  const handleEvent = useGameStore((s) => s.handleEvent);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!code) return;
    fetch(`/api/rooms/${code}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((room) => {
        if (room) handleEvent({ type: "state", room });
      })
      .catch(() => {});

    const es = new EventSource(`/api/rooms/${code}/stream`);
    es.addEventListener("room", (ev) => {
      try {
        handleEventDispatch(JSON.parse((ev as MessageEvent).data));
      } catch {
        /* ignore */
      }
    });
    esRef.current = es;

    return () => {
      esRef.current?.close();
      esRef.current = null;
    };
  }, [code, handleEvent]);
}
