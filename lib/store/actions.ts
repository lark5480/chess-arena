import type { Color } from "@/types";
import { createGame, invertColor, START_FEN } from "../chess-engine";
import { broadcast } from "../realtime";
import { isTimeoutConfirmed, makeTimeoutResult, resetClocks } from "./clock";
import type { MoveOutcome } from "./move";
import { finishGame } from "./outcome";
import { findPlayer, now, playerByColor, rooms, type Room } from "./room";
import { broadcastSystemChat, publicPlayer, resultMessage, systemChat } from "./snapshot";

/** 对局进行中的公共守卫：房间存在、处于 playing 且未结束 */
function requirePlayingRoom(code: string): Room | undefined {
  const room = rooms.get(code.toUpperCase());
  if (!room || room.status !== "playing" || room.gameOver) return undefined;
  return room;
}

// ============ 认输 ============
export function resignAction(code: string, playerId: string): MoveOutcome {
  const room = requirePlayingRoom(code);
  if (!room) return { ok: false, error: "当前不可认输" };
  const player = findPlayer(room, playerId);
  if (!player) return { ok: false, error: "玩家不存在" };

  const result = finishGame(room, {
    gameNo: room.gameNo,
    winner: invertColor(player.color),
    reason: "resignation",
    endedAt: now(),
  });
  broadcast(room.code, { type: "resign", by: player.color, result });
  broadcastSystemChat(room, resultMessage(result));
  return { ok: true, result };
}

// ============ 求和 ============
export function drawOfferAction(code: string, playerId: string) {
  const room = requirePlayingRoom(code);
  if (!room) return { ok: false, error: "当前不可提议和棋" };
  const player = findPlayer(room, playerId);
  if (!player) return { ok: false, error: "玩家不存在" };
  if (room.draw?.pending) return { ok: false, error: "已有待处理的和棋请求" };

  room.draw = { by: player.color, pending: true };
  broadcast(room.code, { type: "draw_offer", by: player.color });

  // 人机模式：AI 拒绝和棋（保持对弈；简单启发不复杂化）
  const responder = playerByColor(room, invertColor(player.color));
  if (responder?.isAI) {
    room.draw = undefined;
    broadcast(room.code, { type: "draw_declined", by: responder.color });
  }
  return { ok: true };
}

export function drawRespondAction(code: string, playerId: string, action: "accept" | "decline") {
  const room = rooms.get(code.toUpperCase());
  if (!room || !room.draw?.pending) return { ok: false, error: "没有待处理的和棋请求" };
  // 对局已结束（将死/超时/认输在请求挂起期间落地）时拒绝响应，防止改写已定结果
  if (room.status !== "playing" || room.gameOver) return { ok: false, error: "对局已结束" };
  const player = findPlayer(room, playerId);
  if (!player) return { ok: false, error: "玩家不存在" };
  if (player.color === room.draw.by) return { ok: false, error: "不能对自己的请求进行操作" };

  if (action === "accept") {
    const result = finishGame(room, {
      gameNo: room.gameNo,
      winner: null,
      reason: "draw",
      endedAt: now(),
    });
    broadcast(room.code, { type: "draw_accepted", result });
    broadcastSystemChat(room, resultMessage(result));
    return { ok: true, result };
  }
  room.draw = undefined;
  broadcast(room.code, { type: "draw_declined", by: player.color });
  return { ok: true };
}

// ============ 悔棋 ============
export function takebackRequestAction(code: string, playerId: string) {
  const room = requirePlayingRoom(code);
  if (!room) return { ok: false, error: "当前不可请求悔棋" };
  const player = findPlayer(room, playerId);
  if (!player) return { ok: false, error: "玩家不存在" };
  if (room.moves.length === 0) return { ok: false, error: "还没有可悔的棋" };
  if (room.takeback?.pending) return { ok: false, error: "已有待处理的悔棋请求" };

  room.takeback = { by: player.color, pending: true };
  broadcast(room.code, { type: "takeback_request", by: player.color });

  // 人机模式：AI 同意悔棋（人类请求悔 AI 的上一步）——走错一步不至于毁掉整局。
  // 复用响应路径以继承终局守卫、退钟与广播
  const responder = playerByColor(room, invertColor(player.color));
  if (responder?.isAI) {
    takebackRespondAction(code, responder.id, "accept");
  }
  return { ok: true };
}

