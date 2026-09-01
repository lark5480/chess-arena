import type { GameResult } from "@/types";
import { now, type Room } from "./room";

/**
 * 落地终局状态。
 *
 * 所有终局路径（将死 / 认输 / 超时 / 和棋）都必须经过这里：统一清除残留的
 * 求和与悔棋 pending，杜绝"对局结束后仍能改写结果或回退棋盘"的不一致状态。
 * 各响应动作另有 `status === "playing"` 守卫作为第二道防线。
 */
export function finishGame(room: Room, result: GameResult): GameResult {
  room.gameOver = true;
  room.status = "finished";
  room.finishedAt = now();
  room.result = result;
  room.draw = undefined;
  room.takeback = undefined;
  return result;
}
