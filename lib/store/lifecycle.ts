import { pruneRateLimit } from "../rate-limit";
import { closeSubscribers } from "../realtime";
import { FINISHED_ROOM_TTL, IDLE_ROOM_TTL, RATE_LIMIT_PRUNE_WINDOW_MS } from "./constants";
import { presenceDropRoom } from "./presence";
import { now, rooms, type Room } from "./room";

/** 房间最后一次活动时间：取创建/最后走子/最后聊天的最大值 */
function lastActivityAt(room: Room): number {
  let t = room.createdAt;
  const lastMove = room.moves[room.moves.length - 1];
  if (lastMove && lastMove.playedAt > t) t = lastMove.playedAt;
  const lastChat = room.chat[room.chat.length - 1];
  if (lastChat && lastChat.at > t) t = lastChat.at;
  return t;
}

/**
 * 删除过期房间并断开其 SSE 订阅，防止内存无限增长。
 * 在 createRoom 时触发：内存只随创建增长，按创建节奏清扫即可兜底。
 */
export function sweepExpiredRooms(): void {
  const nowTs = now();
  for (const [code, room] of rooms) {
    const base =
      room.status === "finished" ? (room.finishedAt ?? lastActivityAt(room)) : lastActivityAt(room);
    const ttl = room.status === "finished" ? FINISHED_ROOM_TTL : IDLE_ROOM_TTL;
    if (nowTs - base > ttl) {
      rooms.delete(code);
      closeSubscribers(code);
      for (const p of room.players) presenceDropRoom(`${code}:${p.id}`);
    }
  }
  pruneRateLimit(RATE_LIMIT_PRUNE_WINDOW_MS);
}