export function takebackRespondAction(
  code: string,
  playerId: string,
  action: "accept" | "decline"
) {
  const room = rooms.get(code.toUpperCase());
  if (!room || !room.takeback?.pending) return { ok: false, error: "没有待处理的悔棋请求" };
  // 对局已结束时拒绝响应，防止悔棋回退棋盘但结果仍为已结束的矛盾状态
  if (room.status !== "playing" || room.gameOver) return { ok: false, error: "对局已结束" };
  const player = findPlayer(room, playerId);
  if (!player) return { ok: false, error: "玩家不存在" };
  if (player.color === room.takeback.by) return { ok: false, error: "不能对自己的请求进行操作" };

  if (action !== "accept") {
    room.takeback = undefined;
    broadcast(room.code, { type: "takeback_declined", by: player.color });
    return { ok: true };
  }

  if (room.moves.length > 0) {
    const last = room.moves.pop()!;
    room.currentFen = room.moves.length ? room.moves[room.moves.length - 1].fen : START_FEN;
    room.turn = room.moves.length
      ? invertColor(room.moves[room.moves.length - 1].playedBy)
      : "white";
    // 回退时钟到被悔着法之前的状态：否则被回退方要替对手的思考时间买单
    if (last.clocksBefore) room.clocks = { ...last.clocksBefore };
  } else {
    room.currentFen = START_FEN;
    room.turn = "white";
  }
  room.takeback = undefined;
  room.chess = createGame(room.currentFen);
  // 悔棋重置计时基准：从悔棋生效的时刻重新起算
  room.clockUpdatedAt = now();

  broadcast(room.code, {
    type: "takeback_accepted",
    fen: room.currentFen,
    moves: room.moves.map((m) => ({ ...m })),
    turn: room.turn,
    clocks: { ...room.clocks },
  });
  return { ok: true };
}

// ============ 超时 ============
/**
 * 上报超时。任一在场玩家可上报任一方的超时（对方关页也能按钟获胜），
 * 服务端用权威时钟复核：仅当被判方时钟确实耗尽才生效。
 */
export function timeoutAction(code: string, playerId: string, target?: Color) {
  const room = requirePlayingRoom(code);
  if (!room) return { ok: false, error: "当前不可判超时" };
  const reporter = findPlayer(room, playerId);
  if (!reporter) return { ok: false, error: "玩家不存在" };
  if (room.timeLimit === 0) return { ok: false, error: "本局不限时" };

  const loserColor = target ?? reporter.color;
  const loser = playerByColor(room, loserColor);
  if (!loser) return { ok: false, error: "玩家不存在" };

  if (!isTimeoutConfirmed(room, loserColor)) {
    return {
      ok: false,
      error: room.turn === loserColor ? "尚未超时" : "该方时钟未耗尽",
    };
  }

  const result = finishGame(room, makeTimeoutResult(room, loserColor));
  broadcast(room.code, { type: "timeout", by: loserColor, result });
  broadcastSystemChat(room, resultMessage(result));
  return { ok: true, result };
}

// ============ 再来一局 ============
export function rematchAction(code: string, playerId: string) {
  const room = rooms.get(code.toUpperCase());
  if (!room) return { ok: false, error: "房间不存在" };
  if (room.status !== "finished") return { ok: false, error: "当前对局尚未结束" };
  const player = findPlayer(room, playerId);
  if (!player) return { ok: false, error: "玩家不存在" };

  // 交换先后手
  for (const p of room.players) {
    p.color = invertColor(p.color);
    p.connected = true;
  }
  room.status = "playing";
  room.gameNo += 1;
  room.currentFen = START_FEN;
  room.turn = "white";
  room.moves = [];
  room.gameOver = false;
  room.result = undefined;
  room.finishedAt = undefined;
  room.takeback = undefined;
  room.draw = undefined;
  room.chess = createGame(START_FEN);
  resetClocks(room);
  room.chat = [];
  systemChat(room, "新一局开始，已交换先后手！");

  const white = playerByColor(room, "white")!;
  const black = playerByColor(room, "black")!;
  broadcast(room.code, {
    type: "rematch",
    gameNo: room.gameNo,
    fen: START_FEN,
    turn: "white",
    timeLimit: room.timeLimit,
    white: publicPlayer(white),
    black: publicPlayer(black),
  });
  return { ok: true };
}
