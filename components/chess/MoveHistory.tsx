"use client";

import { useEffect } from "react";
import { useGameStore } from "@/stores/game-store";
import { encodeMoves, pgnFromMoves, pgnResult } from "@/lib/pgn";

export function MoveHistory() {
  const moves = useGameStore((s) => s.moves);
  const viewIndex = useGameStore((s) => s.viewIndex);
  const setViewIndex = useGameStore((s) => s.setViewIndex);
  const goToLive = useGameStore((s) => s.goToLive);
  const white = useGameStore((s) => s.white);
  const black = useGameStore((s) => s.black);
  const gameOver = useGameStore((s) => s.gameOver);
  const result = useGameStore((s) => s.result);
  const code = useGameStore((s) => s.code);
  const setToast = useGameStore((s) => s.setToast);

  function buildPgn() {
    return pgnFromMoves(moves, {
      white: white?.name ?? "White",
      black: black?.name ?? "Black",
      result: pgnResult(result?.winner ?? null, gameOver),
    });
  }

  function downloadPgn() {
    const blob = new Blob([buildPgn()], { type: "application/x-chess-pgn;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chess-${code || "game"}.pgn`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** 走法编码进 URL hash，无需服务端存储即可分享 */
  async function shareReplay() {
    const params = new URLSearchParams();
    params.set("g", encodeMoves(moves));
    if (white?.name) params.set("w", white.name);
    if (black?.name) params.set("b", black.name);
    const url = `${window.location.origin}/replay#${params.toString()}`;
    try {
      await navigator.clipboard.writeText(url);
      setToast("回放链接已复制，打开即可回看");
    } catch {
      setToast("复制失败，请检查浏览器剪贴板权限");
    }
  }

  const rows: {
    no: number;
    whiteIdx?: number;
    blackIdx?: number;
    white?: string;
    black?: string;
  }[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    rows.push({
      no: Math.ceil(moves[i].moveNumber / 2),
      whiteIdx: i,
      blackIdx: i + 1 < moves.length ? i + 1 : undefined,
      white: moves[i]?.san,
      black: moves[i + 1]?.san,
    });
  }

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (moves.length === 0) return;
      const current = viewIndex ?? moves.length - 1;
      if (e.key === "ArrowLeft" && current > 0) {
        setViewIndex(current - 1);
      } else if (e.key === "ArrowRight") {
        if (current < moves.length - 1) setViewIndex(current + 1);
        else goToLive();
      } else if (e.key === "Home") {
        setViewIndex(0);
      } else if (e.key === "End") {
        goToLive();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [viewIndex, moves.length, setViewIndex, goToLive]);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-200">走棋记录</h3>
        {viewIndex !== null && (
          <button
            onClick={goToLive}
            className="rounded px-2 py-0.5 text-xs text-accent hover:bg-accent/10"
          >
            回到最新 →
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto rounded-lg bg-surface-2 p-2 text-sm">
        {rows.length === 0 ? (
          <p className="text-muted">对局尚未开始</p>
        ) : (
          <table className="w-full">
            <tbody>
              {rows.map((r) => (
                <tr key={r.no} className="border-b border-border/50">
                  <td className="w-8 py-1 text-muted">{r.no}.</td>
                  <td className="py-1 font-mono text-gray-100">
                    <button
                      onClick={() => r.whiteIdx !== undefined && setViewIndex(r.whiteIdx)}
                      className={`w-full rounded px-1 text-left ${
                        r.whiteIdx !== undefined && viewIndex === r.whiteIdx
                          ? "bg-accent/20 font-bold"
                          : "hover:bg-surface"
                      }`}
                    >
                      {r.white ?? ""}
                    </button>
                  </td>
                  <td className="py-1 pl-3 font-mono text-gray-100">
                    {r.blackIdx !== undefined ? (
                      <button
                        onClick={() => setViewIndex(r.blackIdx!)}
                        className={`w-full rounded px-1 text-left ${
                          viewIndex === r.blackIdx ? "bg-accent/20 font-bold" : "hover:bg-surface"
                        }`}
                      >
                        {r.black ?? ""}
                      </button>
                    ) : (
                      ""
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-2 flex gap-2">
        <button
          onClick={downloadPgn}
          disabled={moves.length === 0}
          className="flex-1 rounded-md border border-border px-2 py-1.5 text-xs text-gray-200 transition-colors hover:border-accent hover:text-white disabled:opacity-40 disabled:hover:border-border"
        >
          导出 PGN
        </button>
        <button
          onClick={shareReplay}
          disabled={moves.length === 0}
          className="flex-1 rounded-md border border-border px-2 py-1.5 text-xs text-gray-200 transition-colors hover:border-accent hover:text-white disabled:opacity-40 disabled:hover:border-border"
        >
          分享回放
        </button>
      </div>
    </div>
  );
}
