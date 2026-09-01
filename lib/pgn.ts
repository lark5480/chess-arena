import { applyMove, createGame, generatePgn } from "./chess-engine";
import type { Color, MoveRecord } from "@/types";

/** 走法的最小表示：UCI（from+to），升变追加棋子字母 */
export interface UciMove {
  from: string;
  to: string;
  promotion?: string;
}

/** 回放所需的一步：UCI + 记谱 + 走子后的局面 */
export interface ReplayMove extends UciMove {
  san: string;
  fen: string;
}

/**
 * 把走法序列编码为紧凑的 URL 安全串（逗号分隔的 UCI）。
 * 一局 60 步约 300 字符，远低于各浏览器的 URL 长度限制，
 * 因此可以无需任何服务端存储即可分享对局。
 */
export function encodeMoves(moves: UciMove[]): string {
  return moves.map((m) => `${m.from}${m.to}${m.promotion ?? ""}`).join(",");
}

/**
 * 解码并重放走法序列，得到每一步的记谱与局面。
 * 遇非法走法即停止（分享链接被截断或篡改时不会崩溃）。
 */
export function buildReplay(encoded: string): ReplayMove[] {
  const chess = createGame();
  const out: ReplayMove[] = [];
  for (const token of encoded.split(",")) {
    if (!token) continue;
    const from = token.slice(0, 2);
    const to = token.slice(2, 4);
    const promotion = token.length > 4 ? token[4] : undefined;
    const r = applyMove(chess, { from, to, promotion });
    if (!r.ok || !r.fen || !r.san) break;
    out.push({ from, to, promotion, san: r.san, fen: r.fen });
  }
  return out;
}

/** PGN 的 Result 标签值 */
export function pgnResult(winner: Color | null, gameOver: boolean): string {
  if (!gameOver) return "*";
  if (!winner) return "1/2-1/2";
  return winner === "white" ? "1-0" : "0-1";
}

/**
 * 用走法记录重放一局并生成标准 PGN。
 * 不依赖存活的 Chess 实例——房间状态是内存态，只需要 moves 就能导出。
 */
export function pgnFromMoves(
  moves: UciMove[],
  meta: { white: string; black: string; result?: string }
): string {
  const chess = createGame();
  for (const m of moves) {
    if (!applyMove(chess, m).ok) break;
  }
  return generatePgn(chess, meta);
}

/** 从房间状态导出 PGN（对局结束后调用） */
export function pgnFromRoom(room: {
  moves: MoveRecord[];
  players: { color: Color; name: string }[];
  gameOver: boolean;
  result?: { winner: Color | null };
}): string {
  const white = room.players.find((p) => p.color === "white")?.name ?? "White";
  const black = room.players.find((p) => p.color === "black")?.name ?? "Black";
  const result = pgnResult(room.result?.winner ?? null, room.gameOver);
  return pgnFromMoves(room.moves, { white, black, result });
}
