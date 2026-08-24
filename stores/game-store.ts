import { create } from "zustand";
import {
  applyMove,
  createGame,
  generatePgn,
  invertColor,
} from "@/lib/chess-engine";
import { chooseAIMove } from "@/lib/ai-engine";
import type {
  ChatMessage,
  Color,
  GameResult,
  MoveRecord,
  Player,
  RoomEvent,
  RoomStatus,
  TimeLimit,
  Clocks,
} from "@/types";

export interface BoardTheme {
  id: string;
  name: string;
  light: string;
  dark: string;
}

export const BOARD_THEMES: BoardTheme[] = [
  { id: "classic", name: "经典", light: "#eeeed2", dark: "#769656" },
  { id: "blue", name: "蓝调", light: "#dbe4ef", dark: "#4a6fa5" },
  { id: "green", name: "森林", light: "#e8f0d8", dark: "#5b8c4a" },
  { id: "gray", name: "灰阶", light: "#e9e9e9", dark: "#7d7d7d" },
];

interface LobbyInfo {
  code: string;
  playerId: string;
  myColor: Color;
  myName: string;
  mode: "friend" | "ai";
  aiPlayerId?: string;
  aiDifficulty?: number;
}

interface GameStore {
  // 大厅/身份
  code: string;
  playerId: string;
  myColor: Color | null;
  myName: string;
  mode: "friend" | "ai";
  aiPlayerId: string | null;
  aiDifficulty: number;

  // 房间状态
  status: RoomStatus;
  timeLimit: TimeLimit;
  gameNo: number;
  white: Player | null;
  black: Player | null;
  fen: string;
  turn: Color;
  clocks: Clocks | null;
  clockUpdatedAt: number;
  gameOver: boolean;
  result?: GameResult;
  moves: MoveRecord[];
  chat: ChatMessage[];
  drawOfferBy: Color | null;
  takebackBy: Color | null;
  opponentConnected: boolean;

  // 交互
  selectedSquare: string | null;
  legalTargets: string[];
  pendingPromotion: { from: string; to: string } | null;
  soundEnabled: boolean;
  theme: BoardTheme;
  error: string | null;
  viewIndex: number | null;
  setViewIndex: (i: number | null) => void;
  goToLive: () => void;
  toast: string | null;

  // actions
  setLobby: (info: LobbyInfo) => void;
  handleEvent: (e: RoomEvent) => void;
  selectSquare: (sq: string) => void;
  setLegalTargets: (sqs: string[]) => void;
  setPendingPromotion: (p: { from: string; to: string } | null) => void;
  clearSelection: () => void;
  setSoundEnabled: (v: boolean) => void;
  setTheme: (t: BoardTheme) => void;
  setToast: (t: string | null) => void;

  move: (from: string, to: string, promotion?: string) => Promise<void>;
  sendChat: (text: string) => Promise<void>;
  resign: () => Promise<void>;
  offerDraw: () => Promise<void>;
  respondDraw: (accept: boolean) => Promise<void>;
  requestTakeback: () => Promise<void>;
  respondTakeback: (accept: boolean) => Promise<void>;
  rematch: () => Promise<void>;
  declareTimeout: () => Promise<void>;
}

const INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function playerOf(state: GameStore, color: Color): Player | null {
  return color === "white" ? state.white : state.black;
}

