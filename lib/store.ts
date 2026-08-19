import { customAlphabet } from "nanoid";
import {
  applyMove,
  createGame,
  evaluateGameEnd,
  invertColor,
  mapTurn,
  START_FEN,
} from "./chess-engine";
import { broadcast } from "./realtime";
import type {
  ChatMessage,
  Color,
  GameResult,
  MoveRecord,
  Player,
  RoomState,
  TimeLimit,
} from "@/types";

const genCode = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6); // 去掉易混淆字符
const genId = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 12);

interface Room extends RoomState {
  // 内部运行时字段
  chess?: ReturnType<typeof createGame>;
}

/**
 * 用 globalThis 持久化 rooms Map，防止 Next.js dev 模式热重载导致内存状态丢失。
 * 这是 Next.js 社区标准单例模式（Prisma 等库也使用同样的方式）。
 */
const globalForRooms = globalThis as unknown as {
  __chessArenaRooms?: Map<string, Room>;
};
const rooms: Map<string, Room> = globalForRooms.__chessArenaRooms ?? new Map();
if (!globalForRooms.__chessArenaRooms) {
  globalForRooms.__chessArenaRooms = rooms;
}

function now(): number {
  return Date.now();
}

function getOrCreateChess(room: Room) {
  if (!room.chess) room.chess = createGame(room.currentFen);
  else room.chess.load(room.currentFen);
  return room.chess;
}

function snapshot(room: Room): RoomState {
  return {
    code: room.code,
    status: room.status,
    timeLimit: room.timeLimit,
    createdAt: room.createdAt,
    finishedAt: room.finishedAt,
    gameNo: room.gameNo,
    currentFen: room.currentFen,
    turn: room.turn,
    players: room.players.map((p) => ({ ...p })),
    moves: room.moves.map((m) => ({ ...m })),
    chat: room.chat.map((c) => ({ ...c })),
    gameOver: room.gameOver,
    result: room.result,
    takeback: room.takeback ? { ...room.takeback } : undefined,
    draw: room.draw ? { ...room.draw } : undefined,
  };
}

function systemChat(room: Room, text: string): ChatMessage {
  const msg: ChatMessage = { id: genId(), from: "系统", text, at: now(), system: true };
  room.chat.push(msg);
  return msg;
}

function findPlayer(room: Room, playerId: string): Player | undefined {
  return room.players.find((p) => p.id === playerId);
}

function playerByColor(room: Room, color: Color): Player | undefined {
  return room.players.find((p) => p.color === color);
}

// ============ 创建 / 加入 ============
export function createRoom(opts: {
  name?: string;
  timeLimit?: TimeLimit;
  avatar?: string;
}): { code: string; playerId: string; color: Color } {
  let code = genCode();
  while (rooms.has(code)) code = genCode();

  const playerId = genId();
  const white: Player = {
    id: playerId,
    name: opts.name?.trim() || "玩家1",
    color: "white",
    connected: true,
    avatar: opts.avatar,
  };

  const room: Room = {
    code,
    status: "waiting",
    timeLimit: opts.timeLimit ?? 600,
    createdAt: now(),
    gameNo: 1,
    currentFen: START_FEN,
    turn: "white",
    players: [white],
    moves: [],
    chat: [],
    gameOver: false,
  };
  rooms.set(code, room);
  systemChat(room, `${white.name} 创建了房间`);
  return { code, playerId, color: "white" };
}

export function getRoom(code: string): RoomState | undefined {
  const room = rooms.get(code.toUpperCase());
  return room ? snapshot(room) : undefined;
}

