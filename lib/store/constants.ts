import type { TimeLimit } from "@/types";

export const MAX_NAME_LEN = 20;
export const MAX_AVATAR_LEN = 8;
export const MAX_CHAT_LEN = 500;
export const MAX_CHAT_HISTORY = 200;

/** 进程内房间总数上限（内存存储兜底，防无限创建） */
export const MAX_ROOMS = 500;

export const VALID_TIME_LIMITS: readonly TimeLimit[] = [0, 300, 600, 900];

export const FINISHED_ROOM_TTL = 30 * 60 * 1000; // 结束后保留 30 分钟（供回看）
export const IDLE_ROOM_TTL = 3 * 60 * 60 * 1000; // 无活动 3 小时后清理

/** 超时容差：抵消客户端倒计时与网络延迟的误差 */
export const TIMEOUT_TOLERANCE_MS = 200;

/** SSE 短暂断开（如 Serverless 函数超时后重连）的离线宽限期 */
export const DISCONNECT_GRACE_MS = 10_000;

/** 清扫时顺带修剪限流记录的时间窗 */
export const RATE_LIMIT_PRUNE_WINDOW_MS = 60_000;

/** 带 HTTP 状态码的错误，API 路由据此返回对应状态 */
export class RoomError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
