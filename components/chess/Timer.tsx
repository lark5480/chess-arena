"use client";

import { useEffect, useRef, useState } from "react";
import { useGameStore } from "@/stores/game-store";
import { formatClock } from "@/lib/utils";
import type { Color } from "@/types";

export function Timer({ color }: { color: Color }) {
  const turn = useGameStore((s) => s.turn);
  const status = useGameStore((s) => s.status);
  const gameOver = useGameStore((s) => s.gameOver);
  const timeLimit = useGameStore((s) => s.timeLimit);
  const clocks = useGameStore((s) => s.clocks);
  const clockUpdatedAt = useGameStore((s) => s.clockUpdatedAt);
  const gameNo = useGameStore((s) => s.gameNo);
  const declareTimeout = useGameStore((s) => s.declareTimeout);
  const playerId = useGameStore((s) => s.playerId);

  const serverMs = clocks ? clocks[color] : timeLimit * 1000;
  const [displayMs, setDisplayMs] = useState<number>(serverMs);
  const firedRef = useRef(false);

  // Sync with authoritative server value whenever it changes
  useEffect(() => {
    setDisplayMs(serverMs);
    firedRef.current = false;
  }, [serverMs]);

  // Local ticking for display only
  useEffect(() => {
    if (status !== "playing" || gameOver || turn !== color || timeLimit <= 0) return;

    const interval = setInterval(() => {
      setDisplayMs(() => {
        const elapsed = Date.now() - clockUpdatedAt;
        return Math.max(0, serverMs - elapsed);
      });
    }, 500); // 显示粒度为秒，500ms 轮询足够平滑

    return () => clearInterval(interval);
  }, [status, gameOver, turn, color, timeLimit, clockUpdatedAt, serverMs]);

  // 时钟归零即上报（含对方时钟：服务端按权威值复核，对方关页也能按钟获胜）
  useEffect(() => {
    if (
      displayMs <= 0 &&
      !firedRef.current &&
      status === "playing" &&
      !gameOver &&
      turn === color &&
      timeLimit > 0 &&
      playerId
    ) {
      firedRef.current = true;
      declareTimeout(color);
    }
  }, [displayMs, status, gameOver, turn, color, timeLimit, playerId, declareTimeout]);

  if (timeLimit === 0) {
    return <span className="font-mono text-lg text-muted">∞</span>;
  }

  const totalSec = Math.ceil(displayMs / 1000);
  const low = totalSec <= 10 && turn === color;
  return (
    <span
      className={`font-mono text-lg tabular-nums ${
        turn === color && status === "playing" && !gameOver
          ? low
            ? "text-red-400"
            : "text-gray-100"
          : "text-muted"
      }`}
    >
      {formatClock(totalSec)}
    </span>
  );
}
