import type { Color, GameResult, MoveRecord } from "@/types";
import { applyMove, evaluateGameEnd, invertColor } from "../chess-engine";
import { broadcast } from "../realtime";
import {
  chargeClock,
  cloneClocks,
  elapsedSinceUpdate,
  isMoveTooLate,
  makeTimeoutResult,
} from "./clock";
import { finishGame } from "./outcome";
import { findPlayer, getOrCreateChess, now, rooms, type Room } from "./room";
import { broadcastSystemChat, resultMessage } from "./snapshot";

export interface MoveOutcome {
  ok: boolean;
  error?: string;
  move?: MoveRecord;
  fen?: string;
  turn?: Color;
  gameOver?: boolean;
  result?: GameResult;
}

/** 走子请求晚于时钟耗尽（超出容差）到达：该步无效，走子方判负 */
function timeoutByMoveLateness(room: Room, loserColor: Color): MoveOutcome {
  const result = finishGame(room, makeTimeoutResult(room, loserColor));
  broadcast(room.code, { type: "timeout", by: loserColor, result });
  broadcastSystemChat(room, resultMessage(result));
  return { ok: false, error: "您已超时，对局结束", result };
}

export function applyMoveAction(
  code: string,
  req: { playerId: string; from: string; to: string; promotion?: string }
): MoveOutcome {
  const room = rooms.get(code.toUpperCase());
  if (!room) return { ok: false, error: "房间不存在" };
  if (room.status !== "playing" || room.gameOver) return { ok: false, error: "当前不可走子" };

  const player = findPlayer(room, req.playerId);
  if (!player) return { ok: false, error: "玩家不存在" };
  if (room.turn !== player.color) return { ok: false, error: "未轮到您走子" };
  if (!player.connected) return { ok: false, error: "您已离线" };

  // 落子前先核时钟：钟面已耗尽且超出网络容差 → 该步棋超时无效，直接判负。
  // elapsed 在此处取值，与实际扣时保持一致（走子本身的耗时不计入思考时间）。
  const elapsed = elapsedSinceUpdate(room);
  if (isMoveTooLate(room, player.color)) {
    return timeoutByMoveLateness(room, player.color);
  }

  const chess = getOrCreateChess(room);
  const res = applyMove(chess, { from: req.from, to: req.to, promotion: req.promotion });
  if (!res.ok || !res.fen) return { ok: false, error: res.error ?? "非法走子" };

  const move: MoveRecord = {
    moveNumber: room.moves.length + 1,
    san: res.san!,
    fen: res.fen,
    from: req.from,
    to: req.to,
    promotion: req.promotion,
    playedBy: player.color,
    playedAt: now(),
    // 走子前的时钟快照：悔棋时据此回退，避免被回退方替对手的思考时间买单
    clocksBefore: cloneClocks(room),
  };
  room.moves.push(move);
  room.currentFen = res.fen;
  chargeClock(room, player.color, elapsed);

  const end = evaluateGameEnd(chess);
  let result: GameResult | undefined;
  if (end.over) {
    result = finishGame(room, {
      gameNo: room.gameNo,
      winner: end.winner,
      reason: end.reason!,
      endedAt: now(),
    });
  } else {
    room.turn = invertColor(player.color);
  }

  broadcast(room.code, {
    type: "move",
    move,
    fen: res.fen,
    turn: room.turn,
    gameOver: room.gameOver,
    result,
    clocks: cloneClocks(room),
  });
  if (result) {
    // 结果播报随聊天事件即时下发（快照里的 chat 客户端要等全量 state 才能看到）
    broadcastSystemChat(room, resultMessage(result));
  }
  return {
    ok: true,
    move,
    fen: res.fen,
    turn: room.turn,
    gameOver: room.gameOver,
    result,
  };
}
