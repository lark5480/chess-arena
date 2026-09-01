import type { RoomEvent } from "@/types";
import { eventToSse } from "./events";

type Controller = ReadableStreamDefaultController<Uint8Array>;

/**
 * 用 globalThis 持久化 subscribers Map，防止 Next.js dev 模式热重载导致 SSE 连接丢失。
 */
const globalForSubs = globalThis as unknown as {
  __chessArenaSubs?: Map<string, Set<Controller>>;
};
const subscribers: Map<string, Set<Controller>> = globalForSubs.__chessArenaSubs ?? new Map();
if (!globalForSubs.__chessArenaSubs) {
  globalForSubs.__chessArenaSubs = subscribers;
}
const encoder = new TextEncoder();

export function addSubscriber(code: string, controller: Controller): void {
  let set = subscribers.get(code);
  if (!set) {
    set = new Set();
    subscribers.set(code, set);
  }
  set.add(controller);
}

export function removeSubscriber(code: string, controller: Controller): void {
  const set = subscribers.get(code);
  if (!set) return;
  set.delete(controller);
  if (set.size === 0) subscribers.delete(code);
}

/** 房间被清理时，主动关闭该房间所有 SSE 连接并移除订阅 */
export function closeSubscribers(code: string): void {
  const set = subscribers.get(code);
  if (!set) return;
  subscribers.delete(code);
  for (const controller of set) {
    try {
      controller.close();
    } catch {
      /* 已关闭 */
    }
  }
}

/** 某房间的当前订阅连接数（用于连接数上限） */
export function subscriberCount(code: string): number {
  return subscribers.get(code)?.size ?? 0;
}

/** 全局订阅连接总数（用于连接数上限，防 SSE 洪泛耗尽内存） */
export function totalSubscriberCount(): number {
  let n = 0;
  for (const set of subscribers.values()) n += set.size;
  return n;
}

/** 向房间内所有订阅者广播事件 */
export function broadcast(code: string, event: RoomEvent): void {
  const set = subscribers.get(code);
  if (!set || set.size === 0) return;
  const payload = encoder.encode(eventToSse(event));
  for (const controller of set) {
    try {
      controller.enqueue(payload);
    } catch {
      // 订阅已失效，忽略
    }
  }
}
