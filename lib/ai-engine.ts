import { createGame } from "./chess-engine";

/** 子力价值，单位厘兵（centipawn）。王为 0——王不可被吃，其价值由 PST 的位置项体现 */
export const PIECE_VALUE: Record<string, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};

/** 将死分。必须远大于任何真实局面分（满盘子力约 4000 + 位置项约 500） */
const MATE_SCORE = 100000;

/**
 * 位置价值表（Piece-Square Tables），白方视角：索引 0 = a8 … 63 = h1。
 * 取值来自 Simplified Evaluation Function 的经典经验值，用于让引擎理解
 * 「马占中心、兵要推进、王要易位躲兵后」等位置概念——纯子力评估做不到这点。
 */
export const PIECE_SQUARE_TABLES: Record<string, readonly number[]> = {
  // 兵：强烈鼓励推进，7 排几乎升变
  p: [
    0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5,
    10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20,
    -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0,
  ],
  // 马：中心格价值高，边角大幅惩罚
  n: [
    -50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10,
    0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10,
    5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  // 象：鼓励出子与斜线控制，惩罚滞留底线
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0,
    -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10,
    -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  // 车：占据开放线，7 排切入
  r: [
    0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0,
    0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0,
    5, 5, 0, 0, 0,
  ],
  // 后：轻微惩罚过早出动，鼓励中心
  q: [
    -20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0,
    0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  // 王：中局鼓励留在角落易位后的安全区，惩罚暴露在中心
  k: [
    -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40,
    -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30,
    -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0,
    10, 30, 20,
  ],
};

/** 黑方用垂直镜像表：索引 sq ^ 56 即得到同一格的白方视角索引 */
const FLIPPED_SQUARE = Array.from({ length: 64 }, (_, sq) => sq ^ 56);

/** chess.js verbose 走法中用到的最小字段集 */
interface VerboseMove {
  from: string;
  to: string;
  piece: string;
  captured?: string;
  promotion?: string;
}

/** 局面评估（白方视角，为正表示白优）：子力 + 位置 */
function evaluate(chess: ReturnType<typeof createGame>): number {
  let score = 0;
  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = board[r][c];
      if (!cell) continue;
      // board()[r][c] 中 r=0 为 8 排、c=0 为 a 列，与 PST 的 a8=0 布局一致
      const square = r * 8 + c;
      const table = PIECE_SQUARE_TABLES[cell.type];
      const index = cell.color === "w" ? square : FLIPPED_SQUARE[square];
      const v = (PIECE_VALUE[cell.type] ?? 0) + (table?.[index] ?? 0);
      score += cell.color === "w" ? v : -v;
    }
  }
  return score;
}

/** 走法排序：按 MVV-LVA 降序，吃子与升变优先，提升 alpha-beta 剪枝效率 */
function orderedMoves(chess: ReturnType<typeof createGame>): VerboseMove[] {
  const moves = chess.moves({ verbose: true }) as unknown as VerboseMove[];
  moves.sort((a, b) => moveOrderScore(b) - moveOrderScore(a));
  return moves;
}

/** MVV-LVA：优先「用低价值子吃高价值子」，其次奖励升变 */
function moveOrderScore(m: VerboseMove): number {
  let s = 0;
  if (m.captured) {
    const victim = PIECE_VALUE[m.captured] ?? 100;
    const attacker = PIECE_VALUE[m.piece] ?? 0;
    s += victim * 10 - attacker;
  }
  if (m.promotion) s += PIECE_VALUE[m.promotion] ?? 0;
  return s;
}

/**
 * 静态搜索最大层数：防止长吃子链导致搜索爆炸。
 * 实测 8 层会让中局单步耗时翻倍，而超过 5 层的吃子链在实战中极少见，
 * 因此取 5——棋力基本无损，性能显著改善。
 */
const QUIESCENCE_MAX_PLY = 5;

/**
 * 静态搜索（Quiescence Search）。
 *
 * depth 用尽时局面可能正处在吃子中途（例如刚吃掉一个兵、下一手就被反吃），
 * 此时直接取静态评估会严重误判——这就是地平线效应，也是"AI 白送子"的根因。
 * 这里在叶子节点继续只搜索吃子与升变，直到局面"平静"再评估。
 *
 * stand-pat：以当前静态评估作为下界，若已足够好则不再深挖，兼顾剪枝与收敛。
 * 被将军时 stand-pat 不成立（必须应将），需搜索全部走法。
 */
