import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createRoom,
  joinRoom,
  joinAIRoom,
  getSnapshot,
  timeoutAction,
  setConnected,
} from "../lib/store";

type AnyRoom = {
  clocks: { white: number; black: number };
  clockUpdatedAt: number;
};

function rawRoom(code: string): AnyRoom {
  return (globalThis as unknown as { __chessArenaRooms: Map<string, AnyRoom> })
    .__chessArenaRooms.get(code.toUpperCase())!;
}

// ===== 超时上报（M1） =====

test("超时：对方时钟耗尽时，我可上报判对方负（对方关页场景）", () => {
  const r = createRoom({ name: "A", timeLimit: 300 });
  joinRoom(r.code, { name: "B" });
  rawRoom(r.code).clocks.black = 0;
  const res = timeoutAction(r.code, r.playerId, "black");
  assert.equal(res.ok, true);
  const snap = getSnapshot(r.code)!;
  assert.equal(snap.result?.reason, "timeout");
  assert.equal(snap.result?.winner, "white");
});

test("超时：对方仍有时间时报上被拒绝", () => {
  const r = createRoom({ name: "A", timeLimit: 300 });
  joinRoom(r.code, { name: "B" });
  const res = timeoutAction(r.code, r.playerId, "black");
  assert.equal(res.ok, false);
});

test("超时：不传目标默认判自己，走动中的钟按时效扣减", () => {
  const r = createRoom({ name: "A", timeLimit: 300 });
  joinRoom(r.code, { name: "B" });
  rawRoom(r.code).clockUpdatedAt = Date.now() - 301_000;
  const res = timeoutAction(r.code, r.playerId);
  assert.equal(res.ok, true);
  assert.equal(getSnapshot(r.code)!.result?.winner, "black");
});

// ===== 在线状态（M2） =====

test("在线状态：断开有宽限期，宽限期内重连保持在线", () => {
  const r = createRoom({ name: "A" });
  const j = joinRoom(r.code, { name: "B" });

  setConnected(r.code, j.playerId, false); // SSE 断开
  let black = getSnapshot(r.code)!.players.find((p) => p.color === "black")!;
  assert.equal(black.connected, true); // 宽限期内不立即离线

  setConnected(r.code, j.playerId, true); // 重连
  black = getSnapshot(r.code)!.players.find((p) => p.color === "black")!;
  assert.equal(black.connected, true);
});

test("在线状态：AI 玩家不受在线状态标记影响", () => {
  const r = createRoom({ name: "A", timeLimit: 0 });
  const ai = joinAIRoom(r.code);
  setConnected(r.code, ai.playerId, false);
  const snap = getSnapshot(r.code)!;
  assert.equal(snap.players.find((p) => p.isAI)?.connected, true);
});
