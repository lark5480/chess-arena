import { customAlphabet } from "nanoid";
import {
  applyMove,
  createGame,
  evaluateGameEnd,
  invertColor,
  mapTurn,
  START_FEN,
} from "./chess-engine";
import { broadcast, closeSubscribers } from "./realtime";
import { pruneRateLimit } from "./rate-limit";
import type {
  ChatMessage,
  Color,
  GameResult,
  MoveRecord,
  Player,
  RoomState,
  TimeLimit,
  Clocks,
} from "@/types";
const genCode = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 6); // 去掉易混淆字符
const genId = customAlphabet("abcdefghijklmnopqrstuvwxyz0123456789", 12);

interface Room extends RoomState {
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
const rooms: Map<string, Room> = globalForRooms.__chessArenaRooms ?? new Map();
if (!globalForRooms.__chessArenaRooms) {
  globalForRooms.__chessArenaRooms = rooms;
}

function now(): number {
  return Date.now();
}

// ============ 输入清洗与校验 ============
const VALID_TIME_LIMITS: readonly TimeLimit[] = [0, 300, 600, 900];
const MAX_NAME_LEN = 20;
const MAX_AVATAR_LEN = 8;
const MAX_CHAT_LEN = 500;
const MAX_CHAT_HISTORY = 200;
/** 进程内房间总数上限（内存存储兜底，防无限创建） */
const MAX_ROOMS = 500;

function sanitizeName(name: unknown, fallback: string): string {
  return typeof name === "string" && name.trim() ? name.trim().slice(0, MAX_NAME_LEN) : fallback;
}
function sanitizeAvatar(avatar: unknown): string | undefined {
  return typeof avatar === "string" && avatar ? avatar.slice(0, MAX_AVATAR_LEN) : undefined;
}
/** 时限白名单校验：非 {0,300,600,900} 一律回落 600（0 = 无限制，不能被 falsy 兜底吃掉） */
function normalizeTimeLimit(v: unknown): TimeLimit {
  return VALID_TIME_LIMITS.includes(v as TimeLimit) ? (v as TimeLimit) : 600;
}

function getOrCreateChess(room: Room) {
  if (!room.chess) room.chess = createGame(room.currentFen);
  else room.chess.load(room.currentFen);
  return room.chess;
}

/**
 * 快照（对外下发）。players[].id 一律置空：playerId 是走子/认输等操作的唯一凭证，
 * 只能通过创建/加入的私有响应下发给本人，绝不能随快照/广播泄露给观战者或对手。
 * 客户端凭 sessionStorage 中的 lobby 身份识别自己（myColor），无需他人 id。
 */
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
    clocks: room.clocks ? { ...room.clocks } : undefined,
    clockUpdatedAt: room.clockUpdatedAt,
    players: room.players.map((p) => ({ ...p, id: "" })),
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
  // 聊天记录封顶，防单房间内存无限增长
  if (room.chat.length > MAX_CHAT_HISTORY) room.chat.splice(0, room.chat.length - MAX_CHAT_HISTORY);
  return msg;
}

/** 结果播报写入聊天并广播（否则客户端要等下次全量快照才能看到） */
function broadcastSystemChat(room: Room, text: string): void {
  broadcast(room.code, { type: "chat", message: systemChat(room, text) });
}

/** 对外下发用的玩家对象（隐去 id 凭证） */
function publicPlayer(p: Player): Player {
  return { ...p, id: "" };
}

function findPlayer(room: Room, playerId: string): Player | undefined {
  return room.players.find((p) => p.id === playerId);
}

function playerByColor(room: Room, color: Color): Player | undefined {
  return room.players.find((p) => p.color === color);
}

// ============ 过期清扫 ============
const FINISHED_ROOM_TTL = 30 * 60 * 1000; // 结束后保留 30 分钟（供回看）
const IDLE_ROOM_TTL = 3 * 60 * 60 * 1000; // 无活动 3 小时后清理

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
  pruneRateLimit(60_000);
}

