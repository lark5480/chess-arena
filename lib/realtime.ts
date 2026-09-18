import type { RoomEvent } from "@/types";
import { eventToSse } from "./events";

type Controller = ReadableStreamDefaultController<Uint8Array>;

/** 订阅元数据：平台掐断 SSE 时 cancel() 不保证触发，靠这些信息识别并回收僵尸订阅 */
interface SubscriberMeta {
  createdAt: number;
  playerId?: string;
}

/**
 * 用 globalThis 持久化 subscribers Map，防止 Next.js dev 模式热重载导致 SSE 连接丢失。
 * value 为 Map<Controller, Meta>：Set 升级为 Map 是为了记录建立时间/玩家，支撑僵尸清理。
 */
const globalForSubs = globalThis as unknown as {
  __chessArenaSubs?: Map<string, Map<Controller, SubscriberMeta>>;
};
const subscribers: Map<string, Map<Controller, SubscriberMeta>> = globalForSubs.__chessArenaSubs ??
new Map();
if (!globalForSubs.__chessArenaSubs) {
  globalForSubs.__chessArenaSubs = subscribers;
}
const encoder = new TextEncoder();

export function addSubscriber(code: string, controller: Controller, playerId?: string): void {
  let map = subscribers.get(code);
  if (!map) {
    map = new Map();
    subscribers.set(code, map);
  }
  map.set(controller, { createdAt: Date.now(), playerId });
}

export function removeSubscriber(code: string, controller: Controller): void {
  const map = subscribers.get(code);
  if (!map) return;
  map.delete(controller);
  if (map.size === 0) subscribers.delete(code);
}

/** 房间被清理时，主动关闭该房间所有 SSE 连接并移除订阅 */
export function closeSubscribers(code: string): void {
  const map = subscribers.get(code);
  if (!map) return;
  subscribers.delete(code);
  for (const controller of map.keys()) {
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
  for (const map of subscribers.values()) n += map.size;
  return n;
}

/**
 * 回收某玩家在该房间的多余旧连接，只保留最新 keepLatest 条（默认 2，兼容双标签页）。
 * 平台掐断 SSE 时 cancel() 不保证触发，重连会在订阅表里留下"僵尸"堵死房间配额；
 * 重连携带相同的 playerId，此时旧连接基本都是残留，可安全回收。
 */
export function removeSubscribersByPlayer(code: string, playerId: string, keepLatest = 2): number {
  const map = subscribers.get(code);
  if (!map) return 0;
  // 按建立时间倒序，最新的保留
  const mine = [...map.entries()]
    .filter(([, meta]) => meta.playerId === playerId)
    .sort((a, b) => b[1].createdAt - a[1].createdAt);
  let removed = 0;
  for (const [controller] of mine.slice(keepLatest)) {
    map.delete(controller);
    removed += 1;
    try {
      controller.close();
    } catch {
      /* 已关闭 */
    }
  }
  if (map.size === 0) subscribers.delete(code);
  return removed;
}

/** 清理某房间内建立超过 maxAgeMs 的订阅（平台掐断后残留的僵尸），返回清理数 */
export function pruneStaleSubscribers(code: string, maxAgeMs: number): number {
  const map = subscribers.get(code);
  if (!map) return 0;
  const cutoff = Date.now() - maxAgeMs;
  let removed = 0;
  for (const [controller, meta] of [...map.entries()]) {
    if (meta.createdAt < cutoff) {
      map.delete(controller);
      removed += 1;
      try {
        controller.close();
      } catch {
        /* 已关闭 */
      }
    }
  }
  if (map.size === 0) subscribers.delete(code);
  return removed;
}

/** 全局清理超龄订阅（全局总额上限兜底），返回清理数 */
export function pruneAllStaleSubscribers(maxAgeMs: number): number {
  let removed = 0;
  for (const code of [...subscribers.keys()]) {
    removed += pruneStaleSubscribers(code, maxAgeMs);
  }
  return removed;
}

export type SubscriberSlotResult = "ok" | "room-full" | "global-full";

/**
 * 接纳新连接前的容量检查：达上限先回收僵尸/同玩家旧连接，仍满才拒绝。
 * 之所以"先清理再拒绝"，是因为平台掐断连接时 cancel() 可能不触发，
 * 死订阅会把配额永久占满，表现为客户端重连永远 429 卡死（EdgeOne 上曾发生）。
 * 返回 "ok" 后调用方应同步 addSubscriber（同一 tick 内无并发窗口）。
 */
export function acquireSubscriberSlot(
  code: string,
  playerId: string | undefined,
  opts: { maxPerRoom: number; maxTotal: number; staleMs: number }
): SubscriberSlotResult {
  if (subscriberCount(code) >= opts.maxPerRoom) {
    if (playerId) removeSubscribersByPlayer(code, playerId);
    if (subscriberCount(code) >= opts.maxPerRoom) pruneStaleSubscribers(code, opts.staleMs);
    if (subscriberCount(code) >= opts.maxPerRoom) return "room-full";
  }
  if (totalSubscriberCount() >= opts.maxTotal) {
    pruneAllStaleSubscribers(opts.staleMs);
    if (totalSubscriberCount() >= opts.maxTotal) return "global-full";
  }
  return "ok";
}

/** 向房间内所有订阅者广播事件 */
export function broadcast(code: string, event: RoomEvent): void {
  const map = subscribers.get(code);
  if (!map || map.size === 0) return;
  const payload = encoder.encode(eventToSse(event));
  for (const controller of map.keys()) {
    try {
      controller.enqueue(payload);
    } catch {
      // 订阅已失效，忽略
    }
  }
}