export function joinRoom(
  code: string,
  opts: { name?: string; avatar?: string }
): { playerId: string; color: Color; room: RoomState } {
  const room = rooms.get(code.toUpperCase());
  if (!room) throw new RoomError("房间不存在", 404);
  if (room.status !== "waiting") throw new RoomError("对局已开始或已结束", 409);
  if (playerByColor(room, "black")) throw new RoomError("房间已满", 409);

  const playerId = genId();
  const black: Player = {
    id: playerId,
    name: opts.name?.trim() || "玩家2",
    color: "black",
    connected: true,
    avatar: opts.avatar,
  };
  room.players.push(black);

  // 开局
  room.status = "playing";
  room.currentFen = START_FEN;
  room.turn = "white";
  room.gameNo = 1;
  room.moves = [];
  room.gameOver = false;
  room.result = undefined;
  room.finishedAt = undefined;
  room.chess = createGame(START_FEN);

  const white = playerByColor(room, "white")!;
  systemChat(room, `${black.name} 加入了房间，对局开始！`);
  const roomState = snapshot(room);

  broadcast(room.code, {
    type: "game_start",
    fen: START_FEN,
    turn: "white",
    timeLimit: room.timeLimit,
    white,
    black,
  });
  return { playerId, color: "black", room: roomState };
}

// ============ 人机对战：加入 AI 机器人 ============
export function joinAIRoom(
  code: string,
  opts: { name?: string } = {}
): { playerId: string; color: Color; room: RoomState } {
  const room = rooms.get(code.toUpperCase());
  if (!room) throw new RoomError("房间不存在", 404);
  if (room.status !== "waiting") throw new RoomError("对局已开始或已结束", 409);
  if (playerByColor(room, "black")) throw new RoomError("房间已满", 409);

  const aiId = genId();
  const black: Player = {
    id: aiId,
    name: opts.name?.trim() || "🤖 电脑",
    color: "black",
    connected: true,
    isAI: true,
    avatar: "🤖",
  };
  room.players.push(black);

  room.status = "playing";
  room.currentFen = START_FEN;
  room.turn = "white";
  room.gameNo = 1;
  room.moves = [];
  room.gameOver = false;
  room.result = undefined;
  room.finishedAt = undefined;
  room.chess = createGame(START_FEN);

  const white = playerByColor(room, "white")!;
  systemChat(room, "🤖 电脑已就位，对局开始！");
  const roomState = snapshot(room);

  broadcast(room.code, {
    type: "game_start",
    fen: START_FEN,
    turn: "white",
    timeLimit: room.timeLimit,
    white,
    black,
  });
  return { playerId: aiId, color: "black", room: roomState };
}

// ============ 走棋 ============
export interface MoveOutcome {
  ok: boolean;
  error?: string;
  move?: MoveRecord;
  fen?: string;
  turn?: Color;
  gameOver?: boolean;
  result?: GameResult;
}

export function applyMoveAction(
  code: string,
  req: { playerId: string; from: string; to: string; promotion?: string }
): MoveOutcome {
  const room = rooms.get(code.toUpperCase());
  if (!room) return { ok: false, error: "房间不存在" };
  if (room.status !== "playing" || room.gameOver)
    return { ok: false, error: "当前不可走子" };

  const player = findPlayer(room, req.playerId);
  if (!player) return { ok: false, error: "玩家不存在" };
  if (room.turn !== player.color) return { ok: false, error: "未轮到您走子" };
  if (!player.connected) return { ok: false, error: "您已离线" };

  // 重试/重复走子防护：若已有相同序号且相同走法，拒绝
  const chess = getOrCreateChess(room);
  const res = applyMove(chess, { from: req.from, to: req.to, promotion: req.promotion });
  if (!res.ok || !res.fen) return { ok: false, error: res.error ?? "非法走子" };

  const moveNumber = room.moves.length + 1;
  const move: MoveRecord = {
    moveNumber,
    san: res.san!,
    fen: res.fen,
    from: req.from,
    to: req.to,
    promotion: req.promotion,
    playedBy: player.color,
    playedAt: now(),
  };
  room.moves.push(move);
  room.currentFen = res.fen;

  const end = evaluateGameEnd(chess);
  let result: GameResult | undefined;
  if (end.over) {
    room.gameOver = true;
    room.status = "finished";
    room.finishedAt = now();
    result = {
      gameNo: room.gameNo,
      winner: end.winner,
      reason: end.reason!,
      endedAt: room.finishedAt,
    };
    room.result = result;
  } else {
    room.turn = invertColor(player.color);
  }

  const roomState = snapshot(room);
  broadcast(room.code, {
    type: "move",
    move,
    fen: res.fen,
    turn: room.turn,
    gameOver: room.gameOver,
    result,
  });
  if (result) {
    systemChat(room, resultMessage(result));
    // 结果已在 move 事件中带出，无需重复广播
  }
  return {
    ok: true,
    move,
    fen: res.fen,
    turn: room.turn,
    gameOver: room.gameOver,
    result,
  };
}

