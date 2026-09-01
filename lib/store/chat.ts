import type { ChatMessage } from "@/types";
import { broadcast } from "../realtime";
import { MAX_CHAT_HISTORY, MAX_CHAT_LEN } from "./constants";
import { findPlayer, genId, now, rooms } from "./room";

export function sendChatAction(
  code: string,
  req: { playerId: string; text: string }
): { ok: boolean; error?: string; message?: ChatMessage } {
  const room = rooms.get(code.toUpperCase());
  if (!room) return { ok: false, error: "房间不存在" };
  const player = findPlayer(room, req.playerId);
  if (!player) return { ok: false, error: "玩家不存在" };
  if (typeof req.text !== "string") return { ok: false, error: "消息格式错误" };
  const text = req.text.trim();
  if (!text) return { ok: false, error: "消息为空" };

  const message: ChatMessage = {
    id: genId(),
    from: player.name,
    color: player.color,
    text: text.slice(0, MAX_CHAT_LEN),
    at: now(),
  };
  room.chat.push(message);
  if (room.chat.length > MAX_CHAT_HISTORY) room.chat.splice(0, room.chat.length - MAX_CHAT_HISTORY);
  broadcast(room.code, { type: "chat", message });
  return { ok: true, message };
}
