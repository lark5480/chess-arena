import { broadcast } from "../realtime";
import { DISCONNECT_GRACE_MS } from "./constants";
import { findPlayer, now, rooms, type Room } from "./room";
import { snapshot } from "./snapshot";

const globalForPresence = globalThis as unknown as {
  __chessArenaPresenceTimers?: Map<string, ReturnType<typeof setTimeout>>;
};
const presenceTimers: Map<
  string,
  ReturnType<typeof setTimeout>
> = globalForPresence.__chessArenaPresenceTimers ?? new Map();
if (!globalForPresence.__chessArenaPresenceTimers) {
  globalForPresence.__chessArenaPresenceTimers = presenceTimers;
}

/** 同一玩家的并发 SSE 连接数（多标签页共享身份）：归零才判离线 */
const connectionCounts: Map<string, number> = new Map();

function broadcastPresence(room: Room) {
  broadcast(room.code, { type: "state", room: snapshot(room) });
}

/**
 * 标记玩家在线/离线（由 SSE 连接/断开驱动）。
 * 同一玩家可能开多个标签页（共享 sessionStorage 身份）：连接计数归零才视为离线。
 * 离线有宽限期，期间重连则取消；状态变化时广播全量快照。
 */
export function setConnected(code: string, playerId: string, connected: boolean) {
  const room = rooms.get(code.toUpperCase());
  if (!room) return;
  const player = findPlayer(room, playerId);
  if (!player || player.isAI) return;
  const key = `${room.code}:${playerId}`;

  if (connected) {
    connectionCounts.set(key, (connectionCounts.get(key) ?? 0) + 1);
    const timer = presenceTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      presenceTimers.delete(key);
    }
    if (!player.connected) {
      player.connected = true;
      broadcastPresence(room);
    }
    return;
  }

  const count = (connectionCounts.get(key) ?? 0) - 1;
  if (count > 0) {
    // 还有其他标签页/连接在场，保持在线
    connectionCounts.set(key, count);
    return;
  }
  connectionCounts.delete(key);
  if (presenceTimers.has(key)) return;
  presenceTimers.set(
    key,
    setTimeout(() => {
      presenceTimers.delete(key);
      const r = rooms.get(room.code);
      const p = r && findPlayer(r, playerId);
      if (r && p && p.connected && !p.isAI) {
        p.connected = false;
        broadcastPresence(r);
      }
    }, DISCONNECT_GRACE_MS)
  );
}

/**
 * 房间被清扫时清掉残留的连接计数，防止 Map 泄漏。
 * key 形如 CODE:playerId；清扫时房间已删，逐 key 前缀匹配删除。
 */
export function presenceDropRoom(keyPrefix: string): void {
  for (const key of connectionCounts.keys()) {
    if (key.startsWith(keyPrefix)) connectionCounts.delete(key);
  }
}
