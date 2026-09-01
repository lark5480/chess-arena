"use client";

import { useGameStore } from "@/stores/game-store";
import { Button } from "@/components/ui/Button";
import { invertColor, generatePgn, createGame } from "@/lib/chess-engine";
import { Flag, Handshake, Undo2, Download } from "lucide-react";

function downloadPgn(pgn: string, code: string) {
  const blob = new Blob([pgn], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `chess-arena-${code}.pgn`;
  a.click();
  URL.revokeObjectURL(url);
}

export function GameControls() {
  const myColor = useGameStore((s) => s.myColor);
  const mode = useGameStore((s) => s.mode);
  const status = useGameStore((s) => s.status);
  const gameOver = useGameStore((s) => s.gameOver);
  const drawOfferBy = useGameStore((s) => s.drawOfferBy);
  const takebackBy = useGameStore((s) => s.takebackBy);
  const moves = useGameStore((s) => s.moves);
  const code = useGameStore((s) => s.code);
  const white = useGameStore((s) => s.white);
  const black = useGameStore((s) => s.black);

  const resign = useGameStore((s) => s.resign);
  const offerDraw = useGameStore((s) => s.offerDraw);
  const respondDraw = useGameStore((s) => s.respondDraw);
  const requestTakeback = useGameStore((s) => s.requestTakeback);
  const respondTakeback = useGameStore((s) => s.respondTakeback);

  const playing = status === "playing" && !gameOver && !!myColor;
  const opponent = myColor ? invertColor(myColor) : null;

  const handleExport = () => {
    const chess = createGame();
    for (const m of moves) {
      try {
        chess.move({ from: m.from, to: m.to, promotion: m.promotion as any });
      } catch {
        /* skip */
      }
    }
    const pgn = generatePgn(chess, {
      white: white?.name ?? "白方",
      black: black?.name ?? "黑方",
      result:
        gameOver && useGameStore.getState().result
          ? useGameStore.getState().result!.winner
            ? useGameStore.getState().result!.winner === "white"
              ? "1-0"
              : "0-1"
            : "1/2-1/2"
          : "*",
    });
    downloadPgn(pgn, code);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <Button variant="danger" disabled={!playing} onClick={() => resign()}>
          <Flag size={16} /> 认输
        </Button>
        <Button variant="secondary" disabled={!playing} onClick={() => offerDraw()}>
          <Handshake size={16} /> 求和
        </Button>
        <Button
          variant="secondary"
          disabled={!playing || mode === "friend"}
          onClick={() => requestTakeback()}
          title={mode === "friend" ? "好友对战不支持悔棋" : undefined}
        >
          <Undo2 size={16} /> 悔棋
        </Button>
        <Button variant="ghost" onClick={handleExport}>
          <Download size={16} /> 导出棋谱
        </Button>
      </div>

      {drawOfferBy && opponent && drawOfferBy === opponent && (
        <div className="rounded-lg border border-accent/60 bg-surface-2 p-2 text-sm">
          <p className="mb-2 text-muted">对方请求和棋</p>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => respondDraw(true)}>
              接受
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => respondDraw(false)}>
              拒绝
            </Button>
          </div>
        </div>
      )}
      {drawOfferBy && myColor && drawOfferBy === myColor && (
        <p className="text-center text-xs text-muted">已发送和棋请求，等待对方回应…</p>
      )}

      {takebackBy && opponent && takebackBy === opponent && mode !== "friend" && (
        <div className="rounded-lg border border-accent/60 bg-surface-2 p-2 text-sm">
          <p className="mb-2 text-muted">对方请求悔棋</p>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => respondTakeback(true)}>
              同意
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => respondTakeback(false)}>
              拒绝
            </Button>
          </div>
        </div>
      )}
      {takebackBy && myColor && takebackBy === myColor && mode !== "friend" && (
        <p className="text-center text-xs text-muted">已发送悔棋请求，等待对方回应…</p>
      )}
    </div>
  );
}
