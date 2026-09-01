import type { ChatMessage, GameResult, Player, RoomState } from "@/types";
import { broadcast } from "../realtime";
import { MAX_CHAT_HISTORY } from "./constants";
import { genId, now, type Room } from "./room";

/**
 * 快照（对外下发）。players[].id 一律置空：playerId 是走子/认输等操作的唯一凭证，
 * 只能通过创建/加入的私有响应下发给本人，绝不能随快照/广播泄露给观战者或对手。
 * 客户端凭 sessionStorage 中的 lobby 身份识别自己（myColor），无需他人 id。
 */
export function snapshot(room: Room): RoomState {
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

/** 对外下发用的玩家对象（隐去 id 凭证） */
export function publicPlayer(p: Player): Player {
  return { ...p, id: "" };
}

export function systemChat(room: Room, text: string): ChatMessage {
  const msg: ChatMessage = { id: genId(), from: "系统", text, at: now(), system: true };
  room.chat.push(msg);
  // 聊天记录封顶，防单房间内存无限增长
  if (room.chat.length > MAX_CHAT_HISTORY) room.chat.splice(0, room.chat.length - MAX_CHAT_HISTORY);
  return msg;
}

/** 结果播报写入聊天并广播（否则客户端要等下次全量快照才能看到） */
export function broadcastSystemChat(room: Room, text: string): void {
  broadcast(room.code, { type: "chat", message: systemChat(room, text) });
}

const REASON_TEXT: Record<GameResult["reason"], string> = {
  checkmate: "将死",
  resignation: "认输",
  timeout: "超时",
  draw: "协议和棋",
  stalemate: "逼和（无子可动）",
  insufficient: "子力不足",
  threefold: "三次重复局面",
  fifty: "50 步规则",
};

export function resultMessage(r: GameResult): string {
  const winnerText = r.winner ? (r.winner === "white" ? "白方" : "黑方") : "";
  if (r.winner) return `${winnerText}胜（${REASON_TEXT[r.reason]}）`;
  return `和棋（${REASON_TEXT[r.reason]}）`;
}
