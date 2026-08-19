"use client";

import { Card } from "@/components/ui/Card";
import type { Color } from "@/types";

const OPTIONS: { piece: string; label: string; glyph: string }[] = [
  { piece: "q", label: "皇后", glyph: "♕" },
  { piece: "r", label: "车", glyph: "♖" },
  { piece: "b", label: "象", glyph: "♗" },
  { piece: "n", label: "马", glyph: "♘" },
];

export function PromotionDialog({
  color,
  onPick,
  onCancel,
}: {
  color: Color;
  onPick: (piece: string) => void;
  onCancel: () => void;
}) {
  const tint = color === "white" ? "#1d1d1f" : "#1d1d1f";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 fade-in">
      <Card className="w-72 p-5 text-center">
        <p className="mb-4 text-sm text-muted">兵已到达底线，选择升变棋子</p>
        <div className="grid grid-cols-4 gap-2">
          {OPTIONS.map((o) => (
            <button
              key={o.piece}
              onClick={() => onPick(o.piece)}
              className="flex flex-col items-center gap-1 rounded-lg border border-border bg-surface-2 py-3 hover:border-accent"
            >
              <span style={{ color: tint }} className="text-3xl leading-none">
                {o.glyph}
              </span>
              <span className="text-xs text-muted">{o.label}</span>
            </button>
          ))}
        </div>
        <button
          onClick={onCancel}
          className="mt-4 text-xs text-muted underline hover:text-gray-200"
        >
          取消
        </button>
      </Card>
    </div>
  );
}
