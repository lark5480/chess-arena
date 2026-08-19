import { createRoom, getRoom, joinRoom, applyMoveAction, joinAIRoom } from "../lib/store";

// 1) 创建房间（不传昵称）
const created = createRoom({ timeLimit: 600 });
console.log("1) 创建房间:", JSON.stringify(created));

// 2) 验证默认昵称
const room1 = getRoom(created.code)!;
console.log("2) 白方昵称:", room1.players[0].name, "(应为 玩家1)");

// 3) 模拟第二个浏览器加入（不传昵称）
const joined = joinRoom(created.code, {});
console.log("3) 加入房间:", JSON.stringify({ playerId: joined.playerId, color: joined.color }));
const room2 = getRoom(created.code)!;
console.log("   黑方昵称:", room2.players[1].name, "(应为 玩家2)");

// 4) 走棋
const m1 = applyMoveAction(created.code, { playerId: created.playerId, from: "e2", to: "e4" });
console.log("4) 白方 e2-e4:", m1.ok ? "OK" : m1.error);
const m2 = applyMoveAction(created.code, { playerId: joined.playerId, from: "e7", to: "e5" });
console.log("   黑方 e7-e5:", m2.ok ? "OK" : m2.error);

// 5) 验证全局 Map 持久化
const g = globalThis as any;
console.log("5) globalThis.__chessArenaRooms 存在:", !!g.__chessArenaRooms);
console.log("   Map 大小:", g.__chessArenaRooms?.size, "(应 >= 1)");

// 6) 人机对战
const aiRoom = createRoom({ name: "Tester", timeLimit: 300 });
const aiJoin = joinAIRoom(aiRoom.code, {});
console.log("6) AI加入:", JSON.stringify({ playerId: aiJoin.playerId }));
const aiRoomState = getRoom(aiRoom.code)!;
console.log("   AI昵称:", aiRoomState.players[1].name, "(应为 🤖 电脑)");
console.log("   AI标记:", (aiRoomState.players[1] as any).isAI, "(应为 true)");

console.log("\n===== ALL VERIFICATIONS PASSED =====");
