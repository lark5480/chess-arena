import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createRoom,
  joinRoom,
  joinAIRoom,
  applyMoveAction,
  getSnapshot,
  resignAction,
  drawOfferAction,
  drawRespondAction,
  takebackRequestAction,
  takebackRespondAction,
  timeoutAction,
  setConnected,
  sendChatAction,
} from "../lib/store";

type AnyRoom = {
  clocks: { white: number; black: number };
  clockUpdatedAt: number;
  gameOver: boolean;
  status: string;
  draw?: { by: string; pending: boolean } | undefined;
  takeback?: { by: string; pending: boolean } | undefined;
  chat: Array<{ text: string }>;
};

function rawRoom(code: string): AnyRoom {
  return (
    globalThis as unknown as { __chessArenaRooms: Map<string, AnyRoom> }
  ).__chessArenaRooms.get(code.toUpperCase())!;
}

/** 走子直到将死（学者杀），返回 [白playerId, 黑playerId] */
function playScholarsMate(code: string, w: string, b: string) {
  const seq: [string, string, string][] = [
    [w, "e2", "e4"],
    [b, "e7", "e5"],
    [w, "f1", "c4"],
    [b, "b8", "c6"],
    [w, "d1", "h5"],
    [b, "g8", "f6"],
    [w, "h5", "f7"],
  ];
  for (const [pid, from, to] of seq) {
    const res = applyMoveAction(code, { playerId: pid, from, to });
    assert.equal(res.ok, true, `move ${from}${to}`);
  }
}

// ===== S1：快照不泄露 playerId =====

test("S1: 快照与事件中的 players[].id 一律为空（凭证不下发）", () => {
  const r = createRoom({ name: "A" });
  joinRoom(r.code, { name: "B" });
  const snap = getSnapshot(r.code)!;
  assert.ok(snap.players.every((p) => p.id === ""));
});

// ===== C1/C2：对局结束后不可响应求和/悔棋 =====

test("C1: 将死落地后，残留求和请求被清除且不可接受", () => {
  const r = createRoom({ name: "A" });
  const j = joinRoom(r.code, { name: "B" });
  drawOfferAction(r.code, r.playerId); // 白方提和
  playScholarsMate(r.code, r.playerId, j.playerId); // 挂起期间白方将死黑方
  const res = drawRespondAction(r.code, j.playerId, "accept");
  assert.equal(res.ok, false);
  const snap = getSnapshot(r.code)!;
  assert.equal(snap.result?.reason, "checkmate"); // 结果未被改写
  assert.equal(snap.draw, undefined);
});

test("C2: 对局结束后接受悔棋被拒绝，棋盘与结果保持一致", () => {
  const r = createRoom({ name: "A" });
  const j = joinRoom(r.code, { name: "B" });
  applyMoveAction(r.code, { playerId: r.playerId, from: "e2", to: "e4" });
  takebackRequestAction(r.code, j.playerId); // 黑方请求悔棋
  resignAction(r.code, j.playerId); // 请求挂起期间黑方认输
  const res = takebackRespondAction(r.code, r.playerId, "accept");
  assert.equal(res.ok, false);
  const snap = getSnapshot(r.code)!;
  assert.equal(snap.status, "finished");
  assert.equal(snap.result?.reason, "resignation");
  assert.equal(snap.moves.length, 1); // 棋盘未回退
});

// ===== C3：悔棋回退时钟 =====

test("C3: 接受悔棋后时钟回退到被悔着法走子前", () => {
  const r = createRoom({ name: "A", timeLimit: 300 });
  const j = joinRoom(r.code, { name: "B" });
  const before = { ...rawRoom(r.code).clocks };
  applyMoveAction(r.code, { playerId: r.playerId, from: "e2", to: "e4" });
  // 人为扣掉黑方时间，模拟双方走了很久
  rawRoom(r.code).clocks.black = 1000;
  takebackRequestAction(r.code, j.playerId);
  const res = takebackRespondAction(r.code, r.playerId, "accept");
  assert.equal(res.ok, true);
  const clocks = rawRoom(r.code).clocks;
  assert.equal(clocks.white, before.white);
  assert.equal(clocks.black, before.black); // 回退而非保留 1000
});

// ===== C4/S13：时限白名单 =====

test("C4: timeLimit=0（无限制）不再被静默改成 600", () => {
  const r = createRoom({ name: "A", timeLimit: 0 });
  const snap = getSnapshot(r.code)!;
  assert.equal(snap.timeLimit, 0);
  assert.equal(rawRoom(r.code).clocks.white, 0);
  // 不限时对局不可判超时
  joinRoom(r.code, { name: "B" });
  const res = timeoutAction(r.code, r.playerId, "black");
  assert.equal(res.ok, false);
  assert.equal(res.error, "本局不限时");
});

test("S13: 非法 timeLimit（负数/超大）回落到 600", () => {
  const r1 = createRoom({ name: "A", timeLimit: -5 as any });
  assert.equal(getSnapshot(r1.code)!.timeLimit, 600);
  const r2 = createRoom({ name: "A", timeLimit: 1e12 as any });
  assert.equal(getSnapshot(r2.code)!.timeLimit, 600);
});

// ===== C5：人机模式 AI 自动应答 =====

test("C5: 人机模式人类请求悔棋，AI 自动同意并回退", () => {
  const r = createRoom({ name: "A" });
  joinAIRoom(r.code);
  applyMoveAction(r.code, { playerId: r.playerId, from: "e2", to: "e4" });
  const res = takebackRequestAction(r.code, r.playerId); // 白方（人类）请求
  assert.equal(res.ok, true);
  const snap = getSnapshot(r.code)!;
  assert.equal(snap.moves.length, 0); // 已自动接受
  assert.equal(snap.turn, "white");
  assert.equal(snap.takeback, undefined);
});

