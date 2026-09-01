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
  rematchAction,
} from "../lib/store";

test("创建 + 加入 → 对局进入 playing 且双人", () => {
  const r = createRoom({ name: "A", timeLimit: 0 });
  const j = joinRoom(r.code, { name: "B" });
  const snap = getSnapshot(r.code)!;
  assert.equal(snap.status, "playing");
  assert.equal(snap.players.length, 2);
  assert.equal(snap.players[0].color, "white");
  assert.equal(snap.players[1].color, "black");
  assert.equal(j.color, "black");
});

test("完整对弈至将死（学者杀法）并判定结果", () => {
  const r = createRoom({ name: "A" });
  const j = joinRoom(r.code, { name: "B" });
  const w = r.playerId;
  const b = j.playerId;
  const seq: [string, string, string][] = [
    [w, "e2", "e4"],
    [b, "e7", "e5"],
    [w, "f1", "c4"],
    [b, "b8", "c6"],
    [w, "d1", "h5"],
    [b, "g8", "f6"],
    [w, "h5", "f7"], // Qxf7#
  ];
  for (const [pid, from, to] of seq) {
    const res = applyMoveAction(r.code, { playerId: pid, from, to });
    assert.equal(res.ok, true, `move ${from}${to} should be legal`);
  }
  const snap = getSnapshot(r.code)!;
  assert.equal(snap.gameOver, true);
  assert.equal(snap.result?.reason, "checkmate");
  assert.equal(snap.result?.winner, "white");
});

test("认输 → 对方获胜", () => {
  const r = createRoom({ name: "A" });
  const j = joinRoom(r.code, { name: "B" });
  resignAction(r.code, r.playerId); // 白方认输
  const snap = getSnapshot(r.code)!;
  assert.equal(snap.gameOver, true);
  assert.equal(snap.result?.reason, "resignation");
  assert.equal(snap.result?.winner, "black");
});

test("求和：提议 + 接受 → 和棋", () => {
  const r = createRoom({ name: "A" });
  const j = joinRoom(r.code, { name: "B" });
  drawOfferAction(r.code, r.playerId);
  drawRespondAction(r.code, j.playerId, "accept");
  const snap = getSnapshot(r.code)!;
  assert.equal(snap.gameOver, true);
  assert.equal(snap.result?.reason, "draw");
  assert.equal(snap.result?.winner, null);
});

test("悔棋：请求 + 同意 → 回退一步", () => {
  const r = createRoom({ name: "A" });
  const j = joinRoom(r.code, { name: "B" });
  applyMoveAction(r.code, { playerId: r.playerId, from: "e2", to: "e4" });
  const before = getSnapshot(r.code)!.moves.length;
  // 轮到黑方，黑方请求悔棋（回退白方的 e4）
  takebackRequestAction(r.code, j.playerId);
  const accepted = takebackRespondAction(r.code, r.playerId, "accept");
  assert.equal(accepted.ok, true);
  const after = getSnapshot(r.code)!;
  assert.equal(after.moves.length, before - 1);
  assert.equal(after.turn, "white");
});

test("再来一局：交换先后手，gameNo+1", () => {
  const r = createRoom({ name: "A" });
  const j = joinRoom(r.code, { name: "B" });
  resignAction(r.code, r.playerId);
  rematchAction(r.code, j.playerId);
  const snap = getSnapshot(r.code)!;
  assert.equal(snap.status, "playing");
  assert.equal(snap.gameNo, 2);
  // 原白方 A 现执黑，原黑方 B 现执白
  const a = snap.players.find((p) => p.name === "A")!;
  const b = snap.players.find((p) => p.name === "B")!;
  assert.equal(a.color, "black");
  assert.equal(b.color, "white");
});

test("人机模式：加入 AI 机器人（isAI）", () => {
  const r = createRoom({ name: "A" });
  const ai = joinAIRoom(r.code, { name: "🤖 电脑" });
  assert.equal(ai.color, "black");
  const snap = getSnapshot(r.code)!;
  const black = snap.players.find((p) => p.color === "black")!;
  assert.equal(black.isAI, true);
  assert.equal(snap.status, "playing");
});

// ===== 客户端 store：人机模式交换先后手后 AI 仍能自动走子 =====
import { useGameStore, triggerAIMoveIfNeeded } from "../stores/game-store";
import { applyMove, createGame, START_FEN } from "../lib/chess-engine";

