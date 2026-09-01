import type { Color, Player, RoomState, TimeLimit } from "@/types";
import { createGame, START_FEN } from "../chess-engine";
import { broadcast } from "../realtime";
import { resetClocks } from "./clock";
import { MAX_ROOMS, RoomError } from "./constants";
import { sweepExpiredRooms } from "./lifecycle";
import { genCode, genId, now, playerByColor, rooms, type Room } from "./room";
import { publicPlayer, snapshot, systemChat } from "./snapshot";
import { avatarSchema, playerNameSchema, timeLimitSchema } from "./validate";

export function createRoom(opts: { name?: string; timeLimit?: TimeLimit; avatar?: string }): {
  code: string;
  playerId: string;
  color: Color;
} {
  sweepExpiredRooms();
  if (rooms.size >= MAX_ROOMS) throw new RoomError("服务器繁忙，请稍后再试", 503);

  let code = genCode();
  while (rooms.has(code)) code = genCode();

  const playerId = genId();
  const timeLimit = timeLimitSchema.parse(opts.timeLimit);
  const white: Player = {
    id: playerId,
    name: playerNameSchema("玩家1").parse(opts.name),
    color: "white",
    connected: true,
    avatar: avatarSchema.parse(opts.avatar),
  };

  const room: Room = {
    code,
    status: "waiting",
    timeLimit,
    createdAt: now(),
    gameNo: 1,
    currentFen: START_FEN,
    turn: "white",
    players: [white],
    moves: [],
    chat: [],
    gameOver: false,
    clocks: { white: timeLimit * 1000, black: timeLimit * 1000 },
    clockUpdatedAt: now(),
  };
  rooms.set(code, room);
  systemChat(room, `${white.name} 创建了房间`);
  return { code, playerId, color: "white" };
}

export function getRoom(code: string): RoomState | undefined {
  const room = rooms.get(code.toUpperCase());
  return room ? snapshot(room) : undefined;
}

/** SSE 连接建立时用的快照入口，语义与 getRoom 一致 */
export function getSnapshot(code: string): RoomState | undefined {
  return getRoom(code);
}

/** 加入前的公共校验：房间存在、仍在等待、黑位空闲 */
function assertJoinable(code: string): Room {
  const room = rooms.get(code.toUpperCase());
  if (!room) throw new RoomError("房间不存在", 404);
  if (room.status !== "waiting") throw new RoomError("对局已开始或已结束", 409);
  if (playerByColor(room, "black")) throw new RoomError("房间已满", 409);
  return room;
}

/** 双方就位：重置棋盘、走法与时钟，并广播 game_start */
function beginGame(room: Room, systemText: string): RoomState {
  room.status = "playing";
  room.currentFen = START_FEN;
  room.turn = "white";
  room.gameNo = 1;
  room.moves = [];
  room.gameOver = false;
  room.result = undefined;
  room.finishedAt = undefined;
  room.chess = createGame(START_FEN);
  resetClocks(room);

  const white = playerByColor(room, "white")!;
  const black = playerByColor(room, "black")!;
  systemChat(room, systemText);
  const roomState = snapshot(room);

  broadcast(room.code, {
    type: "game_start",
    fen: START_FEN,
    turn: "white",
    timeLimit: room.timeLimit,
    white: publicPlayer(white),
    black: publicPlayer(black),
  });
  return roomState;
}

export function joinRoom(
  code: string,
  opts: { name?: string; avatar?: string }
): { code: string; playerId: string; color: Color; room: RoomState } {
  const room = assertJoinable(code);
  const playerId = genId();
  const black: Player = {
    id: playerId,
    name: playerNameSchema("玩家2").parse(opts.name),
    color: "black",
    connected: true,
    avatar: avatarSchema.parse(opts.avatar),
  };
  room.players.push(black);
  const roomState = beginGame(room, `${black.name} 加入了房间，对局开始！`);
  return { code: room.code, playerId, color: "black", room: roomState };
}

/** 人机对战：以 AI 机器人占据黑位 */
export function joinAIRoom(
  code: string,
  opts: { name?: string } = {}
): { code: string; playerId: string; color: Color; room: RoomState } {
  const room = assertJoinable(code);
  const aiId = genId();
  const black: Player = {
    id: aiId,
    name: playerNameSchema("🤖 电脑").parse(opts.name),
    color: "black",
    connected: true,
    isAI: true,
    avatar: "🤖",
  };
  room.players.push(black);
  const roomState = beginGame(room, "🤖 电脑已就位，对局开始！");
  return { code: room.code, playerId: aiId, color: "black", room: roomState };
}
