import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyMove,
  createGame,
  evaluateGameEnd,
  generatePgn,
  isPromotionMove,
  legalTargetSquares,
  START_FEN,
} from "../lib/chess-engine";

test("开局走 e4 得到正确 SAN 与 FEN", () => {
  const g = createGame();
  const r = applyMove(g, { from: "e2", to: "e4" });
  assert.equal(r.ok, true);
  assert.equal(r.san, "e4");
  assert.ok(r.fen!.includes("rnbqkbnr/pppppppp/8/8/4P3"));
});

test("王车易位 O-O", () => {
  const g = createGame("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
  const r = applyMove(g, { from: "e1", to: "g1" });
  assert.equal(r.san, "O-O");
});

test("吃过路兵 exd6", () => {
  const g = createGame("rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 1");
  const r = applyMove(g, { from: "e5", to: "d6" });
  assert.equal(r.san, "exd6");
});

test("升变 a8=Q 且 isPromotionMove 识别正确", () => {
  const g = createGame("8/P6k/8/8/8/8/8/7K w - - 0 1");
  assert.equal(isPromotionMove(g.fen(), "a7", "a8"), true);
  assert.equal(isPromotionMove(g.fen(), "a2", "a3"), false);
  const r = applyMove(g, { from: "a7", to: "a8", promotion: "q" });
  assert.equal(r.san, "a8=Q");
});

test("将死判定（白方 Ra8#）", () => {
  const g = createGame("6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1");
  applyMove(g, { from: "a1", to: "a8" });
  const end = evaluateGameEnd(g);
  assert.equal(end.over, true);
  assert.equal(end.winner, "white");
  assert.equal(end.reason, "checkmate");
});

test("逼和判定（无子可动且未被将军）", () => {
  const g = createGame("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");
  const end = evaluateGameEnd(g);
  assert.equal(end.over, true);
  assert.equal(end.winner, null);
  assert.equal(end.reason, "stalemate");
});

test("子力不足判定（王对王）", () => {
  const g = createGame("8/8/8/4k3/8/8/4K3/8 w - - 0 1");
  const end = evaluateGameEnd(g);
  assert.equal(end.over, true);
  assert.equal(end.reason, "insufficient");
});

test("三次重复局面判定", () => {
  const g = createGame();
  // 走 1.Nf3 Nf6 2.Ng1 Ng8 两个循环，回到初始局面共 3 次
  const cycle = ["g1f3", "g8f6", "f3g1", "f6g8"];
  for (let i = 0; i < 2; i++) {
    for (const mv of cycle) {
      applyMove(g, { from: mv.slice(0, 2), to: mv.slice(2) });
    }
  }
  const end = evaluateGameEnd(g);
  assert.equal(end.over, true);
  assert.equal(end.reason, "threefold");
});

test("合法走法高亮（e2 可走 e3/e4）", () => {
  const g = createGame();
  const targets = legalTargetSquares(g.fen(), "e2");
  assert.ok(targets.includes("e3"));
  assert.ok(targets.includes("e4"));
});

// legalTargetSquares 走的是 chess.js 单格生成（moves({ square })），
// 这里断言它与"全量生成后过滤"严格等价，覆盖易位、应将、将死、空格四类语义。
test("legalTargetSquares 单格生成与全量过滤结果等价", () => {
  const MIDDLE_GAME = "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4";
  const IN_CHECK = "4k3/8/8/8/8/8/4r3/4K3 w - - 0 1"; // 黑车 e2 将军白王
  const CHECKMATE = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3"; // 傻瓜杀

  const cases: Array<[string, string[]]> = [
    [START_FEN, ["e2", "g1", "a1", "d8", "e5"]], // 兵 / 马 / 被堵的车 / 被堵的后 / 空格
    [MIDDLE_GAME, ["c4", "f3", "e1", "d2", "h1"]], // 象 / 马 / 王(含易位) / 兵 / 车
    [IN_CHECK, ["e1", "a1"]], // 应将：王格有走法，空格无
    [CHECKMATE, ["e1", "d2", "g1"]], // 将死：任何格都无合法走法
  ];

  for (const [fen, squares] of cases) {
    const all = createGame(fen).moves({ verbose: true }) as Array<{ from: string; to: string }>;
    for (const sq of squares) {
      const expected = all
        .filter((m) => m.from === sq)
        .map((m) => m.to)
        .sort();
      const actual = [...legalTargetSquares(fen, sq)].sort();
      assert.deepEqual(actual, expected, `局面 ${fen} 的 ${sq} 格`);
    }
  }
});

test("generatePgn 输出标准 PGN 头", () => {
  const g = createGame();
  applyMove(g, { from: "e2", to: "e4" });
  const pgn = generatePgn(g, { white: "Alice", black: "Bob", result: "*" });
  assert.ok(pgn.includes('[Event "Chess Arena"]'));
  assert.ok(pgn.includes("1. e4"));
});
