import { customAlphabet } from "nanoid";
import { createGame } from "../chess-engine";
import type { Clocks, Color, Player, RoomState } from "@/types";

export const genCode = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6); // 去掉易混淆字符
export const genId = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 12);

export interface Room extends RoomState {
  // 内部运行时字段
  clocks: Clocks;
  clockUpdatedAt: number;
  chess?: ReturnType<typeof createGame>;
}

/**
 * 用 globalThis 持久化 rooms Map，防止 Next.js dev 模式热重载导致内存状态丢失。
 * 这是 Next.js 社区标准单例模式（Prisma 等库也使用同样的方式）。
 */
const globalForRooms = globalThis as unknown as {
  __chessArenaRooms?: Map<string, Room>;
};
export const rooms: Map<string, Room> = globalForRooms.__chessArenaRooms ?? new Map();
if (!globalForRooms.__chessArenaRooms) {
  globalForRooms.__chessArenaRooms = rooms;
}

export function now(): number {
  return Date.now();
}

/** 房间码大小写不敏感（用户可能手抄成小写） */
export function findRoom(code: string): Room | undefined {
  return rooms.get(code.toUpperCase());
}

export function findPlayer(room: Room, playerId: string): Player | undefined {
  return room.players.find((p) => p.id === playerId);
}

export function playerByColor(room: Room, color: Color): Player | undefined {
  return room.players.find((p) => p.color === color);
}

/** 取（或按当前 FEN 重建）房间的 chess.js 实例 */
export function getOrCreateChess(room: Room) {
  if (!room.chess) room.chess = createGame(room.currentFen);
  else room.chess.load(room.currentFen);
  return room.chess;
}