/** 同步执行 setTimeout + 捕获 fetch 请求，用于驱动并验证 AI 自动走子 */
function mockTimersAndFetch() {
  const origSetTimeout = globalThis.setTimeout;
  const origFetch = globalThis.fetch;
  let posted: { url: string; body: { playerId: string; from: string; to: string } } | null = null;
  (globalThis as any).setTimeout = (fn: () => void) => {
    fn();
    return 0;
  };
  (globalThis as any).fetch = async (url: any, init: any) => {
    posted = { url: String(url), body: JSON.parse(init?.body ?? "{}") };
    return { ok: true, json: async () => ({}) };
  };
  return {
    get posted() {
      return posted;
    },
    restore() {
      globalThis.setTimeout = origSetTimeout;
      globalThis.fetch = origFetch;
    },
  };
}

const human = { id: "human-1", name: "A", color: "white" as const, connected: true };
const aiBot = { id: "ai-1", name: "🤖 电脑", color: "black" as const, connected: true, isAI: true };

test("第一局：人类执白走子后，AI（执黑）自动应招", () => {
  const mock = mockTimersAndFetch();
  try {
    const st = useGameStore.getState();
    st.setLobby({
      code: "AIROOM1",
      playerId: human.id,
      myColor: "white",
      myName: "A",
      mode: "ai",
      aiPlayerId: aiBot.id,
    });
    // 真实 SSE 快照中玩家 id 已脱敏为空串，AI 走子凭证须取自 setLobby 的 aiPlayerId
    st.handleEvent({
      type: "game_start",
      fen: START_FEN,
      turn: "white",
      timeLimit: 600,
      white: { ...human, id: "" },
      black: { ...aiBot, id: "" },
    });
    // 人类走 e4，服务端广播 move 后轮到黑方（AI）
    const chess = createGame(START_FEN);
    const r = applyMove(chess, { from: "e2", to: "e4" });
    st.handleEvent({
      type: "move",
      move: {
        moveNumber: 1,
        san: "e4",
        fen: r.fen!,
        from: "e2",
        to: "e4",
        playedBy: "white",
        playedAt: Date.now(),
      },
      fen: r.fen!,
      turn: "black",
      gameOver: false,
    });
    assert.ok(mock.posted, "轮到黑方时 AI 应自动发起走子请求");
    assert.equal(mock.posted!.body.playerId, aiBot.id);
    assert.ok(mock.posted!.body.from && mock.posted!.body.to);
  } finally {
    mock.restore();
  }
});

test("再来一局交换先后手后：AI 改为执白并率先落子，且我的颜色同步刷新", () => {
  const mock = mockTimersAndFetch();
  try {
    const st = useGameStore.getState();
    st.setLobby({
      code: "AIROOM2",
      playerId: human.id,
      myColor: "white",
      myName: "A",
      mode: "ai",
      aiPlayerId: aiBot.id,
    });
    // 模拟第一局结束 + rematch 广播：AI 变白、人类变黑
    st.handleEvent({
      type: "rematch",
      gameNo: 2,
      fen: START_FEN,
      turn: "white",
      timeLimit: 600,
      white: { ...aiBot, color: "white", id: "" },
      black: { ...human, color: "black", id: "" },
    });
    // ① 我方颜色应随交换刷新为黑
    assert.equal(useGameStore.getState().myColor, "black");
    // ② 轮到白方（AI）时，AI 自动发起首步走子
    assert.ok(mock.posted, "交换先后手后 AI（执白）应自动发起走子请求");
    assert.equal(mock.posted!.body.playerId, aiBot.id);
    assert.ok(mock.posted!.body.from && mock.posted!.body.to);
    // ③ 修复前该场景不会触发：黑方是人类（非 AI），旧逻辑会直接 return
  } finally {
    mock.restore();
  }
});

test("触发条件：轮到我方（人类）时 AI 不应自动走子", () => {
  const mock = mockTimersAndFetch();
  try {
    const st = useGameStore.getState();
    st.setLobby({
      code: "AIROOM3",
      playerId: human.id,
      myColor: "black",
      myName: "A",
      mode: "ai",
      aiPlayerId: aiBot.id,
    });
    st.handleEvent({
      type: "rematch",
      gameNo: 2,
      fen: START_FEN,
      turn: "black", // 交换后轮到人类
      timeLimit: 600,
      white: { ...aiBot, color: "white", id: "" },
      black: { ...human, color: "black", id: "" },
    });
    assert.equal(mock.posted, null, "轮到人类时不应触发 AI 走子");
  } finally {
    mock.restore();
  }
});