function quiescence(
  chess: ReturnType<typeof createGame>,
  alpha: number,
  beta: number,
  ply = 0
): number {
  if (ply >= QUIESCENCE_MAX_PLY) return evaluate(chess);
  if (chess.isGameOver()) {
    if (chess.isCheckmate()) return chess.turn() === "w" ? -MATE_SCORE : MATE_SCORE;
    return 0;
  }

  const maximizing = chess.turn() === "w";
  const inCheck = chess.isCheck();
  let best = inCheck ? (maximizing ? -Infinity : Infinity) : evaluate(chess);

  if (!inCheck) {
    if (maximizing) {
      if (best >= beta) return best;
      alpha = Math.max(alpha, best);
    } else {
      if (best <= alpha) return best;
      beta = Math.min(beta, best);
    }
  }

  const all = orderedMoves(chess);
  // 只展开吃子，不展开升变：升变可以延后，不属于"未平息的剧烈变化"。
  // 若把它算进来，stand-pat 的下界语义会被破坏——搜索会认为"先走一步闲棋再升变"
  // 优于"立即升变"，产生假性的分数跳变（子力仅 100 的局面却评估出 890）。
  const candidates = inCheck ? all : all.filter((m) => m.captured);
  for (const m of candidates) {
    chess.move(m);
    const score = quiescence(chess, alpha, beta, ply + 1);
    chess.undo();
    if (maximizing) {
      if (score > best) best = score;
      if (best >= beta) break;
      alpha = Math.max(alpha, best);
    } else {
      if (score < best) best = score;
      if (best <= alpha) break;
      beta = Math.min(beta, best);
    }
  }
  return best;
}

/** minimax，返回白方视角值 */
function minimax(
  chess: ReturnType<typeof createGame>,
  depth: number,
  alpha: number,
  beta: number
): number {
  if (chess.isGameOver()) {
    if (chess.isCheckmate()) return chess.turn() === "w" ? -MATE_SCORE : MATE_SCORE;
    return 0;
  }
  // 叶子交给静态搜索，避免在地吃子中途评估造成误判
  if (depth === 0) return quiescence(chess, alpha, beta);

  const moves = orderedMoves(chess);
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

/**
 * 单次搜索的时间预算（毫秒）。超时即采用上一层完整结果，避免卡顿。
 * 取 1200 是实测权衡：中局 depth 1+2 累计约 1070ms，预算低于此值会让
 * depth 2 层在循环中反复被截断丢弃、最终只得到 depth 1 的结果，
 * 迭代加深反而退化为负优化。
 */
const DEFAULT_TIME_BUDGET_MS = 1200;

/**
 * 为当前局面（轮到某方）选择一步走法。
 *
 * 采用迭代加深：从 depth 1 逐层搜索到目标深度，任一层超时就沿用上一层结果。
 * 相比固定深度搜索有两个好处：
 * 1. 一定有可用结果（浅层已完成），不会因困难局面卡住 UI；
 * 2. 每层把上一层最佳走法提到最前（主变优先），alpha-beta 剪枝更狠，反而更快。
 */
export function chooseAIMove(
  fen: string,
  depth = 2,
  timeBudgetMs = DEFAULT_TIME_BUDGET_MS
): AIMove | null {
  const chess = createGame(fen);
  const moves = orderedMoves(chess);
  if (moves.length === 0) return null;

  const deadline = Date.now() + timeBudgetMs;
  const maximizing = chess.turn() === "w";
  let ordered = moves;
  let bestMoves: VerboseMove[] = moves;

  for (let d = 1; d <= depth; d++) {
    let layerBest = maximizing ? -Infinity : Infinity;
    let layerMoves: VerboseMove[] = [];
    let alpha = -Infinity;
    let beta = Infinity;
    let completed = true;

    for (const m of ordered) {
      chess.move(m);
      // 根层沿用当前窗口：兄弟子树间剪枝生效
      const score = minimax(chess, d - 1, alpha, beta);
      chess.undo();
      if (maximizing ? score > layerBest : score < layerBest) {
        layerBest = score;
        layerMoves = [m];
      } else if (score === layerBest) {
        layerMoves.push(m);
      }
      if (maximizing) alpha = Math.max(alpha, layerBest);
      else beta = Math.min(beta, layerBest);
      if (Date.now() >= deadline) {
        completed = false;
        break;
      }
    }

    // 本层未搜完说明结果不完整，丢弃它并沿用上一层
    if (!completed) break;
    bestMoves = layerMoves;
    ordered = [...layerMoves, ...ordered.filter((m) => !layerMoves.includes(m))];
    if (Date.now() >= deadline) break;
  }

  const pick = bestMoves[Math.floor(Math.random() * bestMoves.length)] ?? moves[0];
  return { from: pick.from, to: pick.to, promotion: pick.promotion };
}