test("C5: 人机模式人类提和，AI 自动拒绝", () => {
  const r = createRoom({ name: "A" });
  joinAIRoom(r.code);
  const res = drawOfferAction(r.code, r.playerId);
  assert.equal(res.ok, true);
  assert.equal(getSnapshot(r.code)!.draw, undefined); // 已自动拒绝并清除
});

// ===== C7：停表方超时判定 =====

test("C7: 停表方钟面有余量时不可被判超时（在时内完成的着法受保护）", () => {
  const r = createRoom({ name: "A", timeLimit: 300 });
  const j = joinRoom(r.code, { name: "B" });
  applyMoveAction(r.code, { playerId: r.playerId, from: "e2", to: "e4" });
  applyMoveAction(r.code, { playerId: j.playerId, from: "e7", to: "e5" });
  rawRoom(r.code).clocks.black = 150; // 黑方走完后钟停，剩余 150ms
  const res = timeoutAction(r.code, r.playerId, "black");
  assert.equal(res.ok, false);
  assert.equal(res.error, "该方时钟未耗尽");
});

test("C7: 停表方钟面归零（对方关页场景）仍可判负", () => {
  const r = createRoom({ name: "A", timeLimit: 300 });
  const j = joinRoom(r.code, { name: "B" });
  applyMoveAction(r.code, { playerId: r.playerId, from: "e2", to: "e4" });
  rawRoom(r.code).clocks.black = 0; // 黑方上一步恰好耗尽
  const res = timeoutAction(r.code, r.playerId, "black");
  assert.equal(res.ok, true);
  assert.equal(getSnapshot(r.code)!.result?.winner, "white");
});

test("C7: 走子请求晚于时钟耗尽到达 → 该步无效并判负", () => {
  const r = createRoom({ name: "A", timeLimit: 300 });
  const j = joinRoom(r.code, { name: "B" });
  applyMoveAction(r.code, { playerId: r.playerId, from: "e2", to: "e4" });
  // 黑方钟面只剩 100ms，但黑方 5 秒后才提交走子
  rawRoom(r.code).clocks.black = 100;
  rawRoom(r.code).clockUpdatedAt = Date.now() - 5_000;
  const res = applyMoveAction(r.code, { playerId: j.playerId, from: "e7", to: "e5" });
  assert.equal(res.ok, false);
  const snap = getSnapshot(r.code)!;
  assert.equal(snap.gameOver, true);
  assert.equal(snap.result?.reason, "timeout");
  assert.equal(snap.result?.winner, "white");
  assert.equal(snap.moves.length, 1); // 超时着法未落盘
});

// ===== C6：多标签页连接计数 =====

test("C6: 同一玩家两个连接，断开一个仍在线", () => {
  const r = createRoom({ name: "A" });
  const j = joinRoom(r.code, { name: "B" });
  setConnected(r.code, j.playerId, true); // 第二个标签页
  setConnected(r.code, j.playerId, false); // 关掉一个
  const black = getSnapshot(r.code)!.players.find((p) => p.color === "black")!;
  assert.equal(black.connected, true); // 仍有连接在场
});

// ===== S6/S7/S8：容量与输入校验 =====

test("S7: 昵称超长截断、非字符串回落默认，不抛错", () => {
  const r = createRoom({ name: "x".repeat(100) });
  assert.equal(getSnapshot(r.code)!.players[0].name.length, 20);
  const r2 = createRoom({ name: 123 as any });
  assert.equal(getSnapshot(r2.code)!.players[0].name, "玩家1");
});

test("S8: 聊天非字符串文本返回错误而非抛异常", () => {
  const r = createRoom({ name: "A" });
  const j = joinRoom(r.code, { name: "B" });
  const res = sendChatAction(r.code, { playerId: j.playerId, text: undefined as any });
  assert.equal(res.ok, false);
  assert.equal(res.error, "消息格式错误");
});

test("S6: 聊天记录封顶 200 条", () => {
  const r = createRoom({ name: "A" });
  const j = joinRoom(r.code, { name: "B" });
  for (let i = 0; i < 205; i++) {
    const res = sendChatAction(r.code, { playerId: j.playerId, text: `m${i}` });
    assert.equal(res.ok, true);
  }
  assert.equal(getSnapshot(r.code)!.chat.length, 200);
});

// ===== C12：结果播报进入聊天 =====

test("C12: 将死后结果播报写入聊天（可在事件流即时下发）", () => {
  const r = createRoom({ name: "A" });
  const j = joinRoom(r.code, { name: "B" });
  playScholarsMate(r.code, r.playerId, j.playerId);
  const chat = getSnapshot(r.code)!.chat;
  assert.ok(chat.some((c) => c.system && c.text.includes("将死")));
});

// ===== S15：重复请求 =====

test("S15: 已有待处理求和时不可重复发起（防覆盖与刷屏）", () => {
  const r = createRoom({ name: "A" });
  const j = joinRoom(r.code, { name: "B" });
  assert.equal(drawOfferAction(r.code, r.playerId).ok, true);
  const res = drawOfferAction(r.code, j.playerId);
  assert.equal(res.ok, false);
});

test("S15: 无棋可悔时悔棋请求被拒绝", () => {
  const r = createRoom({ name: "A" });
  const j = joinRoom(r.code, { name: "B" });
  const res = takebackRequestAction(r.code, r.playerId);
  assert.equal(res.ok, false);
  assert.equal(res.error, "还没有可悔的棋");
});