// ============ 聊天 ============
export function sendChatAction(
  code: string,
  req: { playerId: string; text: string }
): { ok: boolean; error?: string; message?: ChatMessage } {
  const room = rooms.get(code.toUpperCase());
  if (!room) return { ok: false, error: "房间不存在" };
  const player = findPlayer(room, req.playerId);
  if (!player) return { ok: false, error: "玩家不存在" };
  const text = req.text.trim();
  if (!text) return { ok: false, error: "消息为空" };

  const message: ChatMessage = {
    id: genId(),
    from: player.name,
    color: player.color,
    text: text.slice(0, 500),
    at: now(),
  };
  room.chat.push(message);
  broadcast(room.code, { type: "chat", message });
  return { ok: true, message };
}

// ============ 认输 ============
export function resignAction(code: string, playerId: string): MoveOutcome {
  const room = rooms.get(code.toUpperCase());
  if (!room || room.status !== "playing" || room.gameOver)
    return { ok: false, error: "当前不可认输" };
  const player = findPlayer(room, playerId);
  if (!player) return { ok: false, error: "玩家不存在" };

  const result: GameResult = {
    gameNo: room.gameNo,
    winner: invertColor(player.color),
    reason: "resignation",
    endedAt: now(),
  };
  room.gameOver = true;
  room.status = "finished";
  room.finishedAt = now();
  room.result = result;
  systemChat(room, resultMessage(result));
  broadcast(room.code, { type: "resign", by: player.color, result });
  return { ok: true, result };
}

// ============ 求和 ============
export function drawOfferAction(code: string, playerId: string) {
  const room = rooms.get(code.toUpperCase());
  if (!room || room.status !== "playing" || room.gameOver)
    return { ok: false, error: "当前不可提议和棋" };
  const player = findPlayer(room, playerId);
  if (!player) return { ok: false, error: "玩家不存在" };
  room.draw = { by: player.color, pending: true };
  broadcast(room.code, { type: "draw_offer", by: player.color });
  return { ok: true };
}

export function drawRespondAction(
  code: string,
  playerId: string,
  action: "accept" | "decline"
) {
  const room = rooms.get(code.toUpperCase());
  if (!room || !room.draw || !room.draw.pending)
    return { ok: false, error: "没有待处理的和棋请求" };
  const player = findPlayer(room, playerId);
  if (!player) return { ok: false, error: "玩家不存在" };
  if (player.color === room.draw.by)
    return { ok: false, error: "不能对自己的请求进行操作" };

  const by = room.draw.by;
  if (action === "accept") {
    const result: GameResult = {
      gameNo: room.gameNo,
      winner: null,
      reason: "draw",
      endedAt: now(),
    };
    room.gameOver = true;
    room.status = "finished";
    room.finishedAt = now();
    room.result = result;
    room.draw = undefined;
    systemChat(room, resultMessage(result));
    broadcast(room.code, { type: "draw_accepted", result });
    return { ok: true, result };
  } else {
    room.draw = undefined;
    broadcast(room.code, { type: "draw_declined", by: player.color });
    return { ok: true };
  }
}

// ============ 悔棋 ============
export function takebackRequestAction(code: string, playerId: string) {
  const room = rooms.get(code.toUpperCase());
  if (!room || room.status !== "playing" || room.gameOver)
    return { ok: false, error: "当前不可请求悔棋" };
  const player = findPlayer(room, playerId);
  if (!player) return { ok: false, error: "玩家不存在" };
  room.takeback = { by: player.color, pending: true };
  broadcast(room.code, { type: "takeback_request", by: player.color });
  return { ok: true };
}

