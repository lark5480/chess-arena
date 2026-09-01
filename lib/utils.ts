import type { Color, GameResult, GameResultReason, TimeLimit } from "@/types";

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export const TIME_LIMIT_OPTIONS: { value: TimeLimit; label: string }[] = [
  { value: 300, label: "5 分钟" },
  { value: 600, label: "10 分钟" },
  { value: 900, label: "15 分钟" },
  { value: 0, label: "无限制" },
];

export function formatClock(seconds: number): string {
  if (seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function colorLabel(c: Color): string {
  return c === "white" ? "白方" : "黑方";
}

export const RESULT_REASON_TEXT: Record<GameResultReason, string> = {
  checkmate: "将死",
  resignation: "认输",
  timeout: "超时",
  draw: "协议和棋",
  stalemate: "逼和（无子可动）",
  insufficient: "子力不足",
  threefold: "三次重复局面",
  fifty: "50 步规则",
};

export function resultText(r: GameResult): string {
  if (r.winner)
    return `${r.winner === "white" ? "白方" : "黑方"}胜 · ${RESULT_REASON_TEXT[r.reason]}`;
  return `和棋 · ${RESULT_REASON_TEXT[r.reason]}`;
}

export function makeInitials(name: string): string {
  return name.trim().slice(0, 2) || "?";
}
