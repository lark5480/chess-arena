import { createGame } from "./chess-engine";

const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** 局面评估（白方视角，为正表示白优） */
function evaluate(chess: ReturnType<typeof createGame>): number {
  let score = 0;
  const board = chess.board();
  for (const row of board) {
    for (const cell of row) {
      if (!cell) continue;
      const v = PIECE_VALUE[cell.type] ?? 0;
      score += cell.color === "w" ? v : -v;
    }
  }
  return score;
}

/** minimax，返回白方视角值 */
function minimax(
  chess: ReturnType<typeof createGame>,
  depth: number,
  alpha: number,
  beta: number
): number {
  if (depth === 0 || chess.isGameOver()) {
    if (chess.isCheckmate()) return chess.turn() === "w" ? -10000 : 10000;
    if (chess.isDraw() || chess.isStalemate()) return 0;
    return evaluate(chess);
  }
  const moves = chess.moves({ verbose: true }) as any[];
  if (chess.turn() === "w") {
    let best = -Infinity;
    for (const m of moves) {
      chess.move(m);
      best = Math.max(best, minimax(chess, depth - 1, alpha, beta));
      chess.undo();
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const m of moves) {
      chess.move(m);
      best = Math.min(best, minimax(chess, depth - 1, alpha, beta));
      chess.undo();
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
}

export interface AIMove {
  from: string;
  to: string;
  promotion?: string;
}

/** 为当前局面（轮到某方）选择一步走法 */
export function chooseAIMove(fen: string, depth = 2): AIMove | null {
  const chess = createGame(fen);
  const moves = chess.moves({ verbose: true }) as any[];
  if (moves.length === 0) return null;

  const maximizing = chess.turn() === "w";
  let bestScore = maximizing ? -Infinity : Infinity;
  let bestMoves: any[] = [];
  for (const m of moves) {
    chess.move(m);
    const score = minimax(chess, depth - 1, -Infinity, Infinity);
    chess.undo();
    if (maximizing ? score > bestScore : score < bestScore) {
      bestScore = score;
      bestMoves = [m];
    } else if (score === bestScore) {
      bestMoves.push(m);
    }
  }
  const pick = bestMoves[Math.floor(Math.random() * bestMoves.length)] ?? moves[0];
  return { from: pick.from, to: pick.to, promotion: pick.promotion };
}