export function takebackRespondAction(
  code: string,
  playerId: string,
  action: "accept" | "decline"
) {
  const room = rooms.get(code.toUpperCase());
  if (!room || !room.takeback || !room.takeback.pending)
    return { ok: false, error: "没有待处理的悔棋请求" };
  const player = findPlayer(room, playerId);
  if (!player) return { ok: false, error: "玩家不存在" };
  if (player.color === room.takeback.by)
    return { ok: false, error: "不能对自己的请求进行操作" };

  const by = room.takeback.by;
  if (action === "accept") {
    if (room.moves.length > 0) {
      room.moves.pop();
      const prevFen = room.moves.length
        ? room.moves[room.moves.length - 1].fen
        : START_FEN;
      room.currentFen = prevFen;
      room.turn = room.moves.length
        ? invertColor(room.moves[room.moves.length - 1].playedBy)
        : "white";
    } else {
      room.currentFen = START_FEN;
      room.turn = "white";
    }
    room.takeback = undefined;
    room.chess = createGame(room.currentFen);
    const moves = room.moves.map((m) => ({ ...m }));
    broadcast(room.code, {
      type: "takeback_accepted",
      fen: room.currentFen,
      moves,
      turn: room.turn,
    });
    return { ok: true };
  } else {
    room.takeback = undefined;
    broadcast(room.code, { type: "takeback_declined", by: player.color });
    return { ok: true };
  }
}

// ============ 超时 ============
export function timeoutAction(code: string, playerId: string) {
  const room = rooms.get(code.toUpperCase());
  if (!room || room.status !== "playing" || room.gameOver)
    return { ok: false, error: "当前不可判超时" };
  const player = findPlayer(room, playerId);
  if (!player) return { ok: false, error: "玩家不存在" };

  const result: GameResult = {
    gameNo: room.gameNo,
    winner: invertColor(player.color),
    reason: "timeout",
    endedAt: now(),
  };
  room.gameOver = true;
  room.status = "finished";
  room.finishedAt = now();
  room.result = result;
  systemChat(room, resultMessage(result));
  broadcast(room.code, { type: "timeout", by: player.color, result });
  return { ok: true, result };
}

// ============ 再来一局 ============
export function rematchAction(code: string, playerId: string) {
  const room = rooms.get(code.toUpperCase());
  if (!room) return { ok: false, error: "房间不存在" };
  if (room.status !== "finished")
    return { ok: false, error: "当前对局尚未结束" };
  const player = findPlayer(room, playerId);
  if (!player) return { ok: false, error: "玩家不存在" };

  // 交换先后手
  for (const p of room.players) {
    p.color = invertColor(p.color);
    p.connected = true;
  }
  room.status = "playing";
  room.gameNo += 1;
  room.currentFen = START_FEN;
  room.turn = "white";
  room.moves = [];
  room.gameOver = false;
  room.result = undefined;
  room.finishedAt = undefined;
  room.takeback = undefined;
  room.draw = undefined;
  room.chess = createGame(START_FEN);
  room.chat = [];
  systemChat(room, "新一局开始，已交换先后手！");

  const white = playerByColor(room, "white")!;
  const black = playerByColor(room, "black")!;
  broadcast(room.code, {
    type: "rematch",
    gameNo: room.gameNo,
    fen: START_FEN,
    turn: "white",
    timeLimit: room.timeLimit,
    white,
    black,
  });
  return { ok: true };
}

// ============ 断线状态 ============
export function setConnected(code: string, playerId: string, connected: boolean) {
  const room = rooms.get(code.toUpperCase());
  if (!room) return;
  const player = findPlayer(room, playerId);
  if (!player) return;
  player.connected = connected;
  if (!connected) {
    broadcast(room.code, { type: "opponent_left", color: player.color });
  }
}

// ============ 工具 ============
function resultMessage(r: GameResult): string {
  const winnerText = r.winner ? (r.winner === "white" ? "白方" : "黑方") : "";
  const reasonText: Record<GameResult["reason"], string> = {
    checkmate: "将死",
    resignation: "认输",
    timeout: "超时",
    draw: "协议和棋",
    stalemate: "逼和（无子可动）",
    insufficient: "子力不足",
    threefold: "三次重复局面",
    fifty: "50 步规则",
  };
  if (r.winner) return `${winnerText}胜（${reasonText[r.reason]}）`;
  return `和棋（${reasonText[r.reason]}）`;
}

export function getSnapshot(code: string): RoomState | undefined {
  const room = rooms.get(code.toUpperCase());
  return room ? snapshot(room) : undefined;
}

export class RoomError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