// ============ 创建 / 加入 ============
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
  const timeLimit = normalizeTimeLimit(opts.timeLimit);
  const white: Player = {
    id: playerId,
    name: sanitizeName(opts.name, "玩家1"),
    color: "white",
    connected: true,
    avatar: sanitizeAvatar(opts.avatar),
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

export function joinRoom(
  code: string,
  opts: { name?: string; avatar?: string }
): { code: string; playerId: string; color: Color; room: RoomState } {
  const room = rooms.get(code.toUpperCase());
  if (!room) throw new RoomError("房间不存在", 404);
  if (room.status !== "waiting") throw new RoomError("对局已开始或已结束", 409);
  if (playerByColor(room, "black")) throw new RoomError("房间已满", 409);

  const playerId = genId();
  const black: Player = {
    id: playerId,
    name: sanitizeName(opts.name, "玩家2"),
    color: "black",
    connected: true,
    avatar: sanitizeAvatar(opts.avatar),
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
  room.clocks = { white: room.timeLimit * 1000, black: room.timeLimit * 1000 };
  room.clockUpdatedAt = now();

  const white = playerByColor(room, "white")!;
  systemChat(room, `${black.name} 加入了房间，对局开始！`);
  const roomState = snapshot(room);

  broadcast(room.code, {
    type: "game_start",
    fen: START_FEN,
    turn: "white",
    timeLimit: room.timeLimit,
    white: publicPlayer(white),
    black: publicPlayer(black),
  });
  return { code: room.code, playerId, color: "black", room: roomState };
}

// ============ 人机对战：加入 AI 机器人 ============
export function joinAIRoom(
  code: string,
  opts: { name?: string } = {}
): { code: string; playerId: string; color: Color; room: RoomState } {
  const room = rooms.get(code.toUpperCase());
  if (!room) throw new RoomError("房间不存在", 404);
  if (room.status !== "waiting") throw new RoomError("对局已开始或已结束", 409);
  if (playerByColor(room, "black")) throw new RoomError("房间已满", 409);

  const aiId = genId();
  const black: Player = {
    id: aiId,
    name: sanitizeName(opts.name, "🤖 电脑"),
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
  room.clocks = { white: room.timeLimit * 1000, black: room.timeLimit * 1000 };
  room.clockUpdatedAt = now();

  const white = playerByColor(room, "white")!;
  systemChat(room, "🤖 电脑已就位，对局开始！");
  const roomState = snapshot(room);

  broadcast(room.code, {
    type: "game_start",
    fen: START_FEN,
    turn: "white",
    timeLimit: room.timeLimit,
    white: publicPlayer(white),
    black: publicPlayer(black),
  });
  return { code: room.code, playerId: aiId, color: "black", room: roomState };
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
  if (room.status !== "playing" || room.gameOver) return { ok: false, error: "当前不可走子" };

  const player = findPlayer(room, req.playerId);
  if (!player) return { ok: false, error: "玩家不存在" };
  if (room.turn !== player.color) return { ok: false, error: "未轮到您走子" };
  if (!player.connected) return { ok: false, error: "您已离线" };

  // 落子前先核时钟：钟面已耗尽且超出网络容差 → 该步棋超时无效，直接判负。
  // 防止"超时走子被接受、时钟钳到 0 后停表导致永远无法判超时"的不一致。
  const elapsed = now() - room.clockUpdatedAt;
  if (room.timeLimit > 0 && room.clocks[player.color] - elapsed < -TIMEOUT_TOLERANCE_MS) {
    return timeoutByMoveLateness(room, player.color);
  }

  const chess = getOrCreateChess(room);
  const res = applyMove(chess, { from: req.from, to: req.to, promotion: req.promotion });
  if (!res.ok || !res.fen) return { ok: false, error: res.error ?? "非法走子" };

  const clocksBefore: Clocks = { ...room.clocks };
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
    clocksBefore,
  };
  room.moves.push(move);
  room.currentFen = res.fen;
  room.clocks[player.color] = Math.max(0, room.clocks[player.color] - elapsed);
  room.clockUpdatedAt = now();

  const end = evaluateGameEnd(chess);
  let result: GameResult | undefined;
  if (end.over) {
    room.gameOver = true;
    room.status = "finished";
    room.finishedAt = now();
    // 终局清除残留的求和/悔棋请求，防止对已结束对局继续响应
    room.draw = undefined;
    room.takeback = undefined;
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

  broadcast(room.code, {
    type: "move",
    move,
    fen: res.fen,
    turn: room.turn,
    gameOver: room.gameOver,
    result,
    clocks: { ...room.clocks },
  });
  if (result) {
    // 结果播报随聊天事件即时下发（快照里的 chat 客户端要等全量 state 才能看到）
    broadcastSystemChat(room, resultMessage(result));
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
  room.draw = undefined;
  room.takeback = undefined;
  broadcast(room.code, { type: "resign", by: player.color, result });
  broadcastSystemChat(room, resultMessage(result));
  return { ok: true, result };
}

// ============ 求和 ============
export function drawOfferAction(code: string, playerId: string) {
  const room = rooms.get(code.toUpperCase());
  if (!room || room.status !== "playing" || room.gameOver)
    return { ok: false, error: "当前不可提议和棋" };
  const player = findPlayer(room, playerId);
  if (!player) return { ok: false, error: "玩家不存在" };
  if (room.draw?.pending) return { ok: false, error: "已有待处理的和棋请求" };
  room.draw = { by: player.color, pending: true };
  broadcast(room.code, { type: "draw_offer", by: player.color });
  // 人机模式：AI 拒绝和棋（保持对弈；简单启发不复杂化）
  if (playerByColor(room, invertColor(player.color))?.isAI) {
    room.draw = undefined;
    broadcast(room.code, { type: "draw_declined", by: invertColor(player.color) });
  }
  return { ok: true };
}

export function drawRespondAction(code: string, playerId: string, action: "accept" | "decline") {
  const room = rooms.get(code.toUpperCase());
  if (!room || !room.draw || !room.draw.pending)
    return { ok: false, error: "没有待处理的和棋请求" };
  // 对局已结束（将死/超时/认输在请求挂起期间落地）时拒绝响应，防止改写已定结果
  if (room.status !== "playing" || room.gameOver) return { ok: false, error: "对局已结束" };
  const player = findPlayer(room, playerId);
  if (!player) return { ok: false, error: "玩家不存在" };
  if (player.color === room.draw.by) return { ok: false, error: "不能对自己的请求进行操作" };

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
    room.takeback = undefined;
    broadcast(room.code, { type: "draw_accepted", result });
    broadcastSystemChat(room, resultMessage(result));
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
  if (room.moves.length === 0) return { ok: false, error: "还没有可悔的棋" };
  if (room.takeback?.pending) return { ok: false, error: "已有待处理的悔棋请求" };
  room.takeback = { by: player.color, pending: true };
  broadcast(room.code, { type: "takeback_request", by: player.color });
  // 人机模式：AI 同意悔棋（人类请求悔 AI 的上一步）。走错一步不至于毁掉整局。
  const responder = playerByColor(room, invertColor(player.color));
  if (responder?.isAI) {
    // 走内部逻辑直接复用响应路径（含终局守卫、退钟、广播）
    takebackRespondAction(code, responder.id, "accept");
  }
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
  // 对局已结束时拒绝响应，防止悔棋回退棋盘但结果仍为已结束的矛盾状态
  if (room.status !== "playing" || room.gameOver) return { ok: false, error: "对局已结束" };
  const player = findPlayer(room, playerId);
  if (!player) return { ok: false, error: "玩家不存在" };
  if (player.color === room.takeback.by) return { ok: false, error: "不能对自己的请求进行操作" };

  if (action === "accept") {
    if (room.moves.length > 0) {
      const last = room.moves.pop()!;
      room.currentFen = room.moves.length ? room.moves[room.moves.length - 1].fen : START_FEN;
      room.turn = room.moves.length
        ? invertColor(room.moves[room.moves.length - 1].playedBy)
        : "white";
      // 回退时钟到被悔着法之前的状态：否则被回退方要替对手的思考时间买单
      if (last.clocksBefore) room.clocks = { ...last.clocksBefore };
    } else {
      room.currentFen = START_FEN;
      room.turn = "white";
    }
    room.takeback = undefined;
    room.chess = createGame(room.currentFen);
    // 悔棋重置计时基准：从悔棋生效的时刻重新起算
    room.clockUpdatedAt = now();
    const moves = room.moves.map((m) => ({ ...m }));
    broadcast(room.code, {
      type: "takeback_accepted",
      fen: room.currentFen,
      moves,
      turn: room.turn,
      clocks: { ...room.clocks },
    });
    return { ok: true };
  } else {
    room.takeback = undefined;
    broadcast(room.code, { type: "takeback_declined", by: player.color });
    return { ok: true };
  }
}

// ============ 超时 ============
/** 容差：抵消客户端倒计时与网络延迟的误差 */
const TIMEOUT_TOLERANCE_MS = 200;

/**
 * 上报超时。任一在场玩家可上报任一方的超时（对方关页也能按钟获胜），
 * 服务端用权威时钟复核：仅当被判方时钟确实耗尽才生效。
 */
export function timeoutAction(code: string, playerId: string, target?: Color) {
  const room = rooms.get(code.toUpperCase());
  if (!room || room.status !== "playing" || room.gameOver)
    return { ok: false, error: "当前不可判超时" };
  const reporter = findPlayer(room, playerId);
  if (!reporter) return { ok: false, error: "玩家不存在" };
  if (room.timeLimit === 0) return { ok: false, error: "本局不限时" };

  const loserColor = target ?? reporter.color;
  const loser = playerByColor(room, loserColor);
  if (!loser) return { ok: false, error: "玩家不存在" };

  if (room.turn === loserColor) {
    // 轮到被判方：时钟在走，扣减自上次扣时以来的耗时再比较
    const elapsed = now() - room.clockUpdatedAt;
    const remaining = Math.max(0, room.clocks[loserColor] - elapsed);
    if (remaining > TIMEOUT_TOLERANCE_MS) return { ok: false, error: "尚未超时" };
  } else {
    // 停表方：钟面有余量说明其在时内完成了上一步，不应被追判；
    // 钟面恰好为 0（走子时耗尽）视为旗子已倒，可判负
    if (room.clocks[loserColor] > 0) return { ok: false, error: "该方时钟未耗尽" };
  }

  const result: GameResult = {
    gameNo: room.gameNo,
    winner: invertColor(loserColor),
    reason: "timeout",
    endedAt: now(),
  };
  room.gameOver = true;
  room.status = "finished";
  room.finishedAt = now();
  room.result = result;
  room.draw = undefined;
  room.takeback = undefined;
  broadcast(room.code, { type: "timeout", by: loserColor, result });
  broadcastSystemChat(room, resultMessage(result));
  return { ok: true, result };
}

/** 走子请求晚于时钟耗尽（超出容差）到达：该步无效，走子方判负 */
function timeoutByMoveLateness(room: Room, loserColor: Color): MoveOutcome {
  const result: GameResult = {
    gameNo: room.gameNo,
    winner: invertColor(loserColor),
    reason: "timeout",
    endedAt: now(),
  };
  room.gameOver = true;
  room.status = "finished";
  room.finishedAt = now();
  room.result = result;
  room.draw = undefined;
  room.takeback = undefined;
  broadcast(room.code, { type: "timeout", by: loserColor, result });
  broadcastSystemChat(room, resultMessage(result));
  return { ok: false, error: "您已超时，对局结束", result };
}

// ============ 再来一局 ============
export function rematchAction(code: string, playerId: string) {
  const room = rooms.get(code.toUpperCase());
  if (!room) return { ok: false, error: "房间不存在" };
  if (room.status !== "finished") return { ok: false, error: "当前对局尚未结束" };
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
  room.clocks = { white: room.timeLimit * 1000, black: room.timeLimit * 1000 };
  room.clockUpdatedAt = now();
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
    white: publicPlayer(white),
    black: publicPlayer(black),
  });
  return { ok: true };
}

// ============ 在线状态 ============
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

/** SSE 短暂断开（如 Serverless 函数超时后重连）的离线宽限期 */
const DISCONNECT_GRACE_MS = 10_000;

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

/** 房间被清扫时清掉残留的连接计数，防止 Map 泄漏 */
function presenceDropRoom(keyPrefix: string): void {
  // key 形如 CODE:playerId；清扫时房间已删，逐 key 前缀匹配删除
  for (const key of connectionCounts.keys()) {
    if (key.startsWith(keyPrefix)) connectionCounts.delete(key);
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
