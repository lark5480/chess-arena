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
  const myColor = useGameStore((s) => s.myColor);
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
    }, 200);

    return () => clearInterval(interval);
  }, [status, gameOver, turn, color, timeLimit, clockUpdatedAt, serverMs]);

  // Fire timeout when reaching zero (only own clock)
  useEffect(() => {
    if (
      displayMs <= 0 &&
      !firedRef.current &&
      status === "playing" &&
      !gameOver &&
      turn === color &&
      timeLimit > 0 &&
      color === myColor &&
      playerId
    ) {
      firedRef.current = true;
      declareTimeout();
    }
  }, [displayMs, status, gameOver, turn, color, timeLimit, myColor, playerId, declareTimeout]);

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