export const useGameStore = create<GameStore>((set, get) => ({
  code: "",
  playerId: "",
  myColor: null,
  myName: "",
  mode: "friend",
  aiPlayerId: null,
  aiDifficulty: 2,

  status: "waiting",
  timeLimit: 600,
  gameNo: 1,
  white: null,
  black: null,
  fen: INITIAL_FEN,
  turn: "white",
  clocks: null,
  clockUpdatedAt: 0,
  gameOver: false,
  result: undefined,
  moves: [],
  chat: [],
  drawOfferBy: null,
  takebackBy: null,
  opponentConnected: true,

  selectedSquare: null,
  legalTargets: [],
  pendingPromotion: null,
  soundEnabled: true,
  theme: BOARD_THEMES[0],
  error: null,
  viewIndex: null,
  toast: null,

  setLobby: (info) =>
    set({
      code: info.code,
      playerId: info.playerId,
      myColor: info.myColor,
      myName: info.myName,
      mode: info.mode,
      aiPlayerId: info.aiPlayerId ?? null,
      aiDifficulty: info.aiDifficulty ?? 2,
    }),

  handleEvent: (e) => {
    switch (e.type) {
      case "state":
        applyRoom(set, e.room);
        break;
      case "game_start":
        set({
          status: "playing",
          fen: e.fen,
          turn: e.turn,
          clocks: { white: e.timeLimit * 1000, black: e.timeLimit * 1000 },
          clockUpdatedAt: Date.now(),
          timeLimit: e.timeLimit,
          white: e.white,
          black: e.black,
          myColor: syncMyColor([e.white, e.black], get().myColor, get().playerId),
          moves: [],
          chat: [],
          gameOver: false,
          result: undefined,
          drawOfferBy: null,
          takebackBy: null,
          gameNo: 1,
          opponentConnected: true,
        });
        break;
      case "player_joined":
        applyRoom(set, e.room);
        break;
      case "move": {
        const st = get();
        if (st.moves.some((m) => m.moveNumber === e.move.moveNumber)) break; // 乐观更新已存在
        set({
          fen: e.fen,
          turn: e.turn,
          moves: [...st.moves, e.move],
          gameOver: e.gameOver,
          result: e.result ?? st.result,
          selectedSquare: null,
          legalTargets: [],
          pendingPromotion: null,
          clockUpdatedAt: Date.now(),
        });
        break;
      }
      case "chat":
        set((s) => ({ chat: [...s.chat, e.message] }));
        break;
      case "resign":
        set({ gameOver: true, result: e.result, status: "finished", drawOfferBy: null, takebackBy: null });
        break;
      case "draw_offer":
        set({ drawOfferBy: e.by });
        break;
      case "draw_accepted":
        set({ gameOver: true, result: e.result, status: "finished", drawOfferBy: null });
        break;
      case "draw_declined":
        set({ drawOfferBy: null });
        break;
      case "takeback_request":
        set({ takebackBy: e.by });
        break;
      case "takeback_accepted":
        set({ fen: e.fen, moves: e.moves, turn: e.turn, takebackBy: null, selectedSquare: null, legalTargets: [] });
        break;
      case "takeback_declined":
        set({ takebackBy: null });
        break;
      case "timeout":
        set({ gameOver: true, result: e.result, status: "finished" });
        break;
      case "rematch":
        set({
          status: "playing",
          gameNo: e.gameNo,
          fen: e.fen,
          turn: e.turn,
          clocks: { white: e.timeLimit * 1000, black: e.timeLimit * 1000 },
          clockUpdatedAt: Date.now(),
          timeLimit: e.timeLimit,
          white: e.white,
          black: e.black,
          myColor: syncMyColor([e.white, e.black], get().myColor, get().playerId),
          moves: [],
          chat: [],
          gameOver: false,
          result: undefined,
          drawOfferBy: null,
          takebackBy: null,
          opponentConnected: true,
        });
        break;
      case "opponent_left":
        set({ opponentConnected: false });
        break;
    }
    // 对局结束 → 写入本地历史
    if (get().result && get().gameOver) recordHistory();
    // 人机模式：若轮到 AI，自动走子
    triggerAIMoveIfNeeded();
  },

  selectSquare: (sq) => set({ selectedSquare: sq }),
  setLegalTargets: (sqs) => set({ legalTargets: sqs }),
  setPendingPromotion: (p) => set({ pendingPromotion: p }),
  clearSelection: () => set({ selectedSquare: null, legalTargets: [] }),
  setSoundEnabled: (v) => set({ soundEnabled: v }),
  setTheme: (t) => set({ theme: t }),
  setToast: (t) => set({ toast: t }),
  setViewIndex: (i) => set({ viewIndex: i }),
  goToLive: () => set({ viewIndex: null, selectedSquare: null, legalTargets: [] }),

  move: async (from, to, promotion) => {
    const st = get();
    if (!st.code || !st.playerId) return;
    if (st.gameOver || st.turn !== st.myColor) return;

    // 乐观更新（本地即时反馈）
    const tmp = createGame(st.fen);
    const r = applyMove(tmp, { from, to, promotion });
    if (!r.ok) {
      set({ error: r.error ?? "非法走子" });
      return;
    }
    set({ fen: r.fen!, turn: invertColor(st.turn), selectedSquare: null, legalTargets: [], pendingPromotion: null });

    try {
      const res = await fetch(`/api/rooms/${st.code}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: st.playerId, from, to, promotion }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        set({ error: data.error ?? "走子失败" });
        await resync(set, get);
      }
    } catch {
      set({ error: "网络错误" });
    }
  },

  sendChat: async (text) => {
    const st = get();
    if (!st.code || !st.playerId) return;
    try {
      await fetch(`/api/rooms/${st.code}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: st.playerId, text }),
      });
    } catch {
      set({ error: "聊天发送失败" });
    }
  },

  resign: async () => {
    const st = get();
    if (!st.code || !st.playerId) return;
    await postAction(set, `/api/rooms/${st.code}/resign`, { playerId: st.playerId });
  },

  offerDraw: async () => {
    const st = get();
    if (!st.code || !st.playerId) return;
    await postAction(set, `/api/rooms/${st.code}/draw`, { playerId: st.playerId });
  },

  respondDraw: async (accept) => {
    const st = get();
    if (!st.code || !st.playerId) return;
    await postAction(set, `/api/rooms/${st.code}/draw`, {
      playerId: st.playerId,
      action: accept ? "accept" : "decline",
    });
  },

  requestTakeback: async () => {
    const st = get();
    if (!st.code || !st.playerId) return;
    await postAction(set, `/api/rooms/${st.code}/takeback`, { playerId: st.playerId });
  },

  respondTakeback: async (accept) => {
    const st = get();
    if (!st.code || !st.playerId) return;
    await postAction(set, `/api/rooms/${st.code}/takeback`, {
      playerId: st.playerId,
      action: accept ? "accept" : "decline",
    });
  },

  rematch: async () => {
    const st = get();
    if (!st.code || !st.playerId) return;
    await postAction(set, `/api/rooms/${st.code}/rematch`, { playerId: st.playerId });
  },

  declareTimeout: async () => {
    const st = get();
    if (!st.code || !st.playerId) return;
    await postAction(set, `/api/rooms/${st.code}/timeout`, { playerId: st.playerId });
  },
}));

