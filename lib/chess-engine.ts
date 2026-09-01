import { Chess } from "chess.js";
import type { Color, GameResult, GameResultReason } from "@/types";

export type ChessInstance = Chess;

export function createGame(fen?: string): Chess {
  return fen ? new Chess(fen) : new Chess();
}

export function mapTurn(turn: "w" | "b"): Color {
  return turn === "w" ? "white" : "black";
}

export function invertColor(c: Color): Color {
  return c === "white" ? "black" : "white";
}

export interface MoveAttempt {
  from: string;
  to: string;
  promotion?: string;
}

export interface ApplyMoveResult {
  ok: boolean;
  san?: string;
  fen?: string;
  error?: string;
}

/**
 * 在当前棋局实例上尝试走子。chess.js v1 对非法走子会抛错，
 * 这里统一捕获为 { ok:false }，便于 API / 前端做非法拦截。
 */
export function applyMove(chess: Chess, attempt: MoveAttempt): ApplyMoveResult {
  try {
    const move = chess.move({
      from: attempt.from,
      to: attempt.to,
      promotion: attempt.promotion as "n" | "b" | "r" | "q" | undefined,
    });
    if (!move) return { ok: false, error: "非法走子" };
    return { ok: true, san: move.san, fen: chess.fen() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "非法走子" };
  }
}

/** 该步是否触发升变（前端据此弹窗） */
export function isPromotionMove(fen: string, from: string, to: string): boolean {
  const chess = createGame(fen);
  const piece = chess.get(from as any);
  if (!piece || piece.type !== "p") return false;
  const targetRank = to[1];
  return (piece.color === "w" && targetRank === "8") || (piece.color === "b" && targetRank === "1");
}

/** 返回某格的所有合法目标格（用于高亮合法走法） */
export function legalTargetSquares(fen: string, square: string): string[] {
  const chess = createGame(fen);
  const moves = chess.moves({ verbose: true }) as Array<{ from: string; to: string }>;
  return moves.filter((m) => m.from === square).map((m) => m.to);
}

export interface GameEndInfo {
  over: boolean;
  winner: Color | null;
  reason?: GameResultReason;
}

/** 判定对局是否结束及原因（将死 / 逼和 / 三次重复 / 子力不足 / 50 步） */
export function evaluateGameEnd(chess: Chess): GameEndInfo {
  if (chess.isCheckmate()) {
    // 轮到谁走谁被将死，对方获胜
    return { over: true, winner: invertColor(mapTurn(chess.turn())), reason: "checkmate" };
  }
  if (chess.isStalemate()) return { over: true, winner: null, reason: "stalemate" };
  if (chess.isInsufficientMaterial()) return { over: true, winner: null, reason: "insufficient" };
  if (chess.isThreefoldRepetition()) return { over: true, winner: null, reason: "threefold" };
  if (chess.isDraw()) return { over: true, winner: null, reason: "fifty" };
  return { over: false, winner: null };
}

export function toGameResult(chess: Chess, gameNo: number): GameResult | null {
  const end = evaluateGameEnd(chess);
  if (!end.over) return null;
  return {
    gameNo,
    winner: end.winner,
    reason: end.reason as GameResultReason,
    endedAt: Date.now(),
  };
}

/** 生成标准 PGN（含对局双方与结果） */
export function generatePgn(
  chess: Chess,
  meta: { white: string; black: string; result?: string }
): string {
  chess.header(
    "Event",
    "Chess Arena",
    "White",
    meta.white,
    "Black",
    meta.black,
    "Result",
    meta.result ?? "*"
  );
  return chess.pgn();
}

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
