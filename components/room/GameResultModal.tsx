"use client";

import { useGameStore } from "@/stores/game-store";
import { Button } from "@/components/ui/Button";
import { resultText } from "@/lib/utils";
import { Trophy, RotateCcw, X } from "lucide-react";

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
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.style.display = "none";
      }}
    >
      <div className="relative w-80 rounded-2xl border border-border bg-surface p-6 text-center shadow-xl">
        <button
          onClick={(e) => {
            const overlay = e.currentTarget.closest(".fixed");
            if (overlay) (overlay as HTMLElement).style.display = "none";
          }}
          className="absolute right-3 top-3 text-muted hover:text-gray-200 transition-colors"
          title="关闭（可从走棋记录复盘）"
        >
          <X size={18} />
        </button>
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