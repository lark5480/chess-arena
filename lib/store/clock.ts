import { invertColor } from "../chess-engine";
import type { Clocks, Color, GameResult } from "@/types";
import { TIMEOUT_TOLERANCE_MS } from "./constants";
import { now, type Room } from "./room";

/** 自上次扣时以来经过的毫秒数 */
export function elapsedSinceUpdate(room: Room): number {
  return now() - room.clockUpdatedAt;
}

/** 走子落定后扣减本步耗时，并重置计时基准 */
export function chargeClock(room: Room, color: Color, elapsed: number): void {
  room.clocks[color] = Math.max(0, room.clocks[color] - elapsed);
  room.clockUpdatedAt = now();
}

/** 按时限重置双方时钟 */
export function resetClocks(room: Room): void {
  room.clocks = { white: room.timeLimit * 1000, black: room.timeLimit * 1000 };
  room.clockUpdatedAt = now();
}

export function cloneClocks(room: Room): Clocks {
  return { ...room.clocks };
}

/**
 * 复核超时是否成立。
 *
 * 轮到被判方：其时钟正在走，扣减 elapsed 后比对容差。
 * 停表方：钟面有余量说明它在时限内走完了上一步，不应被追判；
 * 仅当钟面恰好为 0（走子时刚好耗尽）才算旗子已倒。
 */
export function isTimeoutConfirmed(room: Room, loserColor: Color): boolean {
  if (room.timeLimit === 0) return false;
  if (room.turn === loserColor) {
    const remaining = Math.max(0, room.clocks[loserColor] - elapsedSinceUpdate(room));
    return remaining <= TIMEOUT_TOLERANCE_MS;
  }
  return room.clocks[loserColor] <= 0;
}

/**
 * 走子请求晚于时钟耗尽（超出容差）才到达：该步无效，走子方判负。
 * 防止"超时走子被接受、时钟钳到 0 后停表导致永远无法判超时"的不一致。
 */
export function isMoveTooLate(room: Room, color: Color): boolean {
  if (room.timeLimit === 0) return false;
  return room.clocks[color] - elapsedSinceUpdate(room) < -TIMEOUT_TOLERANCE_MS;
}

export function makeTimeoutResult(room: Room, loserColor: Color): GameResult {
  return {
    gameNo: room.gameNo,
    winner: invertColor(loserColor),
    reason: "timeout",
    endedAt: now(),
  };
}
