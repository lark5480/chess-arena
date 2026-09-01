"use client";

import dynamic from "next/dynamic";
import { useGameStore } from "@/stores/game-store";
import { PlayerInfo } from "@/components/chess/PlayerInfo";
import { MoveHistory } from "@/components/chess/MoveHistory";
import { GameControls } from "@/components/chess/GameControls";
import { ChatPanel } from "@/components/room/ChatPanel";
import { RulesPanel } from "@/components/chess/RulesPanel";
import { StatusNotice } from "@/components/ui/StatusNotice";
import type { Color } from "@/types";

const ChessBoard = dynamic(
  () => import("@/components/chess/ChessBoard").then((m) => m.ChessBoard),
  { ssr: false }
);

export function GameView({ spectator = false }: { spectator?: boolean }) {
  const myColor = useGameStore((s) => s.myColor);
  const topColor: Color = spectator ? "white" : myColor === "white" ? "black" : "white";
  const bottomColor: Color = spectator ? "black" : (myColor as Color);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex flex-col gap-3">
        <PlayerInfo color={topColor} />
        <ChessBoard />
        <PlayerInfo color={bottomColor} />
      </div>

      <div className="flex flex-col gap-3">
        <StatusNotice />
        {!spectator && (
          <div className="rounded-xl border border-border bg-surface p-3">
            <GameControls />
          </div>
        )}
        <div className="h-48 min-h-[12rem] rounded-xl border border-border bg-surface p-3">
          <MoveHistory />
        </div>
        {!spectator && (
          <div className="h-56 min-h-[14rem] rounded-xl border border-border bg-surface p-3">
            <ChatPanel />
          </div>
        )}
        <RulesPanel />
        {spectator && (
          <div className="rounded-xl border border-border bg-surface p-4 text-center text-sm text-muted">
            👁️ 观战模式 · 仅可观看，无法操作
          </div>
        )}
      </div>
    </div>
  );
}
