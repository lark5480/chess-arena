"use client";

import { useGameStore } from "@/stores/game-store";
import { Button } from "@/components/ui/Button";
import { resultText } from "@/lib/utils";
import { Trophy, RotateCcw } from "lucide-react";

export function GameResultModal() {
  const gameOver = useGameStore((s) => s.gameOver);
  const result = useGameStore((s) => s.result);
  const myColor = useGameStore((s) => s.myColor);
  const rematch = useGameStore((s) => s.rematch);

  if (!gameOver || !result || !myColor) return null;

  const iWon =
    result.winner &&
    ((myColor === "white" && result.winner === "white") ||
      (myColor === "black" && result.winner === "black"));
  const iLost = result.winner && !iWon;
  const title = result.winner ? (iWon ? "你赢了！" : iLost ? "你输了" : "对局结束") : "和棋";

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 fade-in">
      <div className="w-80 rounded-2xl border border-border bg-surface p-6 text-center shadow-xl">
        <Trophy size={40} className="mx-auto mb-3 text-accent" />
        <h2 className="mb-1 text-xl font-bold text-gray-100">{title}</h2>
        <p className="mb-5 text-sm text-muted">{resultText(result)}</p>
        <Button className="w-full" onClick={() => rematch()}>
          <RotateCcw size={16} /> 再来一局（交换先后手）
        </Button>
      </div>
    </div>
  );
}
