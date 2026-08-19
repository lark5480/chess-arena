"use client";

import { useGameStore } from "@/stores/game-store";
import { Timer } from "./Timer";
import type { Color } from "@/types";

export function PlayerInfo({ color }: { color: Color }) {
  const player = useGameStore((s) => (color === "white" ? s.white : s.black));
  const turn = useGameStore((s) => s.turn);
  const status = useGameStore((s) => s.status);

  const isTurn = status === "playing" && turn === color;
  const name = player?.name ?? (color === "white" ? "白方" : "黑方");
  const avatar = player?.avatar ?? (color === "white" ? "♔" : "♚");

  return (
    <div
      className={`flex items-center justify-between rounded-lg border px-3 py-2 transition-colors ${
        isTurn ? "border-accent bg-surface-2" : "border-border bg-surface"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-2xl leading-none">{avatar}</span>
        <div>
          <div className="text-sm font-medium text-gray-100">
            {name}
            {color === "white" ? "（白）" : "（黑）"}
          </div>
          {player && !player.connected && (
            <div className="text-xs text-red-400">已离线</div>
          )}
        </div>
      </div>
      <Timer color={color} />
    </div>
  );
}
