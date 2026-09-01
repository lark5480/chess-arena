import { test } from "node:test";
import assert from "node:assert/strict";
import { createRoom, getRoom, joinRoom, applyMoveAction, joinAIRoom } from "../lib/store";

test("端到端冒烟：创建→默认昵称→加入→走子→globalThis 持久化", () => {
  // 1) 创建房间（不传昵称）→ 默认 玩家1
  const created = createRoom({ timeLimit: 600 });
  const room1 = getRoom(created.code)!;
  assert.equal(room1.players[0].name, "玩家1");

  // 2) 模拟第二个浏览器加入（不传昵称）→ 默认 玩家2，执黑
  const joined = joinRoom(created.code, {});
  assert.equal(joined.color, "black");
  const room2 = getRoom(created.code)!;
  assert.equal(room2.players[1].name, "玩家2");
  assert.equal(room2.status, "playing");

  // 3) 双方各走一步
  const m1 = applyMoveAction(created.code, { playerId: created.playerId, from: "e2", to: "e4" });
  assert.equal(m1.ok, true);
  const m2 = applyMoveAction(created.code, { playerId: joined.playerId, from: "e7", to: "e5" });
  assert.equal(m2.ok, true);

  // 4) globalThis 单例持久化（HMR 防重置）
  const g = globalThis as any;
  assert.ok(g.__chessArenaRooms instanceof Map);
  assert.ok(g.__chessArenaRooms.size >= 1);
});

test("端到端冒烟：人机对战默认昵称与 isAI 标记", () => {
  const aiRoom = createRoom({ name: "Tester", timeLimit: 300 });
  const aiJoin = joinAIRoom(aiRoom.code, {});
  assert.equal(aiJoin.color, "black");
  const aiRoomState = getRoom(aiRoom.code)!;
  assert.equal(aiRoomState.players[1].name, "🤖 电脑");
  assert.equal(aiRoomState.players[1].isAI, true);
  assert.equal(aiRoomState.status, "playing");
});