// ===== 内部工具 =====
function buildPgnFromState(): string {
  const st = useGameStore.getState();
  const chess = createGame();
  for (const m of st.moves) {
    try {
      chess.move({ from: m.from, to: m.to, promotion: m.promotion as any });
    } catch {
      /* skip */
    }
  }
  const res = st.result;
  const resultStr = res
    ? res.winner
      ? res.winner === "white"
        ? "1-0"
        : "0-1"
      : "1/2-1/2"
    : "*";
  return generatePgn(chess, {
    white: st.white?.name ?? "白方",
    black: st.black?.name ?? "黑方",
    result: resultStr,
  });
}

function recordHistory() {
  if (typeof window === "undefined") return;
  const st = useGameStore.getState();
  if (!st.code || !st.result) return;
  try {
    const key = "chess-arena-history";
    const raw = localStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];
    const id = `${st.code}-${st.gameNo}`;
    if (list.some((h: any) => h.id === id)) return;
    list.unshift({
      id,
      code: st.code,
      gameNo: st.gameNo,
      white: st.white?.name ?? "白方",
      black: st.black?.name ?? "黑方",
      result: st.result,
      endedAt: st.result.endedAt,
      pgn: buildPgnFromState(),
    });
    localStorage.setItem(key, JSON.stringify(list.slice(0, 50)));
  } catch {
    /* ignore */
  }
}

function applyRoom(
  set: (partial: Partial<GameStore>) => void,
  room: import("@/types").RoomState
) {
  const st = useGameStore.getState();
  const me = room.players.find((p) => p.id === st.playerId);
  set({
    status: room.status,
    timeLimit: room.timeLimit,
    gameNo: room.gameNo,
    white: room.players.find((p) => p.color === "white") ?? null,
    black: room.players.find((p) => p.color === "black") ?? null,
    myColor: me ? me.color : st.myColor,
    fen: room.currentFen,
    turn: room.turn,
    clocks: room.clocks ?? null,
    clockUpdatedAt: room.clockUpdatedAt ?? 0,
    gameOver: room.gameOver,
    result: room.result,
    moves: room.moves,
    chat: room.chat,
    drawOfferBy: room.draw?.by ?? null,
    takebackBy: room.takeback?.by ?? null,
    opponentConnected: room.players.some((p) => p.color !== "white" && p.connected) ||
      room.players.length < 2
      ? room.players.filter((p) => p.color !== "white").every((p) => p.connected)
      : true,
  });
}

async function postAction(
  set: (partial: Partial<GameStore>) => void,
  url: string,
  body: unknown
) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      set({ error: data.error ?? "操作失败" });
    }
  } catch {
    set({ error: "网络错误" });
  }
}

async function resync(
  set: (partial: Partial<GameStore>) => void,
  get: () => GameStore
) {
  const st = get();
  if (!st.code) return;
  try {
    const res = await fetch(`/api/rooms/${st.code}`);
    if (res.ok) {
      const room = (await res.json()) as import("@/types").RoomState;
      applyRoom(set, room);
    }
  } catch {
    /* ignore */
  }
}

/** 在新局面中按当前身份(playerId)重新计算我方颜色（交换先后手后颜色会翻转） */
function syncMyColor(
  players: Player[] | undefined,
  current: Color | null,
  playerId: string
): Color | null {
  if (!players) return current;
  const me = players.find((p) => p.id === playerId);
  return me ? me.color : current;
}

/** 供 hook 在 AI 回合触发走子 */
export function triggerAIMoveIfNeeded(): void {
  const st = useGameStore.getState();
  if (st.mode !== "ai" || !st.aiPlayerId) return;
  if (st.gameOver || st.status !== "playing") return;

  // AI 执子方不固定：新一局交换先后手后 AI 可能执白
  const aiPlayer = st.white?.isAI ? st.white : st.black?.isAI ? st.black : null;
  if (!aiPlayer || st.turn !== aiPlayer.color) return;

  const fen = st.fen;
  const aiPlayerId = aiPlayer.id;
  const code = st.code;
  // 模拟思考延迟，体验更自然
  setTimeout(async () => {
    const move = chooseAIMove(fen, st.aiDifficulty);
    if (!move) return;
    try {
      await fetch(`/api/rooms/${code}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: aiPlayerId, from: move.from, to: move.to, promotion: move.promotion }),
      });
    } catch {
      /* ignore */
    }
  }, 500 + Math.random() * 600);
}
