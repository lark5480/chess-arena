import { test } from "node:test";
import assert from "node:assert/strict";
import { createRoom, sweepExpiredRooms } from "../lib/store";
import { allowRequest } from "../lib/rate-limit";

type AnyRoom = {
  code: string;
  status: string;
  gameOver: boolean;
  createdAt: number;
  finishedAt?: number;
  chat: { at: number }[];
};

function roomMap(): Map<string, AnyRoom> {
  return (globalThis as unknown as { __chessArenaRooms: Map<string, AnyRoom> }).__chessArenaRooms;
}

test("清扫：无活动超 3 小时的等待房间被删除", () => {
  const r = createRoom({ name: "A" });
  const room = roomMap().get(r.code)!;
  room.status = "waiting";
  const hoursAgo = Date.now() - 4 * 60 * 60 * 1000;
  room.createdAt = hoursAgo;
  // 系统消息的 at 也属于活动时间，一并回退
  room.chat[0].at = hoursAgo;
  sweepExpiredRooms();
  assert.equal(roomMap().has(r.code), false);
});

test("清扫：刚创建的房间保留", () => {
  const r = createRoom({ name: "A" });
  sweepExpiredRooms();
  assert.ok(roomMap().has(r.code));
});

test("清扫：结束超 30 分钟的房间被删除", () => {
  const r = createRoom({ name: "A" });
  const room = roomMap().get(r.code)!;
  room.status = "finished";
  room.gameOver = true;
  room.finishedAt = Date.now() - 31 * 60 * 1000;
  sweepExpiredRooms();
  assert.equal(roomMap().has(r.code), false);
});

test("清扫：刚结束的房间保留（供回看）", () => {
  const r = createRoom({ name: "A" });
  const room = roomMap().get(r.code)!;
  room.status = "finished";
  room.gameOver = true;
  sweepExpiredRooms();
  assert.ok(roomMap().has(r.code));
});

test("限流：窗口内超限拒绝，窗口过后恢复", async () => {
  const key = `test:${Math.random()}`;
  assert.equal(allowRequest(key, 2, 50), true);
  assert.equal(allowRequest(key, 2, 50), true);
  assert.equal(allowRequest(key, 2, 50), false);
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(allowRequest(key, 2, 50), true);
});
