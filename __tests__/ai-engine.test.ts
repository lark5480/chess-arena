import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseAIMove, PIECE_SQUARE_TABLES, PIECE_VALUE } from "../lib/ai-engine";

/** 格名转 PST 索引：PST 为白方视角，a8 = 0、h1 = 63 */
function sq(file: string, rank: number): number {
  return (8 - rank) * 8 + (file.charCodeAt(0) - 97);
}

test("PST：六种棋子各有完整 64 格", () => {
  for (const piece of ["p", "n", "b", "r", "q", "k"]) {
    assert.equal(PIECE_SQUARE_TABLES[piece].length, 64, `${piece} 表应为 64 格`);
  }
  assert.deepEqual(Object.keys(PIECE_SQUARE_TABLES).sort(), ["b", "k", "n", "p", "q", "r"]);
});

test("PST：方向为白方视角（a8=0、h1=63），未上下颠倒", () => {
  // 王表在 1 排（易位后的安全区）为正、8 排为负，此差异可捕获整表翻转的错误
  assert.ok(PIECE_SQUARE_TABLES.k[sq("g", 1)] > PIECE_SQUARE_TABLES.k[sq("g", 8)]);
  assert.equal(sq("a", 8), 0);
  assert.equal(sq("h", 1), 63);
});

test("PST：兵受推进激励（7 排远优于 2 排）", () => {
  assert.ok(PIECE_SQUARE_TABLES.p[sq("e", 7)] > PIECE_SQUARE_TABLES.p[sq("e", 2)]);
  assert.ok(PIECE_SQUARE_TABLES.p[sq("d", 4)] > PIECE_SQUARE_TABLES.p[sq("d", 2)]);
});

test("PST：马受中心激励、边角受罚", () => {
  assert.ok(PIECE_SQUARE_TABLES.n[sq("f", 3)] > PIECE_SQUARE_TABLES.n[sq("a", 3)]);
  assert.ok(PIECE_SQUARE_TABLES.n[sq("c", 3)] > PIECE_SQUARE_TABLES.n[sq("h", 3)]);
});

test("子力价值采用厘兵量纲且王为 0", () => {
  assert.equal(PIECE_VALUE.p, 100);
  assert.equal(PIECE_VALUE.q, 900);
  assert.equal(PIECE_VALUE.k, 0);
  assert.ok(PIECE_VALUE.q > PIECE_VALUE.r && PIECE_VALUE.r > PIECE_VALUE.b);
});

test("开局：优先中心兵或出马，不再走出边线兵/边线马", () => {
  const start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const move = chooseAIMove(start, 2);
  assert.ok(move, "初始局面必有合法走法");
  const uci = `${move!.from}${move!.to}`;
  assert.ok(
    ["d2d4", "e2e4", "g1f3", "b1c3", "d2d3", "e2e3"].includes(uci),
    `开局应走中心兵或出马，实际走了 ${uci}`
  );
});

test("战术：有白吃的后时必须吃子", () => {
  // 黑兵 c6 可吃 d5 的白后，且吃后不会被立即反吃
  const fen = "4k3/8/2p5/3Q4/8/8/8/4K3 b - - 0 1";
  const move = chooseAIMove(fen, 2);
  assert.ok(move);
  assert.equal(`${move!.from}${move!.to}`, "c6d5");
});

test("将死：一步杀局面必须走出杀招（将死分不被位置分干扰）", () => {
  // 白车 a1 走 a8 即底线杀
  const fen = "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1";
  const move = chooseAIMove(fen, 2);
  assert.ok(move);
  assert.equal(`${move!.from}${move!.to}`, "a1a8");
});

test("升变：兵到底线选择升变为后", () => {
  const fen = "8/P6k/8/8/8/8/7K/8 w - - 0 1";
  const move = chooseAIMove(fen, 2);
  assert.ok(move);
  assert.equal(move!.from, "a7");
  assert.equal(move!.promotion, "q");
});

test("升变：不应为走闲棋而延后升变（静态搜索只算吃子）", () => {
  // 回归用例：曾因把升变也算进静态搜索的 forcing moves，导致"先走王 g1 再升变"
  // 的分数（890）高于"立即升变"（880），AI 因此放弃升变去走闲棋。
  const fen = "8/P6k/8/8/8/8/7K/8 w - - 0 1";
  for (const depth of [1, 2, 3]) {
    const move = chooseAIMove(fen, depth);
    assert.ok(move);
    assert.equal(move!.from, "a7", `depth ${depth} 应立即升变`);
  }
});

test("静态搜索：不贪吃被保护的兵（消除地平线效应）", () => {
  // 白车 a5 吃掉 b5 的黑兵后，会被 c6 的黑兵反吃，净亏一车。
  // 若无静态搜索，depth 用尽时正好停在"刚吃完兵"的瞬间，评估为 +400 而白送车。
  const fen = "4k3/8/2p5/Rp6/8/8/8/4K3 w - - 0 1";
  for (const depth of [1, 2, 3]) {
    const move = chooseAIMove(fen, depth);
    assert.ok(move);
    assert.notEqual(
      `${move!.from}${move!.to}`,
      "a5b5",
      `depth ${depth} 不应贪吃被保护的兵而白送车`
    );
  }
});
