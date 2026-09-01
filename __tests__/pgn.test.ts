import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReplay, encodeMoves, pgnFromMoves, pgnResult } from "../lib/pgn";

test("走法编码与解码可往返", () => {
  const moves = [
    { from: "e2", to: "e4" },
    { from: "e7", to: "e5" },
    { from: "g1", to: "f3" },
  ];
  assert.equal(encodeMoves(moves), "e2e4,e7e5,g1f3");
  const replay = buildReplay(encodeMoves(moves));
  assert.equal(replay.length, 3);
  assert.deepEqual(
    replay.map((m) => m.san),
    ["e4", "e5", "Nf3"]
  );
  assert.equal(replay[0].from, "e2");
});

test("回放每一步都带走着子后的 FEN", () => {
  const replay = buildReplay("e2e4,e7e5");
  assert.equal(replay.length, 2);
  assert.ok(replay[0].fen.includes("4P3"), "白兵应已在 e4");
  assert.ok(replay[1].fen.includes("4p3"), "黑兵应已在 e5");
});

test("升变走法可正确编解码", () => {
  // 编码是纯字符串拼接，不依赖局面合法性
  assert.equal(encodeMoves([{ from: "a7", to: "a8", promotion: "q" }]), "a7a8q");

  // 解码需要真实合法的对局：白兵经 h 列推进，吃掉 h8 黑车后升变
  const moves = [
    { from: "h2", to: "h4" },
    { from: "a7", to: "a6" },
    { from: "h4", to: "h5" },
    { from: "a6", to: "a5" },
    { from: "h5", to: "h6" },
    { from: "a5", to: "a4" },
    { from: "h6", to: "g7" },
    { from: "a4", to: "a3" },
    { from: "g7", to: "h8", promotion: "q" },
  ];
  const replay = buildReplay(encodeMoves(moves));
  assert.equal(replay.length, 9);
  assert.equal(replay[8].san, "gxh8=Q");
  assert.equal(replay[8].promotion, "q");
});

test("非法走法被截断而不抛错（分享链接被篡改时安全降级）", () => {
  // g1g5 不是马的走法，应在此处停止，后续走法被丢弃
  const replay = buildReplay("e2e4,g1g5,e7e5");
  assert.equal(replay.length, 1);
});

test("空串与乱码返回空回放", () => {
  assert.deepEqual(buildReplay(""), []);
  assert.deepEqual(buildReplay("zzzz"), []);
});

test("PGN 含双方姓名、结果与着法", () => {
  const pgn = pgnFromMoves(
    [
      { from: "e2", to: "e4" },
      { from: "e7", to: "e5" },
    ],
    { white: "Alice", black: "Bob", result: "1-0" }
  );
  assert.ok(pgn.includes('[White "Alice"]'));
  assert.ok(pgn.includes('[Black "Bob"]'));
  assert.ok(pgn.includes('[Result "1-0"]'));
  assert.ok(pgn.includes("1. e4 e5"), `着法部分异常：${pgn}`);
});

test("PGN 结果标签映射正确", () => {
  assert.equal(pgnResult(null, false), "*", "未结束");
  assert.equal(pgnResult(null, true), "1/2-1/2", "和棋");
  assert.equal(pgnResult("white", true), "1-0");
  assert.equal(pgnResult("black", true), "0-1");
});
