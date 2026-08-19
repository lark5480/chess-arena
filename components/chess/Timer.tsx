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
  const gameNo = useGameStore((s) => s.gameNo);
  const declareTimeout = useGameStore((s) => s.declareTimeout);
  const myColor = useGameStore((s) => s.myColor);
  const playerId = useGameStore((s) => s.playerId);

  const [secondsLeft, setSecondsLeft] = useState<number>(timeLimit);
  const firedRef = useRef(false);

  // 新对局 / 时限变更时重置
  useEffect(() => {
    setSecondsLeft(timeLimit);
    firedRef.current = false;
  }, [timeLimit, gameNo]);

  const active = status === "playing" && !gameOver && turn === color && timeLimit > 0;

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(id);
          if (!firedRef.current) {
            firedRef.current = true;
            // 由当前时钟归属方上报超时（仅己方时钟到 0 时本端负责）
            if (color === myColor) declareTimeout();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [active, color, myColor, declareTimeout]);

  if (timeLimit === 0) {
    return <span className="font-mono text-lg text-muted">∞</span>;
  }

  const low = secondsLeft <= 10;
  return (
    <span
      className={`font-mono text-lg tabular-nums ${
        active ? (low ? "text-red-400" : "text-gray-100") : "text-muted"
      }`}
    >
      {formatClock(secondsLeft)}
    </span>
  );
}
