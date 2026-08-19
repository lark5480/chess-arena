"use client";

import { useGameStore } from "@/stores/game-store";

export function MoveHistory() {
  const moves = useGameStore((s) => s.moves);

  // 按整步（白+黑）分组
  const rows: { no: number; white?: string; black?: string }[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    const white = moves[i];
    const black = moves[i + 1];
    rows.push({
      no: Math.ceil(white.moveNumber / 2),
      white: white?.san,
      black: black?.san,
    });
  }

  return (
    <div className="flex h-full flex-col">
      <h3 className="mb-2 text-sm font-semibold text-gray-200">走棋记录</h3>
      <div className="flex-1 overflow-y-auto rounded-lg bg-surface-2 p-2 text-sm">
        {rows.length === 0 ? (
          <p className="text-muted">对局尚未开始</p>
        ) : (
          <table className="w-full">
            <tbody>
              {rows.map((r) => (
                <tr key={r.no} className="border-b border-border/50">
                  <td className="w-8 py-1 text-muted">{r.no}.</td>
                  <td className="py-1 font-mono text-gray-100">{r.white ?? ""}</td>
                  <td className="py-1 pl-3 font-mono text-gray-100">{r.black ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
