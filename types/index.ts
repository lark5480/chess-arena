// ===== 基础类型 =====
export type Color = "white" | "black";

/** 时限选项（秒）：0 = 无限制 */
export type TimeLimit = 0 | 300 | 600 | 900;

export type RoomStatus = "waiting" | "playing" | "finished";

export type GameResultReason =
  | "checkmate"
  | "resignation"
  | "timeout"
  | "draw"
  | "stalemate"
  | "insufficient"
  | "threefold"
  | "fifty";

// ===== 实体 =====
export interface Player {
  id: string;
  name: string;
  color: Color;
  connected: boolean;
  isAI?: boolean;
  avatar?: string; // emoji
}

export interface MoveRecord {
  moveNumber: number; // 棋手回合序号（白黑各算一步，从 1 开始）
  san: string; // 标准代数记谱，如 "e4" / "Nf3" / "O-O"
  fen: string; // 走子后的完整 FEN
  from: string;
  to: string;
  promotion?: string;
  playedBy: Color;
  playedAt: number;
}

export interface ChatMessage {
  id: string;
  from: string; // 发送者昵称
  color?: Color; // 发送方颜色（系统消息无）
  text: string;
  at: number;
  system?: boolean;
}

export interface GameResult {
  gameNo: number;
  winner: Color | null; // null = 和棋
  reason: GameResultReason;
  endedAt: number;
}

export interface TakebackRequest {
  by: Color;
  pending: boolean;
}

export interface DrawOffer {
  by: Color;
  pending: boolean;
}

// ===== 房间全量状态（SSE 重连快照 / GET 返回） =====
export interface RoomState {
  code: string;
  status: RoomStatus;
  timeLimit: TimeLimit;
  createdAt: number;
  finishedAt?: number;
  gameNo: number;
  currentFen: string;
  turn: Color;
  players: Player[];
  moves: MoveRecord[];
  chat: ChatMessage[];
  gameOver: boolean;
  result?: GameResult;
  takeback?: TakebackRequest;
  draw?: DrawOffer;
}

// ===== SSE 事件（服务端 → 客户端） =====
export type RoomEvent =
  | { type: "state"; room: RoomState }
  | { type: "player_joined"; player: Player; room: RoomState }
  | { type: "game_start"; fen: string; turn: Color; timeLimit: TimeLimit; white: Player; black: Player }
  | { type: "move"; move: MoveRecord; fen: string; turn: Color; gameOver: boolean; result?: GameResult }
  | { type: "chat"; message: ChatMessage }
  | { type: "resign"; by: Color; result: GameResult }
  | { type: "draw_offer"; by: Color }
  | { type: "draw_accepted"; result: GameResult }
  | { type: "draw_declined"; by: Color }
  | { type: "takeback_request"; by: Color }
  | { type: "takeback_accepted"; fen: string; moves: MoveRecord[]; turn: Color }
  | { type: "takeback_declined"; by: Color }
  | { type: "timeout"; by: Color; result: GameResult }
  | { type: "rematch"; gameNo: number; fen: string; turn: Color; timeLimit: TimeLimit; white: Player; black: Player }
  | { type: "opponent_left"; color: Color };

// ===== API 请求/响应 =====
export interface CreateRoomRequest {
  name?: string;
  timeLimit?: TimeLimit;
  avatar?: string;
}
export interface CreateRoomResponse {
  code: string;
  playerId: string;
  color: Color;
}

export interface JoinRoomRequest {
  name?: string;
  avatar?: string;
}
export interface JoinRoomResponse {
  code: string;
  playerId: string;
  color: Color;
  room: RoomState;
}

export interface MoveRequest {
  playerId: string;
  from: string;
  to: string;
  promotion?: string;
}

export interface ChatRequest {
  playerId: string;
  text: string;
}

export interface SimpleActionRequest {
  playerId: string;
  /** draw/takeback 的 accept/decline 也复用此字段做动作区分 */
  action?: "offer" | "accept" | "decline" | "request";
}

// ===== 大厅身份信息（客户端 sessionStorage 持久化） =====
export interface LobbyInfo {
  code: string;
  playerId: string;
  myColor: Color;
  myName: string;
  mode: "friend" | "ai";
  aiPlayerId?: string;
}
