"use client";

import { useState } from "react";

const PIECE_RULES = [
  {
    name: "王 (King)",
    move: "横、竖、斜走一格",
    capture: "同走法",
    note: "不能走到被对方攻击的格子；被将死则输棋。",
  },
  {
    name: "后 (Queen)",
    move: "横、竖、斜走，格数不限",
    capture: "同走法",
    note: "不能越过其他棋子。",
  },
  {
    name: "车 (Rook)",
    move: "横、竖走，格数不限",
    capture: "同走法",
    note: "不能越过其他棋子。",
  },
  {
    name: "象 (Bishop)",
    move: "只能斜走，格数不限",
    capture: "同走法",
    note: "不能越过其他棋子；白格象永远只在白格，黑格象永远只在黑格。",
  },
  {
    name: "马 (Knight)",
    move: "走“日”字形",
    capture: "走到目标格，吃掉该格棋子",
    note: "可以越过其他棋子（无“蹩马腿”限制）。",
  },
  {
    name: "兵 (Pawn)",
    move: "只能向前直走；第一步可选走 1 格或 2 格，之后每次只能走 1 格",
    capture: "斜前方一格",
    note: "走法和吃法不同；到达底线可升变为后、车、象或马。",
  },
];

export function RulesPanel() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-surface p-4 text-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between font-semibold text-foreground hover:text-accent transition-colors"
      >
        <span>📜 玩法规则</span>
        <span className="text-muted">{open ? "收起" : "展开"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3 text-muted">
          <p>
            国际象棋双方各 16
            枚棋子，目标是将死对方的王。轮到某一方走时，若该方王正被攻击，称为“被将军”，必须立即应将。
          </p>

          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-left">
              <thead className="bg-surface-2 text-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">棋子</th>
                  <th className="px-3 py-2 font-medium">走法</th>
                  <th className="px-3 py-2 font-medium">吃子</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {PIECE_RULES.map((p) => (
                  <tr key={p.name} className="align-top">
                    <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap">
                      {p.name}
                    </td>
                    <td className="px-3 py-2">{p.move}</td>
                    <td className="px-3 py-2">
                      {p.capture}
                      <div className="mt-1 text-xs text-muted/80">{p.note}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-1 text-xs">
            <p>
              <span className="text-foreground font-medium">胜负：</span>
              将死对方王获胜；逼和、三次重复局面、50 步规则、子力不足则为和棋。
            </p>
            <p>
              <span className="text-foreground font-medium">提示：</span>
              被将军时，王所在格会闪烁红色，请尽快应将。
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
